# 시작하기 — DocuAX 로컬 실행 가이드

## 사전 요구사항

- Python 3.11+
- Node.js 20+
- (선택) LibreOffice — HWPX/PDF 폴백 변환용
- (선택) GPU + vLLM — TenOS 운영 시

## 1. 백엔드 실행 (Python)

```powershell
# Windows PowerShell
cd apps\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .

# 환경 파일 복사
copy .env.example .env
# .env 편집 — 처음에는 LLM_PROVIDER=mock 으로 시작 (외부 API 없이 동작)

# 실행
uvicorn app.main:app --reload --port 8000
```

브라우저: `http://localhost:8000/docs` (Swagger UI)
헬스체크: `http://localhost:8000/api/v1/health`

## 2. 프론트엔드 실행 (Next.js)

```powershell
cd apps\frontend
npm install --legacy-peer-deps
npm run dev
```

브라우저: `http://localhost:3000`

## 3. 빠른 동작 확인

브라우저 워크스페이스에서:

1. 왼쪽 에디터에 마크다운 (기본값 그대로도 OK)
2. 오른쪽 리모컨 → **"한 번에 회사 문서로"** 클릭 (또는 `Ctrl+Enter`)
3. 가운데 미리보기에 변환 결과 + 빨강·파랑·노랑 검토 표시 등장
4. 검토 점프: `Alt+R` (빨강) · `Alt+B` (파랑) · `Alt+N` (숫자)
5. 모드 전환: `Ctrl+Shift+M` (워커 ↔ 헤비유저)
6. 출력 탭에서 DOCX/HWPX/PDF 다운로드

## 4. TenOS 연결

`mock`은 데모용. 실제 TenOS를 쓰려면:

```env
# .env
LLM_PROVIDER=tenos
TENOS_BASE_URL=http://localhost:8001/v1
TENOS_MODEL=honey90/TenOS-Ko-28B
TENOS_API_KEY=local-no-auth
```

별도 터미널에서 vLLM 기동:
```bash
vllm serve honey90/TenOS-Ko-28B --host 0.0.0.0 --port 8001
```

(GPU 없는 환경에서는 OpenAI 등 외부 provider를 임시로 사용 — `LLM_PROVIDER=openai`)

## 5. 매크로 100종 확인

```bash
curl http://localhost:8000/api/v1/macros/stats
# {"T":25,"S":15,"B":20,"G":15,"N":10,"R":10,"P":5,"total":100,"auto":5,"ai_powered":33}
```

## 6. RAG 기관 양식 학습

```bash
# 양식 문서 인덱싱
curl -X POST http://localhost:8000/api/v1/rag/index \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "hancom",
    "document_id": "tmpl-001",
    "title": "표준 공문 양식",
    "content": "수신: ...\n제목: ...\n본문: ..."
  }'

# 양식 검색
curl "http://localhost:8000/api/v1/rag/search?organization_id=hancom&query=수신%20제목"
```

## 7. 테스트

```bash
cd apps/backend
pytest -v
```

핵심 검증:
- `test_total_macros_is_100` — 매크로 100종 풀셋 확인
- `test_pipeline.py` — 7단계 통합 동작

## 문제 해결

| 증상 | 원인·해결 |
|---|---|
| `ModuleNotFoundError: pydantic_settings` | `pip install -e .` 다시 실행 |
| 헬스체크 `llm.available=false` | `LLM_PROVIDER=mock` 으로 설정하거나 vLLM 기동 |
| HWPX 다운로드 실패 (텍스트 폴백) | LibreOffice 설치 (`apt install libreoffice`) |
| 한국어 폰트 깨짐 (PDF) | Nanum/Noto CJK 설치 |
| 매크로 카운트 100 아님 | `app/macros/categories/`의 각 파일에서 `MACROS = [...]` 확인 |

## 다음 단계

- 매크로 추가/수정: [`docs/macros/README.md`](docs/macros/README.md)
- 모델 교체: [`docs/models/swap-guide.md`](docs/models/swap-guide.md)
- 아키텍처 상세: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- On-premise 배포: [`deploy/onprem/Dockerfile`](deploy/onprem/Dockerfile)
