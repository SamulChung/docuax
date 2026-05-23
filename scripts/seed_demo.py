"""관리자 콘솔 데모 시드.

실행 시:
  - 가짜 사용자 8명 (다양한 플랜)
  - 14일 분산된 변환 기록 ~62건
  - 매크로 사용 로그 ~210건
  - 감사 로그 (login·register 등) ~50건
  - 조직 프로파일 2건
  - 프롬프트 12건

박사님이 admin 이메일로 가입만 하시면, /admin 페이지에서 풍부한 데이터를 볼 수 있습니다.

사용:
  cd apps/backend && python ../../scripts/seed_demo.py
"""
from __future__ import annotations

import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# apps/backend 를 path 에 추가
BACKEND = Path(__file__).resolve().parent.parent / "apps" / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from app.core.logging import configure_logging
configure_logging()

from app.db import get_db, init_db  # noqa: E402
from app.models import AuditLog, ConversionRun, Document, MacroLog, User  # noqa: E402
from app.services.auth import hash_password  # noqa: E402
from app.services.organization_profile import create_profile  # noqa: E402
from app.services.prompt_library import bulk_create as bulk_create_prompts  # noqa: E402

random.seed(42)


# ─────────────────────────────────────────────────────────────────────────────
# 가짜 사용자 명단
# ─────────────────────────────────────────────────────────────────────────────
DEMO_USERS = [
    # (email, name, plan)
    ("kim.minjun@gov.kr",      "김민준 사무관",   "enterprise"),
    ("park.suji@bigfin.co.kr", "박수지 차장",     "team"),
    ("lee.junho@startup.io",   "이준호 CTO",      "team"),
    ("choi.yeji@consult.co.kr","최예지 매니저",   "pro"),
    ("jung.donghyun@city.kr",  "정동현 주무관",   "enterprise"),
    ("seo.minah@univ.ac.kr",   "서민아 연구원",   "pro"),
    ("kang.jihoon@manuf.co.kr","강지훈 부장",     "free"),
    ("yoon.haeun@hospital.kr", "윤하은 행정직",   "free"),
]

# ─────────────────────────────────────────────────────────────────────────────
# 매크로 사용 빈도 (현실에 가깝게)
# ─────────────────────────────────────────────────────────────────────────────
MACRO_FREQUENCY = {
    "T1": 28, "T3": 18, "T8": 12, "T15": 6,
    "S2": 14, "S5": 9,
    "B11": 22, "B14": 17, "B5": 11,
    "G3": 19, "G7": 8,
    "N1": 12, "N2": 9, "N3": 7,
    "R3": 24, "R7": 16, "R9": 11,
    "P1": 9, "P3": 5,
}


def _ago(days: float) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


async def seed():
    print("DocuAX 관리자 데모 시드 시작…")
    await init_db()

    async for db in get_db():
        # 1) 사용자
        print("\n[1] 사용자 시드…")
        users: list[User] = []
        # 다양한 가입일 분포
        for i, (email, name, plan) in enumerate(DEMO_USERS):
            # 가장 최근에 가입한 사람이 첫 번째에 오도록
            created_days_ago = random.uniform(1, 60) if i > 0 else random.uniform(0.5, 6)
            user = User(
                email=email,
                name=name,
                plan=plan,
                password_hash=hash_password("demo1234abcd"),
                opt_in_training=random.random() < 0.45,
                created_at=_ago(created_days_ago),
                last_login=_ago(random.uniform(0, 8)) if random.random() < 0.75 else None,
            )
            db.add(user)
            users.append(user)
        await db.commit()
        for u in users:
            await db.refresh(u)
        print(f"  {len(users)}명 등록 완료")

        # 2) 문서 + 변환 기록 (지난 14일 분포)
        print("\n[2] 변환 기록 시드…")
        runs_total = 0
        for u in users:
            # 플랜별 변환량 차등
            n_runs = {
                "enterprise": random.randint(8, 16),
                "team": random.randint(4, 10),
                "pro": random.randint(2, 6),
                "free": random.randint(0, 3),
            }[u.plan]
            for _ in range(n_runs):
                days_ago = random.uniform(0, 14)
                # 최근 일자에 가중치
                if random.random() < 0.4:
                    days_ago = random.uniform(0, 4)
                doc = Document(
                    id=uuid.uuid4().hex,
                    user_id=u.id,
                    title=f"보고서 {random.randint(1, 200)}",
                    document_class=random.choice(["보고서", "공문", "제안서", "회의록", "일반"]),
                    persona_mode=random.choice(["worker", "heavy"]),
                    created_at=_ago(days_ago),
                    updated_at=_ago(days_ago),
                )
                db.add(doc)
                run = ConversionRun(
                    document_id=doc.id,
                    model_version="mock:demo-v1",
                    latency_ms=random.uniform(280, 1450),
                    token_count=random.randint(120, 1800),
                    persona_mode=doc.persona_mode,
                    review_tags={
                        "red": random.randint(0, 4),
                        "blue": random.randint(2, 8),
                        "yellow": random.randint(3, 12),
                    },
                    timings_ms={"1_parse": random.uniform(0.3, 2.0), "4_review_tag": random.uniform(0.4, 1.5)},
                    created_at=_ago(days_ago),
                )
                db.add(run)
                runs_total += 1
        await db.commit()
        print(f"  변환 {runs_total}건 + 문서 {runs_total}건 등록")

        # 3) 매크로 로그
        print("\n[3] 매크로 로그 시드…")
        # 위 변환 기록을 다시 조회
        from sqlalchemy import select
        all_docs = (await db.execute(select(Document))).scalars().all()
        macro_count = 0
        for doc in all_docs:
            # 문서당 0~6개 매크로
            n_macros = random.choices([0, 1, 2, 3, 4, 5, 6], weights=[2, 5, 7, 5, 3, 2, 1])[0]
            for _ in range(n_macros):
                macro_id = random.choices(
                    list(MACRO_FREQUENCY.keys()),
                    weights=list(MACRO_FREQUENCY.values()),
                )[0]
                m = MacroLog(
                    document_id=doc.id,
                    user_id=doc.user_id,
                    macro_id=macro_id,
                    params={"selected_block_ids": [f"b{random.randint(1, 12)}"]},
                    ai_assisted=macro_id.startswith(("R", "T1", "G", "B11", "B14")),
                    persona_mode=doc.persona_mode,
                    executed_at=doc.created_at + timedelta(seconds=random.randint(5, 600)),
                )
                db.add(m)
                macro_count += 1
        await db.commit()
        print(f"  매크로 실행 {macro_count}건")

        # 4) 감사 로그
        print("\n[4] 감사 로그 시드…")
        audit_count = 0
        # 모든 가입은 audit 에 기록
        for u in users:
            db.add(AuditLog(
                at=u.created_at,
                user_id=u.id,
                user_email=u.email,
                action="auth.register",
                status="ok",
                ip=f"172.16.{random.randint(0, 99)}.{random.randint(2, 254)}",
                user_agent="Mozilla/5.0 ...",
            ))
            audit_count += 1
            # 로그인 여러 번
            n_logins = random.randint(2, 8)
            for _ in range(n_logins):
                days_ago = random.uniform(0, 12)
                db.add(AuditLog(
                    at=_ago(days_ago),
                    user_id=u.id,
                    user_email=u.email,
                    action="auth.login",
                    status="ok",
                    ip=f"172.16.{random.randint(0, 99)}.{random.randint(2, 254)}",
                ))
                audit_count += 1
        # 로그인 실패 몇 건
        for _ in range(6):
            target = random.choice(users)
            db.add(AuditLog(
                at=_ago(random.uniform(0, 10)),
                user_id=None,
                user_email=target.email,
                action="auth.login",
                status="denied",
                ip=f"203.{random.randint(20, 60)}.{random.randint(0, 255)}.{random.randint(2, 254)}",
                detail={"reason": "비밀번호 불일치"},
            ))
            audit_count += 1
        # 변환·매크로 일부도 audit (요약 — 운영에선 자동)
        for _ in range(20):
            target = random.choice(users)
            db.add(AuditLog(
                at=_ago(random.uniform(0, 14)),
                user_id=target.id,
                user_email=target.email,
                action=random.choice(["convert", "macro.execute", "render.docx", "render.hwpx"]),
                resource_type="Document",
                resource_id=uuid.uuid4().hex[:12],
                status="ok",
                ip=f"172.16.{random.randint(0, 99)}.{random.randint(2, 254)}",
            ))
            audit_count += 1
        await db.commit()
        print(f"  감사 로그 {audit_count}건")

        break  # async for db

    # 5) 조직 프로파일 2건 (예시 — 박사님 회사 + 가상 고객사)
    print("\n[5] 조직 프로파일…")
    p1 = create_profile(
        name="DocuAX (자사)",
        slug="docuax",
        brand_color_hex="#1E2761",
        accent_color_hex="#1F5BAF",
        font_korean="함초롬바탕",
        font_korean_heading="함초롬돋움",
        h1_font_size_pt=20,
        header_text="DocuAX",
        footer_text="© 2026 DocuAX",
        prompt_label="DocuAX",
        is_public=True,
        created_by="admin@docuax.io",
        notes="회사 표준 양식",
    )
    p2 = create_profile(
        name="○○ 광역지자체 (예시 고객)",
        slug="example-city",
        brand_color_hex="#003876",
        accent_color_hex="#0066B3",
        font_korean="맑은 고딕",
        font_korean_heading="맑은 고딕",
        h1_font_size_pt=22,
        h2_font_size_pt=17,
        header_text="○○ 광역지자체",
        footer_text="○○ 광역지자체 행정문서",
        prompt_label="example-city",
        is_public=True,
        created_by="admin@docuax.io",
        notes="시범 운영 고객 양식",
    )
    print(f"  생성: {p1.name}, {p2.name}")

    # 6) 프롬프트 12건
    print("\n[6] 프롬프트…")
    prompts = []
    for i, (label, title, category, content) in enumerate([
        ("DocuAX", "주간보고 양식 생성", "보고서", "당신은 SaaS 회사의 PM입니다. 이번 주 핵심 성과·진행·이슈·다음 주 계획을 4섹션 보고서로 작성하세요."),
        ("DocuAX", "분기 실적 보고서 골격", "보고서", "분기 핵심 지표(매출·고객·NPS)를 표로 정리하고, 부진 항목 3가지의 원인·대응을 정리하세요."),
        ("DocuAX", "IR 자료 핵심 슬라이드", "사업기획", "회사 한 줄 소개·시장·문제·해결·진척·팀·자금사용을 7개 슬라이드 골격으로."),
        ("DocuAX", "사업 제안서 도입부", "제안서", "수신·발신·제안 배경·기대효과를 한국 공문 4단계 글머리로 작성."),
        ("DocuAX", "회의록 표준 양식", "회의록", "참석자·안건·논의·결의 사항 + 다음 회의 일정을 표준화."),
        ("DocuAX", "기술 RFP 응답 골격", "제안서", "기능 요구사항을 기술적·운영적·보안적 측면에서 답변."),
        ("example-city", "협조 요청 공문 (시청)", "공문", "수신·발신·근거·요청사항·기대효과 5단 구조로 작성. 한국 공문 글머리 사용."),
        ("example-city", "예산 요구서 (시청)", "공문", "사업개요·전년 실적·차년 계획·산출근거·B/C 분석·자금흐름을 포함."),
        ("example-city", "정책 제안서 골격", "제안서", "배경·목표·추진방안·B/C 분석·예산·거버넌스를 표준 5장 구조로."),
        ("example-city", "월간 통계 보고", "보고서", "전월 대비 주요 지표 변화와 원인 분석, 정책 시사점 3가지 제시."),
        ("example-city", "주민 안내문 작성", "공문", "친근하고 명확한 문체로 일정·장소·신청방법·문의처를 포함."),
        ("example-city", "감사 결과 보고", "보고서", "지적 사항·원인·시정 계획·일정을 표준 양식으로 작성."),
    ]):
        prompts.append({
            "title": title,
            "content": content,
            "description": f"DocuAX 데모 프롬프트 #{i+1}",
            "category": category,
            "tags": [category, label],
            "organization_label": label,
            "owner_id": "demo-seed",
            "shared_with_org": True,
            "source_filename": "seed_demo.py",
        })
    saved = bulk_create_prompts(prompts)
    print(f"  생성: {len(saved)}건 (DocuAX 6 + example-city 6)")

    print("\n────────────────────────────────────────────────")
    print("✓ 데모 시드 완료")
    print(f"  사용자: {len(DEMO_USERS)}명")
    print(f"  변환: {runs_total}건")
    print(f"  매크로: {macro_count}건")
    print(f"  감사로그: {audit_count}건")
    print(f"  조직 프로파일: 2건")
    print(f"  프롬프트: {len(saved)}건")
    print()
    print("관리자 계정으로 로그인하시면 즉시 풍부한 대시보드가 보입니다.")
    print("이 계정들의 비밀번호: 'demo1234abcd' (테스트 로그인 시 사용)")


if __name__ == "__main__":
    asyncio.run(seed())
