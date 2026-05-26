# Auth Gate & Landing Page — Design Spec

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** 회원가입 후 자유 사용, 랜딩 페이지 + 미들웨어 기반 라우트 보호

---

## 1. 목표

- 미로그인 사용자는 앱을 사용할 수 없다.
- 누구나 회원가입하면 모든 기능을 제한 없이 사용할 수 있다.
- 랜딩 페이지에서 앱을 소개하고 가입/로그인을 유도한다.

---

## 2. 라우트 구조 변경

| 경로 | 변경 전 | 변경 후 | 인증 필요 |
|------|---------|---------|----------|
| `/` | 앱 메인 | 랜딩 페이지 | ❌ |
| `/app` | (없음) | 앱 메인 (기존 `/` 이동) | ✅ |
| `/app/**` | (없음) | 앱 하위 전체 | ✅ |
| `/guide` | 기능 안내 | 그대로 | ❌ |
| `/forgot-password` | 비밀번호 재설정 | 그대로 | ❌ |
| `/reset-password` | 비밀번호 재설정 | 그대로 | ❌ |

---

## 3. Middleware 동작

파일: `apps/frontend/src/middleware.ts`

```
요청이 /app/** 에 해당하면:
  → Request cookies에서 docuax_token 확인
  → 없으면: / 로 리다이렉트
  → 있으면: 통과

요청이 / 에 해당하면:
  → docuax_token 있으면: /app 으로 리다이렉트 (이미 로그인)
  → 없으면: 랜딩 페이지 렌더링

그 외 경로 (/guide, /forgot-password, /reset-password 등):
  → 무조건 통과
```

---

## 4. 랜딩 페이지 구성

파일: `apps/frontend/src/app/page.tsx` (전면 교체)

### 4.1 Hero 섹션
- DocuAX 로고
- 헤드라인: **"공공기관, 기업의 문서 AI 자동화"**
- 서브카피: 간결한 1~2줄 설명
- CTA 버튼 2개:
  - `[지금 시작하기]` → AuthModal 회원가입 탭 오픈
  - `[로그인]` → AuthModal 로그인 탭 오픈

### 4.2 Screenshot Preview 섹션
- 실제 앱 UI를 보여주는 브라우저 프레임 목업
- 정적 스크린샷 이미지 (`/public/screenshots/app-preview.png`)
- 마우스 호버 시 두 번째 스크린샷으로 전환 (CSS transition)

### 4.3 Feature Chips 섹션
- 3개 기능 하이라이트:
  1. ✦ 역관목조분 프롬프트 빌더
  2. ✦ 공문 원클릭 정돈
  3. ✦ 세대별 톤 변환

### 4.4 Footer
- `© 2026 DocuAX` | 문의 | 이용약관

---

## 5. 인증 흐름

```
미로그인 사용자 → / 접속 → 랜딩 노출
  → [지금 시작하기] 클릭 → AuthModal(회원가입) 오픈
  → 가입 완료 → 자동 로그인 → /app 이동

미로그인 사용자 → /app 직접 접속
  → middleware 차단 → / 리다이렉트

로그인 사용자 → / 접속
  → middleware 감지 → /app 자동 리다이렉트

로그아웃
  → docuax_token 쿠키 삭제 → / 리다이렉트
```

---

## 6. 플랜 정책

- 현재: **모든 기능 무제한 제공** (플랜 구분 없음)
- 향후 확장 시 User.plan 필드로 제어 (이미 DB 스키마에 존재)

---

## 7. 변경 파일 목록

| 파일 | 작업 유형 |
|------|----------|
| `apps/frontend/src/middleware.ts` | 신규 생성 |
| `apps/frontend/src/app/page.tsx` | 전면 교체 (랜딩 페이지) |
| `apps/frontend/src/app/app/page.tsx` | 신규 — 기존 page.tsx 이동 |
| `apps/frontend/src/app/app/layout.tsx` | 신규 — 앱 전용 레이아웃 래퍼 |
| `apps/frontend/src/store/auth.ts` 또는 `lib/user.ts` | 로그인 성공 후 `/app` 리다이렉트 추가 |
| `public/screenshots/` | 앱 스크린샷 이미지 추가 |

### 재사용 (변경 없음)
- `components/auth/AuthModal.tsx` — 그대로 사용
- 백엔드 `api/v1/auth.py` — 그대로 사용
- `lib/api.ts` (login, register 함수) — 그대로 사용

---

## 8. 비기능 요구사항

- 랜딩 페이지는 정적 렌더링(SSG)으로 빠르게 로드
- middleware는 Edge Runtime에서 동작 (Next.js 기본)
- 토큰 검증은 middleware에서 쿠키 존재 여부만 확인 (서명 검증은 앱 내부에서)
