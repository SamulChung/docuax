# Auth Enhancement Design

## Goal

DocuAX 인증 시스템을 5개 태스크로 고도화한다: Gmail SMTP 이메일 서비스, Refresh Token 자동 갱신, 이메일 인증, Google OAuth 소셜 로그인, 프론트엔드 UX 개선.

## Architecture

백엔드 우선 순차 구현. 각 태스크는 독립적으로 테스트 가능하며, 이전 태스크의 결과물 위에 쌓인다.

```
Task 1: Gmail SMTP 이메일 서비스
  ↓ (이메일 발송 기반 완성)
Task 2: Refresh Token
  ↓ (토큰 관리 완성)
Task 3: 이메일 인증
  ↓ (계정 인증 완성)
Task 4: Google OAuth
  ↓ (소셜 로그인 완성)
Task 5: 프론트엔드 UX 고도화
```

**Tech Stack:**
- Backend: FastAPI, aiosqlite, aiosmtplib, authlib (Google OAuth), python-jose (JWT)
- Frontend: Next.js 14, React hooks

---

## Task 1: Gmail SMTP 이메일 서비스

### 목적
현재 비밀번호 재설정 토큰이 로그에만 기록됨. Gmail SMTP로 실제 메일을 발송한다.

### 파일
- **신규:** `apps/backend/app/services/email.py`
- **신규:** `apps/backend/app/templates/email/verify.html`
- **신규:** `apps/backend/app/templates/email/reset_password.html`
- **수정:** `apps/backend/app/core/config.py` — SMTP 설정 추가
- **수정:** `apps/backend/app/api/v1/auth.py` — 비밀번호 재설정 실제 발송으로 교체

### 설계

**Config 추가 (`app/core/config.py`):**
```python
smtp_host: str = "smtp.gmail.com"
smtp_port: int = 587
smtp_user: str = ""          # Gmail 주소 (환경변수 SMTP_USER)
smtp_password: str = ""      # Gmail 앱 비밀번호 (환경변수 SMTP_PASSWORD)
smtp_from: str = ""          # 발신자 표시 이름+주소
email_enabled: bool = False  # SMTP_USER 있을 때 True
frontend_url: str = "http://localhost:3000"  # 메일 링크 base URL
```

**EmailService (`app/services/email.py`):**
```python
class EmailService:
    async def send_verification_email(user_email: str, token: str) -> None
    async def send_password_reset_email(user_email: str, token: str) -> None
    async def _send(to: str, subject: str, html: str) -> None
        # email_enabled=False면 logger.info로만 출력 (개발 모드)
        # email_enabled=True면 aiosmtplib STARTTLS로 발송
```

**이메일 템플릿:**
- `verify.html`: "DocuAX 이메일 인증" — 인증 버튼 + 24시간 유효
- `reset_password.html`: "비밀번호 재설정" — 변경 버튼 + 30분 유효

**환경변수 설정 가이드 (README에 추가):**
```
Gmail 앱 비밀번호 발급:
1. Google 계정 → 보안 → 2단계 인증 활성화
2. 앱 비밀번호 → 앱: 메일, 기기: 기타(DocuAX) → 생성
3. .env에 SMTP_USER=your@gmail.com, SMTP_PASSWORD=xxxx xxxx xxxx xxxx
```

---

## Task 2: Refresh Token

### 목적
현재 Access Token 24시간 단일 토큰 → Access 15분 + Refresh 30일 rotation으로 교체. 사용자는 30일간 재로그인 없이 사용.

### 파일
- **수정:** `apps/backend/app/models/tables.py` — RefreshToken 테이블 추가
- **수정:** `apps/backend/app/services/auth.py` — refresh token 생성/검증 함수
- **수정:** `apps/backend/app/api/v1/auth.py` — POST /auth/refresh 엔드포인트
- **수정:** `apps/frontend/src/lib/api.ts` — 401 인터셉터 + 자동 갱신
- **수정:** `apps/frontend/src/lib/auth.ts` (또는 api.ts) — refresh token 쿠키 관리

### 설계

**RefreshToken 테이블:**
```python
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: str (UUID, PK)
    user_id: str (FK → users.id, cascade delete)
    token_hash: str (SHA-256 해시, UNIQUE) # 평문 저장 안 함
    expires_at: datetime
    created_at: datetime
    revoked: bool = False
```

**토큰 흐름:**
```
로그인/가입 응답:
  access_token (15분, Bearer)  → localStorage
  refresh_token (30일)         → httpOnly 쿠키 (docuax_refresh)

API 호출 시 401 → 자동 갱신:
  POST /auth/refresh (refresh 쿠키 자동 포함)
  → 새 access_token + 새 refresh_token (rotation)
  → 원래 요청 재시도

로그아웃:
  DB에서 refresh token revoke
  refresh 쿠키 삭제
  localStorage 삭제
```

**POST /auth/refresh:**
- refresh 쿠키에서 토큰 추출
- DB에서 해시 조회 → 만료/revoke 확인
- 기존 token revoke → 새 access + refresh 발급 (rotation)
- 응답: `{ access_token, token_type: "bearer" }`

**프론트엔드 인터셉터 (`api.ts`):**
```typescript
// http() 함수에 401 재시도 로직 추가
// isRefreshing 플래그로 동시 갱신 요청 방지
// 갱신 실패(refresh 만료) 시 → 로그아웃 + 랜딩 리다이렉트
```

---

## Task 3: 이메일 인증

### 목적
가입 후 이메일 소유 확인. 미인증 사용자는 차단하지 않고 앱 상단에 배너만 표시.

### 파일
- **수정:** `apps/backend/app/models/tables.py` — `email_verified: bool = False` 컬럼
- **수정:** `apps/backend/app/api/v1/auth.py` — GET /auth/verify-email, POST /auth/resend-verification
- **수정:** `apps/backend/app/api/v1/auth.py` — register 시 인증 메일 발송
- **신규:** `apps/frontend/src/components/auth/VerifyBanner.tsx`
- **수정:** `apps/frontend/src/app/app/layout.tsx` — VerifyBanner 삽입
- **신규:** `apps/frontend/src/app/verify-email/page.tsx`

### 설계

**백엔드:**
- `POST /auth/register` → 가입 완료 후 `send_verification_email()` 호출
- 인증 토큰: `purpose="email_verify"`, TTL 24시간
- `GET /auth/verify-email?token=...` → 토큰 검증 → `email_verified=True` 업데이트
- `POST /auth/resend-verification` → 인증 메일 재발송 (레이트 제한: 5분에 1회)
- `/auth/me` 응답에 `email_verified: bool` 추가

**프론트엔드:**
- `VerifyBanner`: `useAuth().user.email_verified === false`이면 앱 상단 표시
  - "이메일 인증을 완료해 주세요. [재발송]" 링크 포함
  - 인증 완료 후 자동 숨김
- `/verify-email?token=...` 페이지: 토큰 자동 처리 → 성공/실패 메시지 + 앱 이동 버튼

---

## Task 4: Google OAuth

### 목적
Google 계정으로 원클릭 가입/로그인. 기존 이메일 계정과 연결 처리 포함.

### 파일
- **수정:** `apps/backend/app/models/tables.py` — `google_id: str | None` 컬럼
- **수정:** `apps/backend/app/api/v1/auth.py` — GET /auth/google, GET /auth/google/callback
- **수정:** `apps/backend/app/core/config.py` — Google OAuth 설정
- **수정:** `apps/frontend/src/components/auth/AuthModal.tsx` — Google 버튼 추가
- **신규:** `docs/GOOGLE_OAUTH_SETUP.md`

### 설계

**Config 추가:**
```python
google_client_id: str = ""      # 환경변수 GOOGLE_CLIENT_ID
google_client_secret: str = ""  # 환경변수 GOOGLE_CLIENT_SECRET
google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
```

**OAuth 흐름:**
```
1. 프론트 → GET /api/v1/auth/google
   → authlib로 Google 인증 URL 생성 (state, nonce 포함)
   → 302 redirect to Google

2. Google → GET /api/v1/auth/google/callback?code=...&state=...
   → code 교환 → Google userinfo (email, sub, name, picture)
   → 기존 계정 연결 로직:
      a. google_id 일치 → 로그인
      b. 이메일 일치 → google_id 연결 + 로그인
      c. 신규 → 비밀번호 없는 계정 생성 + email_verified=True
   → access_token + refresh_token 발급
   → 302 redirect to /app?token=... (프론트가 URL에서 토큰 수거)

3. 프론트 /app → URL에서 token 추출 → setAuthToken() → URL 정리
```

**AuthModal Google 버튼:**
```
─────────────── 또는 ───────────────
[G  Google로 계속하기]
```

**설정 가이드 (`GOOGLE_OAUTH_SETUP.md`):**
- Google Cloud Console → API & Services → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 생성
- 승인된 리디렉션 URI: `http://localhost:8000/api/v1/auth/google/callback`
- `.env`에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 추가

---

## Task 5: 프론트엔드 UX 고도화

### 목적
AuthModal의 폼 품질을 높인다. 비밀번호 강도 표시, 실시간 유효성 검사, 로딩 상태.

### 파일
- **수정:** `apps/frontend/src/components/auth/AuthModal.tsx`
- **신규:** `apps/frontend/src/components/auth/PasswordStrength.tsx`

### 설계

**비밀번호 강도 표시기 (`PasswordStrength.tsx`):**
```
규칙:
- 8자 이상
- 대문자 포함
- 숫자 포함
- 특수문자 포함

표시: 색상 바 (빨강→주황→노랑→초록) + 텍스트 (약함/보통/강함/매우강함)
```

**실시간 유효성 검사:**
- 이메일: blur 시 형식 확인
- 비밀번호 확인: 입력 중 일치 여부 표시
- 에러 메시지: 필드 아래 인라인 표시 (현재 모달 상단 단일 에러 → 개선)

**로딩 상태:**
- 제출 중 버튼: 스피너 + "로그인 중…" / "가입 중…" 텍스트
- 제출 중 버튼 disabled (중복 제출 방지)
- 이미 구현된 에러 핸들링 유지

---

## 에러 처리

| 상황 | 처리 |
|------|------|
| SMTP 발송 실패 | 에러 로깅, 사용자에게는 성공 응답 (재발송 기회 제공) |
| Refresh Token 만료 | 자동 로그아웃 → 랜딩 페이지 리다이렉트 |
| Google OAuth 실패 | `/` 리다이렉트 + 에러 쿼리파라미터 |
| 이메일 인증 토큰 만료 | 재발송 안내 페이지 |
| google_id 중복 | 기존 계정 연결 처리 (에러 없음) |

---

## 테스트 전략

- **Task 1:** SMTP 설정 없을 때 로그 출력 확인, 설정 있을 때 실제 수신 확인
- **Task 2:** 토큰 만료 시뮬레이션 (15초로 단축), 자동 갱신 + 원래 요청 재시도 확인
- **Task 3:** 인증 전/후 배너 표시, 만료 토큰 거부 확인
- **Task 4:** Google 리다이렉트 URL 정상, callback 처리 후 로그인 확인
- **Task 5:** 각 규칙별 비밀번호 강도 변화, 중복 제출 방지 확인

---

## 보안 원칙

- Refresh Token은 DB에 SHA-256 해시만 저장 (평문 없음)
- Refresh Token rotation: 사용 즉시 revoke + 새 토큰 발급
- httpOnly 쿠키로 XSS 방어
- Google OAuth state 파라미터로 CSRF 방어
- SMTP 비밀번호는 환경변수, 코드에 하드코딩 금지
