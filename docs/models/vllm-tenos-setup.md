# 실제 TenOS·vLLM·OCR 연동 가이드

DocuAX는 mock provider로 시작해도 동작하지만, 진짜 한국어 LLM과 OCR을 연결하면 변환·검토 품질이 결정적으로 좋아집니다. 이 문서는 각 옵션의 정확한 설정 절차입니다.

## 1. TenOS — vLLM(클라우드 GPU) 경로 — **권장**

PRD `honey90/TenOS-Ko-28B`는 28B + qwen3_5 멀티모달이라 HF Serverless에는 안 뜹니다. 실제 추론을 하려면 GPU 인스턴스를 띄워야 합니다.

### 1.1 HF Inference Endpoints (가장 간편)

1. https://huggingface.co/honey90/TenOS-Ko-28B 우상단 **Deploy → Inference Endpoints**
2. 인스턴스: **GPU · Nvidia A10G** ($0.60/h, 4비트 양자화로 28B 수용) 또는 **A100 40GB** ($4/h, BF16 풀)
3. **Container Type**: `vLLM` (OpenAI 호환)
4. Region: AWS us-east-1 또는 eu-west-1
5. **Create Endpoint** → 5~10분 대기 → 받은 URL을 복사

브라우저에서 상단 **두뇌 칩** 클릭 → 설정 모달 → Provider: **TenOS (vLLM·자체 호스팅)** → 입력:

```
Base URL:    https://xxxx.endpoints.huggingface.cloud/v1
모델 ID:     honey90/TenOS-Ko-28B
API Key:     hf_xxxxx (HF 토큰)
```

**연결 테스트** → **저장 및 적용**.

### 1.2 RunPod / Lambda / vast.ai (저렴)

```bash
# RunPod GPU 컨테이너에서
vllm serve honey90/TenOS-Ko-28B \
  --host 0.0.0.0 --port 8001 \
  --max-model-len 4096 \
  --quantization awq            # 4비트 — A10G/RTX 4090 수용
```

받은 외부 IP를 `TENOS_BASE_URL=http://<ip>:8001/v1`. A100 40GB는 양자화 없이 BF16 가능.

### 1.3 로컬 GPU

- VRAM ≥ 24GB (RTX 4090, A5000+) — AWQ/GPTQ 4비트 양자화로
- VRAM ≥ 60GB (A100, H100) — BF16 풀

```bash
pip install vllm
vllm serve honey90/TenOS-Ko-28B --port 8001 --quantization awq
```

`.env`:
```env
LLM_PROVIDER=tenos
TENOS_BASE_URL=http://localhost:8001/v1
TENOS_MODEL=honey90/TenOS-Ko-28B
```

### 1.4 검증

연결 후 다음 한 줄로 정확도 1차 확인:

```bash
curl -X POST http://localhost:8000/api/v1/convert \
  -H 'Content-Type: application/json' \
  -d '{"source":"수신: 행정안전부\n제목: 안내","persona_mode":"heavy"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d['preview']['document_class'], d['model_version'])"
```

기대: `공문 tenos:honey90/TenOS-Ko-28B`.

mock provider 시절에는 `일반`으로 분류되는데, 실 모델이면 키워드(수신, 제목) 보고 `공문`으로 정확 분류됩니다.

## 2. OCR — 스캔 PDF 한국어 추출

OCR provider는 LLM Settings 모달에는 직접 노출되지 않지만, 백엔드 API로 설정 가능합니다.

### 2.1 Tesseract (로컬·무료)

```bash
# Windows: https://github.com/UB-Mannheim/tesseract/wiki 설치
# Linux:
sudo apt install tesseract-ocr tesseract-ocr-kor poppler-utils
pip install pytesseract pdf2image
```

설정:
```bash
curl -X POST http://localhost:8000/api/v1/settings/llm \
  -H 'Content-Type: application/json' \
  -d '{
    "ocr_provider": "tesseract",
    "ocr_tesseract_cmd": "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
  }'
```

가용성 확인:
```bash
curl http://localhost:8000/api/v1/settings/ocr/status
# {"provider":"tesseract","available":true}
```

### 2.2 NAVER CLOVA OCR (정확도 최상, 한국어 특화)

1. NAVER Cloud Platform → AI·Application Service → **OCR**
2. **General OCR** Domain 생성 → Invoke URL + Secret 받기
3. 설정:

```bash
curl -X POST http://localhost:8000/api/v1/settings/llm \
  -H 'Content-Type: application/json' \
  -d '{
    "ocr_provider": "clova",
    "clova_ocr_url": "https://<your-domain>.apigw.ntruss.com/custom/v1/...",
    "clova_ocr_secret": "<your-secret>"
  }'
```

### 2.3 동작 확인

스캔 PDF를 양식 라이브러리에 업로드. 첫 시도에 빈 텍스트가 나오면 OCR 폴백이 자동 발동되어 한국어가 추출됩니다 (warning 메시지로 OCR 사용 알림).

## 3. 모델 정확도 측정 (선택)

PRD KPI는 변환 1건 평균 시간 20분 이내, 환각 3% 이하입니다. 실 모델 연결 후 측정 자동화 가이드:

```bash
# 1) 100개 한국어 문서 샘플 준비 (apps/backend/data/eval/)
# 2) 각 문서에 대해 변환 실행 → ConversionRun 기록
# 3) review_tags(red 카운트) / 전체 단락 수 = 환각 의심률
# 4) 사람이 빨강 태그 50% 표본 검사 → 정확도 보정

python scripts/eval_accuracy.py --provider tenos --dataset gongmun_100
```

(스크립트는 추후 추가 예정 — 현재는 시나리오만 명시)

## 4. 운영 모니터링

`ConversionRun` 테이블에 매 호출 기록:
- `model_version` (provider:model 추적)
- `latency_ms` (P50/P95 계산)
- `review_tags` (red·blue·yellow 카운트)
- `token_count` (비용 추적)

쿼리 예시:
```sql
SELECT model_version, COUNT(*), AVG(latency_ms), AVG(token_count)
FROM conversion_runs
WHERE created_at >= datetime('now', '-7 days')
GROUP BY model_version;
```

운영에서는 Grafana 등으로 시각화 권장.
