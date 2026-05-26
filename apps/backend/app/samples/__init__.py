"""DocuAX 샘플 라이브러리.

각 샘플은 (1) 메타데이터(SAMPLES 딕셔너리), (2) markdown 본문 파일(.md)로 구성.
프론트엔드 샘플 픽커가 카테고리별로 노출 → 사용자가 클릭하면 에디터에 로드.

샘플은 한국 기업·기관에서 그대로 편집해 사용할 수 있는 수준의 충실한 골격이며,
B2B 영업·운영의 핵심 문서 유형을 모두 커버한다.

새 샘플 추가:
1. samples/ 하위에 <id>.md 파일 작성
2. SAMPLES 리스트에 메타데이터 한 항목 추가
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel

_HERE = Path(__file__).parent


class SampleMeta(BaseModel):
    id: str
    title: str
    category: Literal["공문", "보고서", "제안서", "회의록", "메모", "사업기획", "콘텐츠", "기타"]
    description: str
    persona: Literal["worker", "heavy", "any"] = "any"
    icon: str = "📄"  # 픽커에 표시될 이모지
    tags: list[str] = []


class SampleDetail(SampleMeta):
    content: str


# ─────────────────────────────────────────────────────────────────────────────
# 메타데이터 — 카테고리 순서가 픽커 노출 순서
# ─────────────────────────────────────────────────────────────────────────────

SAMPLES: list[SampleMeta] = [
    # ── 사업기획·전략 ──
    SampleMeta(
        id="business-plan",
        title="3개년 사업계획서",
        category="사업기획",
        description="회사명·비전·시장분석·SWOT·재무추정·인력계획·위험관리 — 자금조달·이사회 보고용",
        persona="any",
        icon="📈",
        tags=["사업계획", "중기계획", "이사회", "투자유치"],
    ),
    SampleMeta(
        id="ir-pitch",
        title="IR 피치 (투자유치)",
        category="사업기획",
        description="시리즈 A 라운드용 — 회사·문제·해결·시장·진척·BM·재무·팀·조건",
        persona="any",
        icon="💎",
        tags=["IR", "투자유치", "시리즈A", "VC"],
    ),
    SampleMeta(
        id="market-analysis",
        title="시장 분석 보고서",
        category="사업기획",
        description="TAM/SAM/SOM·고객 세그먼트·경쟁 환경(Porter)·SWOT·트렌드 5선·전략 권고",
        persona="any",
        icon="📊",
        tags=["시장조사", "경쟁분석", "전략"],
    ),
    SampleMeta(
        id="feasibility-study",
        title="사업타당성 분석",
        category="사업기획",
        description="해외 진출 등 신규 사업 평가 — 시장성·기술성·재무성·법적·운영 종합 7.85/10",
        persona="any",
        icon="🔍",
        tags=["타당성", "신규사업", "해외진출", "B/C"],
    ),

    # ── 보고서 ──
    SampleMeta(
        id="weekly-report",
        title="주간 업무 보고",
        category="보고서",
        description="Done/Doing/Blocked + KPI 표 + 이슈·위험 + 다음주 계획 — 팀장 보고용",
        persona="worker",
        icon="📊",
        tags=["주간보고", "스타트업", "팀 보고"],
    ),
    SampleMeta(
        id="quarterly-report",
        title="분기 실적 보고서",
        category="보고서",
        description="대시보드 + 손익·영업·제품·인력·자금 - 위험모니터링 + 차분기 과제 (이사회·임원)",
        persona="any",
        icon="📋",
        tags=["분기보고", "실적", "이사회"],
    ),
    SampleMeta(
        id="annual-report",
        title="연간 사업보고서",
        category="보고서",
        description="경영요약·사업영역별 실적·재무·이슈·차년도 방향 — 이사회 결의 요청 양식",
        persona="any",
        icon="📚",
        tags=["연간보고", "결산", "주주총회", "이사회"],
    ),
    SampleMeta(
        id="rnd-report",
        title="R&D 결과 보고서",
        category="보고서",
        description="과제 개요·연구 내용·결과·한계·후속·예산 집행 — 정부과제 결과 보고 양식",
        persona="worker",
        icon="🔬",
        tags=["R&D", "연구", "정부과제", "특허"],
    ),
    SampleMeta(
        id="marketing-strategy",
        title="마케팅 전략 기획서",
        category="보고서",
        description="STP·4P·분기별 실행·예산·ROI·메시지 프레임 — 마케팅 임원 보고용",
        persona="worker",
        icon="🎯",
        tags=["마케팅", "전략", "STP", "4P"],
    ),

    # ── 제안서 ──
    SampleMeta(
        id="business-proposal",
        title="B2B 사업 제안서 (공공·기업)",
        category="제안서",
        description="배경·솔루션·추진방안·사업비·기대효과·보안·위험 — 4.5억원 입찰 양식",
        persona="any",
        icon="💼",
        tags=["입찰", "B2B", "공공", "제안서"],
    ),
    SampleMeta(
        id="policy-proposal",
        title="정책 제안서 (정부 제출)",
        category="제안서",
        description="배경·목표·추진방안·B/C 13.5 분석·예산·거버넌스 — 부처 정책사업 제안 양식",
        persona="heavy",
        icon="🏛️",
        tags=["정책", "정부제출", "공공", "디지털전환"],
    ),

    # ── 공문 ──
    SampleMeta(
        id="gongmun-cooperation",
        title="협조 요청 공문",
        category="공문",
        description="수신·발신·근거·요청사항·기대효과·보안 - 시범도입 협조 요청 표준 양식",
        persona="heavy",
        icon="📜",
        tags=["공공", "협조요청", "공문"],
    ),
    SampleMeta(
        id="gongmun-notice",
        title="안내·통보 공문",
        category="공문",
        description="행사 안내 표준 양식 — 일시·장소·일정·신청·유의사항 — 전사 워크숍 양식",
        persona="heavy",
        icon="📋",
        tags=["공공", "안내", "행사"],
    ),
    SampleMeta(
        id="budget-request",
        title="예산 요구서 (공공)",
        category="공문",
        description="사업개요·전년 실적·차년 계획·산출근거·B/C·자금흐름·위험관리 — 예산편성 양식",
        persona="heavy",
        icon="💰",
        tags=["예산", "공공", "예산편성"],
    ),

    # ── 회의록 ──
    SampleMeta(
        id="meeting-minutes",
        title="임원진 정기 회의록",
        category="회의록",
        description="참석자·안건·논의·결의·미결·다음회의 — 6개 안건 상세 + 결의 9건 — 이사회/임원진",
        persona="any",
        icon="🗒️",
        tags=["회의", "임원진", "이사회", "결의"],
    ),

    # ── 메모 ──
    SampleMeta(
        id="short-memo",
        title="내부 메모 (팀 스프린트)",
        category="메모",
        description="한 주 마무리·다음주 계획·블로커·회고 — 데일리/스프린트 짧은 메모 양식",
        persona="worker",
        icon="✏️",
        tags=["메모", "스프린트", "팀"],
    ),

    # ── 콘텐츠 (뉴스레터·영상기획·보도자료) ──
    SampleMeta(
        id="newsletter-template",
        title="조합원 뉴스레터 (役關目條分 + PASA)",
        category="콘텐츠",
        description="역관목조분 5요소 + PASA 4단 메시지 구조 — 농협·공공기관 뉴스레터 표준 골격",
        persona="worker",
        icon="📧",
        tags=["뉴스레터", "농협", "역관목조분", "PASA", "홍보"],
    ),
    SampleMeta(
        id="video-plan-template",
        title="홍보 영상 기획서 (1분 숏폼)",
        category="콘텐츠",
        description="후크 0~3초·메시지 3~50초·CTA 50~60초 — 9컷 스토리보드 + 자막 5원칙",
        persona="worker",
        icon="🎬",
        tags=["영상기획", "숏폼", "스토리보드", "SNS"],
    ),
    SampleMeta(
        id="press-release-template",
        title="보도자료 (언론 배포용)",
        category="콘텐츠",
        description="제목·부제목·본문·인용구·담당자 연락처 — A4 1.5페이지 표준 보도자료 양식",
        persona="worker",
        icon="📰",
        tags=["보도자료", "홍보", "언론", "PR"],
    ),
]


def list_samples() -> list[SampleMeta]:
    """SAMPLES 메타 + 실제 .md 파일이 존재하는 항목만.

    파일이 지워졌는데 메타 항목이 남아 있으면 프론트에서 404 가 나니까,
    파일 시스템을 진실로 삼아 필터링.
    """
    return [s for s in SAMPLES if (_HERE / f"{s.id}.md").exists()]


def get_sample(sample_id: str) -> SampleDetail | None:
    meta = next((s for s in SAMPLES if s.id == sample_id), None)
    if not meta:
        return None
    md_path = _HERE / f"{sample_id}.md"
    if not md_path.exists():
        return None
    return SampleDetail(**meta.model_dump(), content=md_path.read_text(encoding="utf-8"))
