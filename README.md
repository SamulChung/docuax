# DocuAX

> 마크다운을 한 번에 한국 회사 문서(HWP·DOCX·PDF)로
> Single Launch Edition · v2.0 · (주)텐에이아이

DocuAX는 한국어 특화 LLM **TenOS-Ko-28B**를 두뇌로, 변환 엔진·매크로 100종·리모컨 UI를 팔(실행)로 결합한 한국 회사 문서 자동화 SaaS입니다.

## 2계층 분리 설계 (Brain ↔ Arms)

DocuAX는 처음부터 **두뇌(Brain)와 팔(Arms)을 분리**합니다. TenOS가 현재의 두뇌지만, 향후 모델 업그레이드·교체에 자유롭도록 모든 LLM 호출은 `ModelProvider` 인터페이스를 통과합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                  DocuAX  =  팔 (Execution Layer)                 │
│                                                                  │
│  ┌─────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐  │
│  │ 입력 AST │→│ 양식 매핑   │→│ 검토 태그 │→│ 매크로100 │→│ 렌더 │  │
│  └─────────┘ └────────────┘ └──────────┘ └──────────┘ └──────┘  │
│       ↑           ↑              ↑                                │
│       └───────────┴──────────────┘                                │
│                   │                                               │
│            ModelProvider 인터페이스 (생각 요청)                    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼  (HTTP / gRPC / In-process)
┌─────────────────────────────────────────────────────────────────┐
│                  TenOS  =  두뇌 (Brain Layer)                    │
│   현재 ─ TenOS-Ko-28B (vLLM 서빙)                                │
│   교체 ─ TenOS v5/v6 · OpenAI · Anthropic · Local Llama 모두 가능 │
└─────────────────────────────────────────────────────────────────┘
```

자세한 어댑터 설계는 [`docs/architecture/model-provider.md`](docs/architecture/model-provider.md) 참조.

## 프로젝트 구조

```
docuax/
├── apps/
│   ├── backend/              # FastAPI · Python 3.11+
│   │   └── app/
│   │       ├── providers/    # 모델 어댑터 (TenOS, OpenAI, Anthropic, Mock)
│   │       ├── pipeline/     # 7단계 변환 파이프라인
│   │       ├── macros/       # 매크로 100종 풀셋 레지스트리
│   │       ├── renderers/    # DOCX · HWPX · PDF 직렬화
│   │       ├── rag/          # 기관 양식 학습 (ChromaDB)
│   │       └── api/          # REST API
│   └── frontend/             # Next.js 14 · TypeScript · Tailwind
│       └── src/
│           ├── components/
│           │   ├── remote/   # 리모컨 UI (5탭 + 모드 토글)
│           │   ├── editor/   # 마크다운 에디터
│           │   ├── preview/  # 검토 표시 미리보기 (빨강·파랑·노랑)
│           │   └── macros/   # 매크로 100종 패널
│           └── ...
├── packages/shared-types/    # 백·프 공유 타입
├── deploy/
│   ├── docker/               # 개발용 docker-compose
│   └── onprem/               # On-premise 단일 도커 패키지
└── docs/
    ├── architecture/
    ├── models/               # 모델 교체 가이드
    └── macros/               # 매크로 100종 명세
```

## 빠른 시작

### Cloud 개발 환경

```bash
# 1. 백엔드
cd apps/backend
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -e .
copy .env.example .env    # TenOS·OpenAI 키 등 설정
uvicorn app.main:app --reload --port 8000

# 2. 프론트엔드
cd apps/frontend
npm install
npm run dev               # http://localhost:3000
```

### Docker Compose (개발)

```bash
docker compose -f deploy/docker/docker-compose.yml up --build
```

### On-premise (단일 도커, 폐쇄망)

```bash
docker build -f deploy/onprem/Dockerfile -t docuax:onprem .
docker run -p 8000:8000 -v $PWD/data:/data docuax:onprem
```

## 모델 교체 — 두뇌 갈아끼우기

`.env`에서 `LLM_PROVIDER`만 바꾸면 됩니다:

```env
# TenOS 자체 호스팅 (vLLM, 운영 기본값)
LLM_PROVIDER=tenos
TENOS_BASE_URL=http://vllm:8000/v1
TENOS_MODEL=honey90/TenOS-Ko-28B

# OpenAI (개발·백업)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Anthropic (백업)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5

# Mock (테스트·CI)
LLM_PROVIDER=mock
```

코드 수정 0줄, 컨테이너 재시작 1회로 두뇌 교체 완료.

## 매크로 100종

| 카테고리 | 코드 | 개수 | 비고 |
|---|---|---:|---|
| 표 매크로 | T1~T25 | 25 | 8종 AI 강화 |
| 표세부 매크로 | S1~S15 | 15 | 5종 AI 강화 |
| 블록 매크로 | B1~B20 | 20 | 3종 AI 강화 |
| 글자 매크로 | G1~G15 | 15 | 2종 AI 강화 |
| 이동 매크로 | N1~N10 | 10 | **시그니처** — 5종 AI 강화 |
| 검토 매크로 | R1~R10 | 10 | 10종 모두 AI 강화 |
| 편리 매크로 | P1~P5 | 5 | 2종 AI 강화 |
| **합계** |  | **100** | **35종 AI 강화** |

명세 전체는 [`docs/macros/`](docs/macros/) 참조.

## 한컴 한글 호환성 면책

"한글", "한컴", "HWP", "HWPX"는 (주)한글과컴퓨터의 등록 상표입니다. DocuAX는 한글과컴퓨터와 **제휴·후원·승인 관계가 없는 독립적인 프로젝트**이며, 사용자의 본인 소유 HWP/HWPX 파일을 마크다운으로 변환·재출력하기 위한 합법적 호환성 도구입니다.

- 한국 저작권법 §101조의4 (프로그램코드역분석) — 호환에 필요한 정보 취득을 위한 분석 허용
- 미국 DMCA §1201(f) — 상호운용성을 위한 역공학 허용
- EU 소프트웨어 지침 §6 — 동일

자세한 법적 입장 + 의존 라이브러리(`python-hwpx`, `pyhwp`, `olefile`) 라이선스 + HWP 5.0 스펙 정오표 27건 참고는 [`docs/legal/hwp-compatibility.md`](docs/legal/hwp-compatibility.md).

## 라이선스 / 저작권

CONFIDENTIAL — Internal Use Only · (주)텐에이아이 © 2026
