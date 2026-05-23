# DocuAX 운영 배포 가이드

본 문서는 DocuAX를 운영 환경(Production)에 안전하게 배포하기 위한 단계별 체크리스트입니다.

---

## 1. 환경 변수 정비

`apps/backend/.env` 를 `apps/backend/.env.example` 기반으로 작성하고 다음을 반드시 채우세요.

### 필수 (운영에서 미설정 시 위험)

```bash
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=$(openssl rand -hex 32)    # 32바이트 hex — JWT 위조 방지
DATABASE_URL=postgresql+asyncpg://docuax:STRONG@db.internal:5432/docuax
CORS_ORIGINS=https://app.docuax.kr,https://www.docuax.kr   # * 금지
ADMIN_EMAILS=admin@docuax.io,*@tenai.kr
```

### 런타임에서 자동 검증되는 항목

부팅 시 `lifespan` 이 다음을 자동 점검하고 경고 로그를 남깁니다.

  ○ `APP_SECRET_KEY` 가 기본값인지
  ○ `APP_DEBUG=true` 운영에서 사용 중인지
  ○ `CORS_ORIGINS` 에 `localhost` 또는 `*` 포함 여부
  ○ DB가 sqlite인지 (운영 부적합)

---

## 2. 데이터베이스

### PostgreSQL 마이그레이션

```bash
# 1. PostgreSQL 인스턴스 준비 (RDS / 자체 호스팅)
createdb docuax
createuser docuax --pwprompt

# 2. DATABASE_URL 설정
export DATABASE_URL="postgresql+asyncpg://docuax:STRONG@host:5432/docuax"

# 3. DocuAX 시작 시 자동으로 모든 테이블 생성됨 (init_db)
uvicorn app.main:app
```

### 백업 정책

```bash
# 일일 백업 (cron)
0 3 * * * pg_dump -Fc docuax > /backup/docuax_$(date +\%Y\%m\%d).dump

# 90일 이상 백업 자동 삭제
0 4 * * * find /backup -name "docuax_*.dump" -mtime +90 -delete
```

---

## 3. Stripe 결제 활성화

### 3.1. Price 객체 생성

```bash
# Test 모드로 먼저 검증
export STRIPE_SECRET_KEY=sk_test_...
python scripts/stripe_setup.py
# → STRIPE_PRICE_PRO=price_xxx, STRIPE_PRICE_TEAM=price_yyy 출력 → .env 에 추가

# 운영 키로 정식 생성 (신중)
export STRIPE_SECRET_KEY=sk_live_...
python scripts/stripe_setup.py
```

### 3.2. Webhook 등록

Stripe Dashboard → Developers → Webhooks → Add endpoint

```
URL: https://api.docuax.kr/api/v1/billing/webhook
Events:
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
```

발급된 `whsec_...` 을 `STRIPE_WEBHOOK_SECRET` 에 입력.

### 3.3. 로컬 종단 검증

```bash
# Stripe CLI 로 로컬 webhook 포워딩
stripe listen --forward-to localhost:8000/api/v1/billing/webhook

# 종단 검증 스크립트 실행
python scripts/stripe_e2e_verify.py
```

---

## 4. Rate Limiting (P0 보안)

분당 IP별 한도 — `.env`에서 조정 가능:

```bash
RATE_LIMIT_DEFAULT_PER_MIN=120
RATE_LIMIT_AUTH_PER_MIN=10        # 로그인·가입 (무차별 공격 방지)
RATE_LIMIT_CONVERT_PER_MIN=30     # 무거운 변환 작업
```

**다중 노드 운영 시 주의:** 현재 in-memory 구현. 클러스터링 환경에서는
`app/core/rate_limit.py` 의 `_buckets` 를 Redis로 교체 필요.

---

## 5. ISMS-P 보안 점검

  ○ 비밀번호 bcrypt 해시 저장 ✓
  ○ JWT 24시간 만료 ✓
  ○ HTTPS / TLS 1.3 — 운영 reverse proxy (nginx/Cloudflare) 에서 강제
  ○ 감사 로그 90일 보관 + 자동 정리 ✓
  ○ 옵트인 학습 (기본 거부) ✓
  ○ 관리자 전용 엔드포인트 `require_admin` 게이팅 ✓
  ○ CORS 도메인 화이트리스트 ✓
  ○ Rate limiting ✓
  ○ 90일 초과 로그 정리 — `/admin/audit-logs` 페이지 [90일 정리] 버튼

---

## 6. LLM Provider 운영

### 6.1. TenOS 자체 호스팅 (권장)

```bash
LLM_PROVIDER=tenos
TENOS_BASE_URL=http://vllm-internal:8001/v1
TENOS_MODEL=honey90/TenOS-Ko-28B
TENOS_API_KEY=...
```

### 6.2. Chain 폴백 — 가장 안정적

```bash
LLM_PROVIDER=chain
LLM_CHAIN=tenos,openai
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

자체 모델이 응답 못 하면 OpenAI → Anthropic 순으로 폴백.

### 6.3. 망분리 환경 (공공·금융)

```bash
ON_PREMISE=true
LLM_PROVIDER=tenos
```

`ON_PREMISE=true` 면 외부 API 호출(openai·anthropic provider) 자동 차단.

---

## 7. Docker 배포

```bash
# 운영용 이미지 빌드
docker build -f deploy/onprem/Dockerfile -t docuax:1.0 .

# 단일 컨테이너 실행 (망분리 환경 대상)
docker run -d \
  --name docuax \
  -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  docuax:1.0
```

### docker-compose (다중 서비스)

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
```

---

## 8. 모니터링

### Prometheus 메트릭

`/api/v1/metrics` — Prometheus 표준 노출.

```yaml
# prometheus.yml
scrape_configs:
  - job_name: docuax
    static_configs:
      - targets: ['docuax:8000']
    metrics_path: /api/v1/metrics
```

### 권장 알림 (Slack/이메일)

  ○ HTTP 5xx 응답 분당 5건 초과 → P1 알림
  ○ LLM provider 응답 실패 분당 10건 초과 → P0 알림
  ○ 디스크 사용량 85% 초과 → P2 알림
  ○ 감사 로그에 `auth.login` status=denied 분당 20건 초과 → 보안 알림

---

## 9. 출시 전 최종 체크리스트

  - [ ] `.env` 모든 [필수] 항목 채움 + secret 32바이트 이상
  - [ ] PostgreSQL 마이그레이션 완료 + 일일 백업 cron 등록
  - [ ] Stripe Price 생성 + Webhook 등록 + 종단 결제 1건 검증
  - [ ] Rate limit 운영값 확정 (auth=10, convert=30 권장)
  - [ ] CORS 운영 도메인만 허용
  - [ ] HTTPS reverse proxy 설정 (nginx + Let's Encrypt 또는 Cloudflare)
  - [ ] Prometheus 메트릭 수집 + 알림 채널 연결
  - [ ] ADMIN_EMAILS 정책 결정 (CEO + 운영팀 이메일만)
  - [ ] ISMS-P 실태조사 통과 (외부 인증기관)
  - [ ] 이용약관 + 개인정보처리방침 법무 검토 (`/terms`, `/privacy`)
  - [ ] 로그인·가입·변환·결제 종단 시나리오 통과
  - [ ] 부하 테스트 — 동시 100명 변환 시 P95 응답 2초 이내

---

## 10. 출시 후 운영

  ○ **분기 1회** 외부 침투 시험
  ○ **월 1회** 백업 복원 모의 훈련
  ○ **주 1회** 핵심 지표 리뷰 (`/admin/dashboard`)
  ○ **분기 1회** 감사 로그 정리 (`/admin/audit-logs` → 90일 정리)

---

## 부록: 빠른 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `400 The request body is not valid JSON: no low surrogate` | 깨진 유니코드 input | 프론트 `sanitize.ts` 자동 처리 — 최신 빌드로 업데이트 |
| `503 결제 시스템이 아직 구성되지 않았습니다` | STRIPE_SECRET_KEY 미설정 | 3장 참조 |
| `401 인증이 필요합니다` (관리자 API) | 비admin 호출 | ADMIN_EMAILS 확인 + 재로그인 |
| `429 요청이 너무 많습니다` | Rate limit 초과 | Retry-After 헤더 대기 후 재시도 |
| HWPX 출력에 색상 미반영 | python-hwpx 미설치 또는 조직 양식 미선택 | `pip install python-hwpx>=2.9.1` + 변환 탭 양식 선택 |
| 운영 환경 안전 경고 로그 | APP_ENV=production 인데 설정 불완전 | 1장 환경 변수 확인 |
