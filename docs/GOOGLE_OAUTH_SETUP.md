# Google OAuth 설정 가이드

## 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. **API 및 서비스 → 사용자 인증 정보** 클릭
4. **사용자 인증 정보 만들기 → OAuth 2.0 클라이언트 ID** 클릭
5. 애플리케이션 유형: **웹 애플리케이션**
6. 승인된 리디렉션 URI 추가:
   - 개발: `http://localhost:8000/api/v1/auth/google/callback`
   - 운영(Railway): `https://docuax-production.up.railway.app/api/v1/auth/google/callback`
7. 클라이언트 ID와 클라이언트 보안 비밀번호 복사

## 2. 환경변수 설정

### 로컬 개발 (.env)
```
GOOGLE_CLIENT_ID=<클라이언트 ID>
GOOGLE_CLIENT_SECRET=<클라이언트 보안 비밀번호>
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
```

### Railway 배포
Railway 대시보드 → Variables에 추가:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://docuax-production.up.railway.app/api/v1/auth/google/callback`

## 3. OAuth 동의 화면 설정

- 사용자 유형: 외부
- 앱 이름: DocuAX
- 범위(scopes): `email`, `profile`, `openid`
- 테스트 사용자 추가 (앱 게시 전)

## 4. 동작 확인

```bash
# 백엔드 실행 후
curl -L http://localhost:8000/api/v1/auth/google
# → Google 로그인 페이지로 redirect 되어야 함
```
