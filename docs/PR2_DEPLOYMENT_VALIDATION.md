# PR #2 배포·데이터베이스 검증 기록

검증일: 2026-10-16. 수정 전 PR head: `bacb47cf02a7b3af60ee90ec01ededb477f283d5`.
기준 main: `49a2da17bc3607af3f989b0006b819d65c6fb6e8`.

## 확인한 문제와 수정

| 항목 | 재현·관찰 | 수정 |
| --- | --- | --- |
| HWP 함수 배포 크기 | 일반 `npm ci` 후 빌드는 성공하지만 `/api/parse-hwp`의 NFT trace 합계가 776.6 MiB. 두 ONNX/CUDA 배포본과 PDF OCR 의존성이 포함됨 | 해당 라우트에서 사용하지 않는 PDF/OCR 패키지만 tracing에서 제외. 최종 로컬 trace 3.3 MiB |
| Next.js 설정 | Next.js 14.2.10이 `serverExternalPackages`를 인식하지 못한다는 경고 | Next 14용 `experimental.serverComponentsExternalPackages` 사용 |
| HWP 파서 실행 | kordoc 2.9.0의 CommonJS 진입점이 `import.meta`로 SyntaxError 발생. 기존 webpack 설정이 ESM import를 CommonJS require로 바꿈 | native ESM import 유지. ESM의 `createRequire`가 읽는 CFB 패키지·의존성을 명시적으로 tracing에 포함 |
| 마이그레이션 실패 은폐 | ALTER 실패 후에도 정상 기동. 인덱스 추가 실패 후 재시작 시 복구 안 됨. 동시 기동 시 테이블 생성 경합 | 기동 실패 전파, 테이블·컬럼·인덱스 작업을 하나의 트랜잭션과 DB 잠금으로 보호. 누락 unique 인덱스 재시도 |
| 지나치게 넓은 스키마 변경 | 임의의 누락 컬럼까지 추가하며 NOT NULL 제약을 완화할 수 있음 | 검토된 `users.email_verified`, `users.google_id`만 자동 보강. 다른 누락 컬럼·다른 인덱스 정의는 명시적 마이그레이션 요구 |
| MCP URL | 운영 `/api/v1/mcp/spec`의 endpoint가 `http://localhost:3000/...` | `PUBLIC_URL` 우선, 없으면 실제 백엔드 요청 주소 사용. `FRONTEND_URL`과 분리 |
| 의존성 | Next 14.2.10 보안 경고. 최신 SQLAlchemy 설치 시 asyncio용 greenlet이 자동 설치되지 않을 수 있음 | Next 및 eslint-config-next 14.2.35로 동일 계열 패치. SQLAlchemy의 asyncio extra 명시 |
| 환경별 패키징 차이 | 1차 수정의 원격 CI에서 trace가 215.3 MiB. Node 20 환경을 따로 재현하니 canvas의 librsvg만 100 MiB이며 관련 네이티브 라이브러리가 추적됨 | 미사용 PDF용 canvas·Sharp도 해당 라우트에서 제외. Vercel과 CI 설치를 `npm ci`, 빌드를 `npm run build`로 고정 |
| 기존 API 주소 잔존 | 1차 성공 Preview의 공개 MCP JavaScript 번들에 기존 Railway 주소가 남아 있음. Vercel 환경변수 원문을 읽은 것은 아님 | 검증된 폐기 주소 하나만 새 주소로 정규화. 다른 사용자 설정 주소는 유지. 구 주소를 지정한 빌드로 최종 번들에 새 주소가 들어감을 확인 |

Vercel의 기본 함수 크기 제한은 250 MB이며, 별도 large-function 설정 여부는 확인하지 못했다.
따라서 776.6 MiB는 재현된 패키징 문제이고 **9월 8일 배포의 유일한 실패 원인이라고 확정할 수는 없다**.
과거 배포의 상세 로그·환경변수·프로젝트 설정에는 접근하지 못했다.
Next 14.2.35는 기존 14 계열 보안 패치이며, 최신 주요 버전으로의 업그레이드나 전체 의존성 보안 인증을 의미하지 않는다.

## 로컬 검증

- 백엔드: SQLite 기존 사용자 보존, 실제 가입·중복 가입, 기본값·unique 인덱스, 실패 시 DDL 롤백, 재시도, 동시 기동, 잘못된 인덱스·미지원 스키마 차단, 실제 CORS OPTIONS/GET, MCP URL 테스트.
- 프런트엔드: 기존 Jest 테스트 72개 통과. Next production build 및 타입 검사 통과.
- 패키징: NFT에 나열된 파일만 임시 디렉터리에 복사해 **컴파일된 API 라우트**로 HWP·HWPX 업로드 및 한글 텍스트 추출 검증. Node 20.20.2와 24.19.0에서 통과.
- `npm run build`에 배포 패키지 크기(200 MiB 예산), 불필요한 OCR 의존성 유입, 격리한 파서 실행 검사를 포함.
- PostgreSQL: 실제 DB용 회귀 테스트 3개와 CI의 PostgreSQL 16 서비스를 추가. 로컬 실행 환경은 비특권 사용자로 PostgreSQL을 기동하지 못해 이 3개는 로컬에서 미실행. 원격 CI #40에서 3개 모두 PASSED를 확인했다(백엔드 전체 213 passed, 2 skipped).
- 수정 전 코드에서 신규 SQLite 안전성 테스트 5개가 실패하는 것을 확인한 후 수정했다.
- 1차 수정 커밋 `2d42907`의 Vercel 배포 `DzTs6ruMACJb72Sis9xkySdbj1EZ`는 성공했고, 공개 Preview에서 합성 HWP·HWPX 파일을 실제 업로드해 각각 HTTP 200과 텍스트 추출 성공을 확인했다.

재현 명령:

```bash
cd apps/backend
LLM_PROVIDER=mock pytest tests/ -q
# PostgreSQL 테스트 포함 시 테스트 전용 DB를 TEST_POSTGRES_URL로 지정한다.
cd ../frontend
npm ci
npm test -- --runInBand
npm run build
```

## Railway 공개 엔드포인트 확인

| 요청 | 관찰 결과 |
| --- | --- |
| `https://docuax-production.up.railway.app/api/v1/health` | HTTP 404 |
| `https://docuax-production-f113.up.railway.app/api/v1/health` | HTTP 200, DocuAX 0.1.0, LLM provider는 `mock` |
| 새 주소의 가입 OPTIONS, Origin=`https://guelzip.vercel.app` | HTTP 200, 해당 Origin 및 credentials 허용 |
| 같은 OPTIONS, Origin=`https://untrusted.example` | HTTP 400, Allow-Origin 없음 |
| 같은 OPTIONS, Origin=PR Preview 도메인 | HTTP 400, Allow-Origin 없음. Preview에서 Railway 가입·로그인까지 검증하려면 정확한 Origin을 Railway 설정에 추가해야 함 |

새 주소가 DocuAX API로 응답한다는 것은 확인했다. Railway 대시보드의 서비스·환경 소유 관계,
실제 DATABASE_URL·비밀값, 운영 LLM 제공자·로그인·가입 성공까지 확인한 것은 아니다.
공개 상태 확인과 OPTIONS만 호출했으며 운영 계정이나 데이터를 생성하지 않았다.

## 병합 전 외부 검증 항목

1. 기존 배포 `dpl_8iDjJU2vHmzyVydWgznhrokHPVPu`의 로그를 확인해 실패 단계·오류 문구를 기록한다.
   인증된 Vercel 환경에서 `vercel inspect dpl_8iDjJU2vHmzyVydWgznhrokHPVPu --logs`로 조회할 수 있다.
2. **최신 PR 커밋**에 대한 GitHub CI와 Vercel Preview가 모두 성공했는지 확인한다. 이전 커밋의 성공은 대체 증거가 아니다.
3. Vercel의 Root Directory가 `apps/frontend`, Build Command가 `npm run build`인지 확인한다.
   Node 버전, Install Command, 함수 크기 제한 설정도 로그와 대조한다.
4. Preview와 Production 각각 `NEXT_PUBLIC_API_BASE=https://docuax-production-f113.up.railway.app`인지 확인한다.
   빌드 시 고정되는 공개 값이므로 변경 후 재배포해야 한다. 끝에 `/api` 또는 `/api/v1`을 붙이지 않는다.
5. Railway에서 운영 서비스 도메인을 대조하고, `PUBLIC_URL`은 백엔드 주소,
   `FRONTEND_URL`은 실제 프런트엔드 주소로 설정한다. Preview에 사용할 정확한 Origin을 `CORS_ORIGINS`에 추가한다.
   DB 접속정보·SMTP·OAuth·LLM 비밀값은 공개 PR에 게시하지 않는다.
6. 운영 DB 백업을 확보하고 복제본에서 기동·가입·로그인·재기동을 확인한다.
   PostgreSQL의 DDL 권한·잠금 대기 및 실제 데이터의 중복 Google ID도 확인한다.
   실패 시 DB를 삭제하지 말고 로그를 확인해 명시적 마이그레이션을 준비한다.
7. Preview 브라우저에서 가입·로그인, HWP·HWPX 업로드, MCP URL을 확인한다.
   Google OAuth는 Console의 redirect URI와 Railway `GOOGLE_REDIRECT_URI`를 함께 대조한다.
8. 저장소 정책에 필요한 리뷰를 받은 후 병합한다. 리뷰 승인 기록은 현재 없으며, 연결된 GitHub 권한으로 branch-protection 상세는 조회할 수 없었다.

## 근거

- PR: https://github.com/SamulChung/docuax/pull/2
- 과거 Vercel 실패: https://vercel.com/specialdatastrategist-1934s-projects/docuax/8iDjJU2vHmzyVydWgznhrokHPVPu
- Vercel 함수 제한: https://vercel.com/docs/functions/limitations
- Vercel large-function 설정: https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size
- Next 14 external packages: https://nextjs.org/docs/14/app/api-reference/next-config-js/serverComponentsExternalPackages
- Next 보안 패치: https://nextjs.org/blog/security-update-2025-12-11
