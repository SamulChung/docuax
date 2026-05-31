# 문서 → 슬라이드 내보내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DocuAX 변환 결과 미리보기에 "🎞 슬라이드" 버튼을 추가해, 클릭 시 문서 내용을 /slides 페이지의 생성기에 자동으로 채워준다.

**Architecture:** `PreviewPane`에 버튼을 추가해 `workspace.source`를 `sessionStorage['docuax_slide_prefill']`에 저장 후 `/slides`로 이동. `SlideGeneratorPanel`이 마운트 시 sessionStorage를 읽어 `documentText`를 자동 채우고 즉시 삭제(일회용).

**Tech Stack:** Next.js App Router (`useRouter`), sessionStorage Web API, React `useEffect`, 기존 `useWorkspace` Zustand store

---

## 수정 파일

| 파일 | 변경 |
|------|------|
| `apps/frontend/src/components/preview/PreviewPane.tsx` | 슬라이드 내보내기 버튼 추가 (상단 툴바) |
| `apps/frontend/src/components/slides/SlideGeneratorPanel.tsx` | 마운트 시 sessionStorage 자동 채우기 |

---

### Task 1: PreviewPane에 "🎞 슬라이드" 버튼 추가

**Files:**
- Modify: `apps/frontend/src/components/preview/PreviewPane.tsx`

- [ ] **Step 1: `useRouter` import 추가**

파일 상단 import 블록(`"use client";` 바로 아래)에 추가:

```tsx
import { useRouter } from "next/navigation";
```

기존 import 블록 예시:
```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";   // ← 추가
import { Check, ClipboardCopy, Loader2 } from "lucide-react";
```

- [ ] **Step 2: 컴포넌트 함수 내 router 선언 추가**

PreviewPane 컴포넌트 함수 안에서 기존 `useState` 선언들 아래에 추가:

```tsx
const router = useRouter();
```

- [ ] **Step 3: handleExportToSlides 핸들러 추가**

`PreviewPane` 컴포넌트 함수 내부, 기존 `handleCopy` 함수 정의 아래에 추가:

```tsx
const handleExportToSlides = () => {
  const text = (source ?? "").trim();
  if (!text) return;
  const MAX = 50_000;
  const payload = text.length > MAX ? text.slice(0, MAX) : text;
  try {
    sessionStorage.setItem("docuax_slide_prefill", payload);
  } catch {
    // sessionStorage 접근 불가(프라이빗 브라우저 등) 시 무시
  }
  router.push("/slides");
};
```

`source`는 `useWorkspace`에서 이미 읽고 있는지 확인한다. 없으면 아래처럼 추가:

```tsx
const source = useWorkspace((s) => s.source);
```

- [ ] **Step 4: 버튼 JSX 삽입**

`PreviewPane.tsx` 약 1220번째 줄의 `{/* 📋 전체 복사 */}` 블록 **바로 앞**에 삽입:

```tsx
{/* 🎞 슬라이드 내보내기 */}
{preview && (
  <button
    onClick={handleExportToSlides}
    disabled={!source?.trim()}
    className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600 transition-all hover:border-brand hover:text-brand disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
    title="문서 내용을 슬라이드 생성기로 내보내기"
  >
    🎞 슬라이드
  </button>
)}
```

- [ ] **Step 5: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add apps/frontend/src/components/preview/PreviewPane.tsx
git commit -m "feat(preview): 슬라이드 내보내기 버튼 추가"
```

---

### Task 2: SlideGeneratorPanel에 sessionStorage 자동 채우기

**Files:**
- Modify: `apps/frontend/src/components/slides/SlideGeneratorPanel.tsx`

- [ ] **Step 1: useEffect import 추가**

파일 상단 import 수정:

```tsx
import { useEffect, useState } from "react";
```

(기존에 `useState`만 있었으면 `useEffect` 추가)

- [ ] **Step 2: 마운트 시 sessionStorage 읽기 useEffect 추가**

`SlideGeneratorPanel` 컴포넌트 함수 내부, `useState` 선언들 바로 아래에 추가:

```tsx
// 문서 → 슬라이드 내보내기: PreviewPane에서 sessionStorage로 전달된 텍스트 자동 채우기
useEffect(() => {
  try {
    const prefill = sessionStorage.getItem("docuax_slide_prefill");
    if (prefill) {
      setMode("document");
      setDocumentText(prefill);
      sessionStorage.removeItem("docuax_slide_prefill"); // 일회용
    }
  } catch {
    // sessionStorage 접근 불가 시 무시
  }
}, []); // 마운트 1회만 실행
```

- [ ] **Step 3: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/frontend/src/components/slides/SlideGeneratorPanel.tsx
git commit -m "feat(slides): 문서→슬라이드 prefill — sessionStorage 자동 채우기"
```

---

### Task 3: 통합 확인 및 배포

**Files:**
- No new files

- [ ] **Step 1: 로컬 동작 확인**

1. `apps/frontend`에서 `npm run dev` 실행
2. 브라우저에서 `http://localhost:3000` 접속
3. 문서 편집기에 마크다운 텍스트 입력 후 변환 실행
4. 미리보기 상단 툴바에 "🎞 슬라이드" 버튼 확인
5. 클릭 → `/slides` 이동 → `SlideGeneratorPanel`의 문서 텍스트 영역에 내용 자동 입력 확인
6. 지시문 입력 후 생성 클릭 → 슬라이드 생성 확인

- [ ] **Step 2: 엣지 케이스 확인**

- 문서 없이(source 빈 값) 버튼이 disabled 상태인지 확인
- /slides 에서 뒤로가기 후 다시 방문 시 텍스트가 없는지 확인 (sessionStorage 삭제됨)

- [ ] **Step 3: Push 및 Vercel 배포 확인**

```bash
git push origin main
```

Expected: Vercel 자동 배포 트리거, 약 1분 후 `docuax.vercel.app` 반영
