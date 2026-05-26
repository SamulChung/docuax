# Auth Gate & Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미로그인 사용자는 `/`(랜딩)으로, 로그인 사용자는 `/app`(앱)으로 라우팅하고, 누구나 가입하면 전 기능을 자유롭게 사용할 수 있도록 한다.

**Architecture:** Next.js middleware가 `docuax_token` 쿠키를 확인해 `/app/**` 경로를 보호한다. 현재 `/`의 Workspace는 `/app`으로 이동하고, `/`에는 스크린샷 프리뷰 랜딩 페이지를 만든다. 토큰은 기존 localStorage에 더해 쿠키에도 동기화한다.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Next.js Edge Middleware

---

## File Map

| 파일 | 작업 |
|------|------|
| `src/middleware.ts` | 신규 — 쿠키 기반 라우트 보호 |
| `src/app/page.tsx` | 교체 — 랜딩 페이지 |
| `src/app/app/page.tsx` | 신규 — 기존 앱 (`<Workspace />`) |
| `src/app/app/layout.tsx` | 신규 — 앱 전용 최소 레이아웃 |
| `src/lib/api.ts` | 수정 — `setAuthToken`이 쿠키도 동기화 |
| `src/components/auth/AuthModal.tsx` | 수정 — 익명 사용 안내 문구 제거 |

---

### Task 1: `setAuthToken`이 쿠키도 동기화하도록 수정

미들웨어는 서버 쿠키를 읽으므로, 로그인 시 localStorage와 함께 쿠키도 설정해야 한다.

**Files:**
- Modify: `apps/frontend/src/lib/api.ts`

- [ ] **Step 1: `setAuthToken` 함수를 아래 코드로 교체**

`apps/frontend/src/lib/api.ts` 안의 기존 `setAuthToken` 함수:
```typescript
export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("docuax.access_token", token);
  else localStorage.removeItem("docuax.access_token");
  window.dispatchEvent(new CustomEvent("docuax:auth-changed"));
}
```

아래 코드로 교체:
```typescript
export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("docuax.access_token", token);
    // middleware가 서버에서 읽을 수 있도록 쿠키에도 동기화
    document.cookie = `docuax_token=${token}; path=/; max-age=86400; SameSite=Lax`;
  } else {
    localStorage.removeItem("docuax.access_token");
    document.cookie = `docuax_token=; path=/; max-age=0; SameSite=Lax`;
  }
  window.dispatchEvent(new CustomEvent("docuax:auth-changed"));
}
```

- [ ] **Step 2: 개발 서버에서 로그인 → 쿠키 설정 확인**

브라우저 DevTools → Application → Cookies → `docuax_token` 항목이 생기면 성공.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/api.ts
git commit -m "feat: setAuthToken이 localStorage와 함께 쿠키도 동기화"
```

---

### Task 2: Next.js Middleware 생성

**Files:**
- Create: `apps/frontend/src/middleware.ts`

- [ ] **Step 1: 파일 생성**

`apps/frontend/src/middleware.ts` 신규 생성:
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("docuax_token")?.value;
  const { pathname } = request.nextUrl;

  // /app 및 하위 경로 보호
  if (pathname.startsWith("/app")) {
    if (!token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 이미 로그인된 사용자가 랜딩(/)에 접근하면 /app으로 리다이렉트
  if (pathname === "/") {
    if (token) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // /app 경로 전체와 / 에만 미들웨어 적용 (정적 파일·API 제외)
  matcher: ["/", "/app/:path*"],
};
```

- [ ] **Step 2: 미들웨어 동작 확인**

개발 서버(`npm run dev`)에서:
1. 비로그인 상태로 `http://localhost:3000/app` 접속 → `/`로 리다이렉트되면 성공
2. 로그인 후 `http://localhost:3000/` 접속 → `/app`으로 리다이렉트되면 성공

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/middleware.ts
git commit -m "feat: Next.js middleware로 /app 라우트 보호"
```

---

### Task 3: 앱 메인을 `/app` 경로로 이동

**Files:**
- Create: `apps/frontend/src/app/app/page.tsx`
- Create: `apps/frontend/src/app/app/layout.tsx`

- [ ] **Step 1: `/app` 라우트 디렉토리 생성 및 page.tsx 작성**

`apps/frontend/src/app/app/page.tsx`:
```typescript
import { Workspace } from "@/components/Workspace";

export default function AppPage() {
  return <Workspace />;
}
```

- [ ] **Step 2: `/app` 레이아웃 작성**

`apps/frontend/src/app/app/layout.tsx`:
```typescript
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 3: `http://localhost:3000/app` 접속해서 앱이 정상 동작하는지 확인**

기존 워크스페이스 UI가 `/app`에서 그대로 보여야 한다.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/app/
git commit -m "feat: Workspace를 /app 경로로 이동"
```

---

### Task 4: 랜딩 페이지 작성 (`/`)

**Files:**
- Modify: `apps/frontend/src/app/page.tsx` (전면 교체)

- [ ] **Step 1: `app/page.tsx`를 랜딩 페이지로 교체**

`apps/frontend/src/app/page.tsx` 전체를 아래로 교체:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth/AuthModal";
import { Logo } from "@/components/Logo";

export default function LandingPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-neutral-100 px-8 py-5 dark:border-neutral-800">
        <Logo />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAuthMode("login")}
            className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            로그인
          </button>
          <button
            onClick={() => setAuthMode("register")}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-soft"
          >
            지금 시작하기
          </button>
        </div>
      </header>

      {/* 히어로 */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-20 text-center">
        <h1 className="mb-4 text-4xl font-bold leading-tight text-neutral-900 dark:text-white">
          공공기관, 기업의<br />문서 AI 자동화
        </h1>
        <p className="mb-8 max-w-md text-lg text-neutral-500 dark:text-neutral-400">
          AI 기반 문서 작성·변환·배포를 한 곳에서.
          <br />
          누구나 5분 안에 시작할 수 있습니다.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setAuthMode("register")}
            className="rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-soft"
          >
            무료로 시작하기
          </button>
          <button
            onClick={() => setAuthMode("login")}
            className="rounded-lg border border-neutral-200 px-6 py-3 text-base font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            로그인
          </button>
        </div>
      </section>

      {/* 스크린샷 프리뷰 */}
      <section className="flex justify-center px-4 pb-16">
        <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-neutral-200 shadow-2xl dark:border-neutral-700">
          {/* 브라우저 크롬 */}
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <div className="mx-4 flex-1 rounded bg-white px-3 py-1 text-center text-xs text-neutral-400 dark:bg-neutral-700">
              docuax.vercel.app/app
            </div>
          </div>
          {/* 앱 프리뷰 영역 */}
          <div className="flex h-72 items-center justify-center bg-neutral-50 dark:bg-neutral-900">
            <div className="text-center">
              <div className="mb-3 text-5xl">📄</div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                DocuAX — 문서 AI 워크스페이스
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-600">
                가입 후 바로 사용해보세요
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 기능 칩 */}
      <section className="flex justify-center pb-16">
        <div className="flex flex-wrap justify-center gap-3 px-4">
          {[
            "✦ 역관목조분 프롬프트 빌더",
            "✦ 공문 원클릭 정돈",
            "✦ 세대별 톤 변환",
          ].map((label) => (
            <span
              key={label}
              className="rounded-full border border-brand/20 bg-brand/5 px-4 py-2 text-sm font-medium text-brand"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* 푸터 */}
      <footer className="flex items-center justify-between border-t border-neutral-100 px-8 py-6 text-xs text-neutral-400 dark:border-neutral-800">
        <span>© 2026 DocuAX</span>
        <div className="flex gap-4">
          <a href="/terms" className="hover:text-neutral-600 dark:hover:text-neutral-300">
            이용약관
          </a>
          <a href="/privacy" className="hover:text-neutral-600 dark:hover:text-neutral-300">
            개인정보처리방침
          </a>
        </div>
      </footer>

      {/* 인증 모달 */}
      {authMode && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={() => router.push("/app")}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: `http://localhost:3000/` 에서 랜딩 페이지 확인**

- 로고·헤드라인·버튼·기능칩·푸터가 보여야 한다.
- [무료로 시작하기] 클릭 → AuthModal 회원가입 탭이 열려야 한다.
- [로그인] 클릭 → AuthModal 로그인 탭이 열려야 한다.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/page.tsx
git commit -m "feat: / 랜딩 페이지 추가 (스크린샷 프리뷰 + CTA)"
```

---

### Task 5: AuthModal 익명 사용 안내 문구 제거

이제 익명 사용은 불가능하므로 모달 하단의 안내 문구를 제거한다.

**Files:**
- Modify: `apps/frontend/src/components/auth/AuthModal.tsx`

- [ ] **Step 1: 모달 하단 익명 사용 안내 제거**

`AuthModal.tsx`에서 아래 블록을 찾아 삭제:
```tsx
<div className="mt-3 text-center text-[10px] text-neutral-400">
  ⓘ 비밀번호는 bcrypt로 해시되어 저장됩니다. 로그인 없이도 익명으로 사용 가능합니다.
</div>
```

삭제 후 그 자리에 아래로 교체:
```tsx
<div className="mt-3 text-center text-[10px] text-neutral-400">
  ⓘ 비밀번호는 bcrypt로 안전하게 해시되어 저장됩니다.
</div>
```

- [ ] **Step 2: 모달 열어서 문구 확인**

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/auth/AuthModal.tsx
git commit -m "fix: AuthModal 익명 사용 안내 문구 제거"
```

---

### Task 6: 로그아웃 후 랜딩 페이지로 이동

현재 로그아웃은 `setAuthToken(null)`만 호출한다. 쿠키도 지워지므로 middleware가 `/`로 리다이렉트한다. 하지만 명시적으로 `window.location.href = '/'`를 추가해 즉시 이동시킨다.

**Files:**
- Modify: `apps/frontend/src/lib/api.ts`

- [ ] **Step 1: logout 함수 확인 및 수정**

`api.ts`에서 `logout` 함수를 찾아 아래와 같이 수정:
```typescript
export async function logout(): Promise<void> {
  try {
    await http<void>("/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  setAuthToken(null);
  // 쿠키가 지워졌으므로 랜딩으로 이동
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}
```

- [ ] **Step 2: 로그아웃 동작 확인**

앱에서 로그아웃 버튼 클릭 → `/`(랜딩 페이지)로 이동되면 성공.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/api.ts
git commit -m "feat: 로그아웃 후 랜딩 페이지(/)로 이동"
```

---

### Task 7: 전체 플로우 검증 및 Vercel 배포

- [ ] **Step 1: 전체 시나리오 테스트**

| 시나리오 | 기대 동작 |
|----------|----------|
| 비로그인 → `/` 접속 | 랜딩 페이지 표시 |
| 비로그인 → `/app` 직접 접속 | `/`로 리다이렉트 |
| 랜딩에서 회원가입 | AuthModal 가입 → `/app` 이동 |
| 랜딩에서 로그인 | AuthModal 로그인 → `/app` 이동 |
| 로그인 상태 → `/` 접속 | `/app`으로 리다이렉트 |
| 로그아웃 | `/`로 이동 |

- [ ] **Step 2: GitHub push**

```bash
git push origin main
```

- [ ] **Step 3: Vercel 자동 배포 확인**

Vercel 대시보드 → 새 배포 완료 확인.  
배포 URL: `https://docuax-qxyndyy63-specialdatastrategist-1934s-projects.vercel.app`

- [ ] **Step 4: 배포된 URL에서 위 시나리오 재확인**
