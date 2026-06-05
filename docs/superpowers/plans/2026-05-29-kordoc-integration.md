# kordoc 연동 6종 기능 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kordoc 기반 HWP 임포트·신구대조표·양식 채우기·배치 처리·MCP 서버·실시간 자동 변환 6종 기능을 DocuAX에 추가한다.

**Architecture:** Phase 1(HWP 임포트·자동 변환) → Phase 2(신구대조표·양식 채우기) → Phase 3(배치 처리·MCP 서버) 순서로 독립 구현. 프론트엔드는 Next.js App Router, 백엔드는 FastAPI 패턴을 따른다.

**Tech Stack:** kordoc(npm), diff(npm), Next.js API Routes, React, Zustand, FastAPI

---

## Phase 1

---

### Task 1: npm 패키지 설치

**Files:**
- Modify: `apps/frontend/package.json`

- [ ] **Step 1: kordoc·diff 설치**

```bash
cd apps/frontend
npm install kordoc diff
npm install --save-dev @types/diff
```

Expected output:
```
added kordoc@x.x.x
added diff@x.x.x
added @types/diff@x.x.x
```

- [ ] **Step 2: 설치 확인**

```bash
node -e "require('kordoc'); console.log('kordoc OK')"
node -e "require('diff'); console.log('diff OK')"
```

Expected: `kordoc OK`, `diff OK`

- [ ] **Step 3: 커밋**

```bash
cd ../..
git add apps/frontend/package.json apps/frontend/package-lock.json
git commit -m "chore(frontend): kordoc, diff npm 패키지 추가"
```

---

### Task 2: HWP 파싱 API Route

**Files:**
- Create: `apps/frontend/src/app/api/parse-hwp/route.ts`

- [ ] **Step 1: API Route 파일 생성**

`apps/frontend/src/app/api/parse-hwp/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 50MB 이하여야 합니다" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["hwp", "hwpx"].includes(ext ?? "")) {
      return NextResponse.json(
        { error: "HWP 또는 HWPX 파일만 지원합니다" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // kordoc 동적 import (서버사이드 전용)
    const { parseDocument } = await import("kordoc");
    const result = await parseDocument(buffer, {
      format: ext as "hwp" | "hwpx",
    });

    const markdown = result.toMarkdown();
    const title = file.name.replace(/\.(hwp|hwpx)$/i, "");

    return NextResponse.json({ markdown, title });
  } catch (err) {
    console.error("HWP 파싱 오류:", err);
    return NextResponse.json(
      {
        error:
          "파일을 읽을 수 없습니다. 암호화된 파일이거나 손상된 파일일 수 있습니다.",
      },
      { status: 422 }
    );
  }
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd ../..
git add apps/frontend/src/app/api/parse-hwp/route.ts
git commit -m "feat(api): HWP/HWPX 파일 파싱 API Route 추가 (kordoc)"
```

---

### Task 3: HwpDropZone 컴포넌트

**Files:**
- Create: `apps/frontend/src/components/editor/HwpDropZone.tsx`
- Modify: `apps/frontend/src/components/editor/Editor.tsx`

- [ ] **Step 1: HwpDropZone 컴포넌트 생성**

`apps/frontend/src/components/editor/HwpDropZone.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useWorkspace } from "@/store/workspace";

export function HwpDropZone() {
  const setSource = useWorkspace((s) => s.setSource);
  const setTitle = useWorkspace((s) => s.setTitle);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-hwp", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "파싱 실패");
      setSource(data.markdown ?? "");
      if (data.title) setTitle(data.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex items-center gap-2 rounded border border-dashed px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
        dragging
          ? "border-brand bg-brand/5 text-brand"
          : "border-neutral-300 text-neutral-500 hover:border-brand hover:text-brand dark:border-neutral-700"
      }`}
      onClick={() => inputRef.current?.click()}
      title="HWP/HWPX 파일을 드래그하거나 클릭해서 열기"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".hwp,.hwpx"
        className="hidden"
        onChange={handleChange}
      />
      {loading ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          <span>파싱 중…</span>
        </>
      ) : (
        <>
          <FileUp size={12} />
          <span>HWP 열기</span>
        </>
      )}
      {error && (
        <span className="ml-1 text-rose-500" title={error}>⚠</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: workspace.ts에 setTitle 있는지 확인 후 없으면 추가**

`apps/frontend/src/store/workspace.ts`에서 `setTitle` 검색:

```bash
grep -n "setTitle\|title" apps/frontend/src/store/workspace.ts | head -10
```

`setTitle`이 없으면 store에 추가:
```typescript
// state에 추가
title: string;
// action에 추가
setTitle: (t: string) => void;
// 구현부에 추가
setTitle: (t) => set({ title: t }),
```

- [ ] **Step 3: Editor.tsx 상단 툴바에 HwpDropZone 추가**

`apps/frontend/src/components/editor/Editor.tsx`에서 제목 입력 필드나 상단 버튼 영역을 찾아 HwpDropZone 임포트·삽입:

```tsx
import { HwpDropZone } from "./HwpDropZone";
```

에디터 상단 버튼 행(📖 템플릿, ✨ 프롬프트 등이 있는 div)에 추가:
```tsx
<HwpDropZone />
```

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
cd ../..
git add apps/frontend/src/components/editor/HwpDropZone.tsx \
        apps/frontend/src/components/editor/Editor.tsx \
        apps/frontend/src/store/workspace.ts
git commit -m "feat(editor): HWP/HWPX 파일 드래그앤드롭 임포트 기능 추가"
```

---

### Task 4: 실시간 자동 변환 (Watch 모드)

**Files:**
- Modify: `apps/frontend/src/store/workspace.ts`
- Modify: `apps/frontend/src/components/editor/Editor.tsx`
- Modify: `apps/frontend/src/components/TopBar.tsx`

- [ ] **Step 1: workspace.ts에 autoConvert 상태 추가**

`apps/frontend/src/store/workspace.ts`에서 state interface와 구현에 추가:

```typescript
// WorkspaceState interface에 추가
autoConvert: boolean;
setAutoConvert: (v: boolean) => void;

// 초기값 (create 블록)
autoConvert: false,

// 구현
setAutoConvert: (v) => {
  set({ autoConvert: v });
  try { localStorage.setItem("docuax_auto_convert", String(v)); } catch {}
},
```

초기값을 localStorage에서 복원하려면 초기화 부분에도 추가:
```typescript
autoConvert: (() => {
  try { return localStorage.getItem("docuax_auto_convert") === "true"; }
  catch { return false; }
})(),
```

- [ ] **Step 2: Editor.tsx에 debounce 자동 변환 useEffect 추가**

Editor 컴포넌트 내부에 추가 (기존 source useEffect 아래):

```tsx
const autoConvert = useWorkspace((s) => s.autoConvert);

// 자동 변환 debounce (2.5초)
useEffect(() => {
  if (!autoConvert || !source.trim()) return;
  const timer = setTimeout(() => {
    // WorkerConvertPanel의 onConvert를 직접 호출하는 대신
    // 전역 이벤트로 트리거
    window.dispatchEvent(new CustomEvent("docuax:auto-convert"));
  }, 2500);
  return () => clearTimeout(timer);
}, [source, autoConvert]);
```

WorkerConvertPanel이나 상위 컴포넌트에서 이벤트 수신:
```tsx
useEffect(() => {
  const handler = () => { if (!busy) onConvert({ forceFast: true }); };
  window.addEventListener("docuax:auto-convert", handler);
  return () => window.removeEventListener("docuax:auto-convert", handler);
}, [busy, onConvert]);
```

위 이벤트 리스너는 `WorkerConvertPanel.tsx` 컴포넌트 내부에 추가한다.

- [ ] **Step 3: TopBar에 자동 변환 토글 버튼 추가**

`apps/frontend/src/components/TopBar.tsx`:

```tsx
// 상단에 import 추가
import { useWorkspace } from "@/store/workspace";

// TopBar 컴포넌트 내부에 추가
const autoConvert = useWorkspace((s) => s.autoConvert);
const setAutoConvert = useWorkspace((s) => s.setAutoConvert);
```

네비게이션 링크 영역(슬라이드 링크 앞)에 버튼 추가:

```tsx
{/* 자동 변환 토글 */}
<button
  onClick={() => setAutoConvert(!autoConvert)}
  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
    autoConvert
      ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
      : "border-neutral-200 text-neutral-500 hover:border-brand hover:text-brand dark:border-neutral-700"
  }`}
  title={autoConvert ? "자동 변환 켜짐 — 입력 후 2.5초 자동 변환" : "자동 변환 꺼짐"}
>
  {autoConvert ? "⚡ 자동" : "⚡ 수동"}
</button>
```

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
cd ../..
git add apps/frontend/src/store/workspace.ts \
        apps/frontend/src/components/editor/Editor.tsx \
        apps/frontend/src/components/remote/WorkerConvertPanel.tsx \
        apps/frontend/src/components/TopBar.tsx
git commit -m "feat(editor): 실시간 자동 변환 Watch 모드 추가 (2.5s debounce)"
```

---

## Phase 2

---

### Task 5: 신구대조표 (문서 비교 뷰)

**Files:**
- Modify: `apps/frontend/src/store/workspace.ts`
- Create: `apps/frontend/src/components/preview/DiffView.tsx`
- Modify: `apps/frontend/src/components/preview/PreviewPane.tsx`

- [ ] **Step 1: workspace.ts에 prevSource 추가**

```typescript
// WorkspaceState interface에 추가
prevSource: string | null;
setPrevSource: (s: string | null) => void;

// 초기값
prevSource: null,

// 구현
setPrevSource: (s) => set({ prevSource: s }),
```

변환 성공 시 source를 prevSource에 저장하는 로직은 변환 호출 지점(`WorkerConvertPanel` 또는 변환 API 호출 직전)에 추가:

`apps/frontend/src/components/remote/WorkerConvertPanel.tsx`에서 `onConvert` 호출 전:
```tsx
const setPrevSource = useWorkspace((s) => s.setPrevSource);
const source = useWorkspace((s) => s.source);
// onConvert 호출 직전:
setPrevSource(source);
onConvert(opts);
```

- [ ] **Step 2: DiffView 컴포넌트 생성**

`apps/frontend/src/components/preview/DiffView.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import * as Diff from "diff";

interface Props {
  oldText: string;
  newText: string;
}

export function DiffView({ oldText, newText }: Props) {
  const parts = useMemo(
    () => Diff.diffLines(oldText, newText, { ignoreWhitespace: false }),
    [oldText, newText]
  );

  const added = parts.filter((p) => p.added).length;
  const removed = parts.filter((p) => p.removed).length;

  return (
    <div className="h-full overflow-auto p-4 font-mono text-[12px]">
      <div className="mb-3 flex gap-3 text-[11px]">
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          +{added} 추가
        </span>
        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          -{removed} 삭제
        </span>
      </div>
      <div className="space-y-0.5">
        {parts.map((part, i) => (
          <pre
            key={i}
            className={`whitespace-pre-wrap rounded px-2 py-0.5 leading-relaxed ${
              part.added
                ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                : part.removed
                ? "bg-rose-50 text-rose-900 line-through opacity-60 dark:bg-rose-950/50 dark:text-rose-300"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {part.added ? "+ " : part.removed ? "- " : "  "}
            {part.value}
          </pre>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: PreviewPane에 비교 버튼 + DiffView 추가**

`apps/frontend/src/components/preview/PreviewPane.tsx`:

상단 import에 추가:
```tsx
import { DiffView } from "./DiffView";
```

컴포넌트 내부에 추가:
```tsx
const prevSource = useWorkspace((s) => s.prevSource);
const source = useWorkspace((s) => s.source);
const [showDiff, setShowDiff] = useState(false);
```

툴바(복사 버튼 앞)에 비교 버튼 추가:
```tsx
{preview && prevSource && (
  <button
    onClick={() => setShowDiff((v) => !v)}
    className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold transition-all ${
      showDiff
        ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300"
        : "border-neutral-200 bg-white text-neutral-600 hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
    }`}
    title="신구대조표 — 이전 버전과 비교"
  >
    📋 비교
  </button>
)}
```

미리보기 본문 영역을 조건 렌더링으로 교체:
```tsx
{showDiff && prevSource ? (
  <DiffView oldText={prevSource} newText={source} />
) : (
  // 기존 미리보기 JSX
  ...
)}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
cd ../..
git add apps/frontend/src/store/workspace.ts \
        apps/frontend/src/components/preview/DiffView.tsx \
        apps/frontend/src/components/preview/PreviewPane.tsx \
        apps/frontend/src/components/remote/WorkerConvertPanel.tsx
git commit -m "feat(preview): 신구대조표 문서 비교 뷰 추가"
```

---

### Task 6: 양식 자동 채우기 패널

**Files:**
- Create: `apps/frontend/src/components/editor/FormFillPanel.tsx`
- Modify: `apps/frontend/src/components/editor/Editor.tsx`

- [ ] **Step 1: FormFillPanel 컴포넌트 생성**

`apps/frontend/src/components/editor/FormFillPanel.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useWorkspace } from "@/store/workspace";

// 감지 패턴: {필드명}, ___(필드명), 〇〇(필드명)
const FIELD_REGEX = /\{([^}]{1,30})\}|_{3,}(?:\(([^)]+)\))?|〇{2,}(?:\(([^)]+)\))?/g;

function extractFields(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let m: RegExpExecArray | null;
  FIELD_REGEX.lastIndex = 0;
  while ((m = FIELD_REGEX.exec(text)) !== null) {
    const name = m[1] ?? m[2] ?? m[3] ?? `필드${result.length + 1}`;
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function FormFillPanel() {
  const source = useWorkspace((s) => s.source);
  const setSource = useWorkspace((s) => s.setSource);
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  const fields = useMemo(() => extractFields(source), [source]);

  // 필드 감지 시 패널 자동 표시
  useEffect(() => {
    if (fields.length > 0) setOpen(true);
  }, [fields.length]);

  if (fields.length === 0) return null;

  const handleFill = () => {
    let filled = source;
    Object.entries(values).forEach(([field, value]) => {
      if (!value) return;
      filled = filled
        .replaceAll(`{${field}}`, value)
        .replace(new RegExp(`_{3,}(?:\\(${field}\\))?`, "g"), value)
        .replace(new RegExp(`〇{2,}(?:\\(${field}\\))?`, "g"), value);
    });
    setSource(filled);
    setValues({});
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-400"
      >
        📝 {fields.length}개 필드
      </button>
    );
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
          📝 양식 자동 채우기 — {fields.length}개 필드 감지
        </span>
        <button onClick={() => setOpen(false)}>
          <X size={12} className="text-neutral-400 hover:text-neutral-700" />
        </button>
      </div>
      <div className="space-y-1.5">
        {fields.map((field) => (
          <div key={field} className="flex items-center gap-2">
            <label className="w-24 shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {field}
            </label>
            <input
              value={values[field] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              placeholder={`{${field}} 값 입력`}
              className="flex-1 rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleFill}
        disabled={Object.values(values).every((v) => !v)}
        className="mt-2 rounded bg-amber-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
      >
        채우기 적용
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Editor.tsx에 FormFillPanel 삽입**

`apps/frontend/src/components/editor/Editor.tsx`에 import 추가:
```tsx
import { FormFillPanel } from "./FormFillPanel";
```

에디터 textarea 위나 버튼 행 아래에 추가:
```tsx
<FormFillPanel />
```

- [ ] **Step 3: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
cd ../..
git add apps/frontend/src/components/editor/FormFillPanel.tsx \
        apps/frontend/src/components/editor/Editor.tsx
git commit -m "feat(editor): 양식 자동 채우기 패널 추가 (플레이스홀더 자동 감지)"
```

---

## Phase 3

---

### Task 7: 배치 처리

**Files:**
- Create: `apps/backend/app/api/v1/batch.py`
- Modify: `apps/backend/app/api/v1/__init__.py`
- Create: `apps/frontend/src/app/batch/page.tsx`
- Modify: `apps/frontend/src/components/TopBar.tsx`

- [ ] **Step 1: 백엔드 배치 변환 엔드포인트 생성**

`apps/backend/app/api/v1/batch.py`:

```python
"""배치 문서 변환 API — 다수 파일을 ZIP으로 일괄 변환."""
from __future__ import annotations

import io
import zipfile

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_optional
from app.core.logging import get_logger
from app.db import get_db
from app.models import User
from app.services.convert import run_convert_pipeline

log = get_logger(__name__)
router = APIRouter()


@router.post("/batch/convert")
async def batch_convert(
    files: list[UploadFile] = File(...),
    output_format: str = Form("hwpx"),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
) -> StreamingResponse:
    """여러 마크다운 파일을 지정 형식으로 일괄 변환 후 ZIP 반환."""
    if output_format not in ("hwpx", "docx", "pdf"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="output_format은 hwpx/docx/pdf 중 하나")

    if len(files) > 20:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="최대 20개 파일까지 가능합니다")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            try:
                content = (await f.read()).decode("utf-8", errors="replace")
                stem = f.filename.rsplit(".", 1)[0] if f.filename else "document"
                result_bytes = await run_convert_pipeline(
                    source=content,
                    output_format=output_format,
                    user_id=str(user.id) if user else None,
                    db=db,
                )
                zf.writestr(f"{stem}.{output_format}", result_bytes)
            except Exception as e:
                log.warning("배치 변환 실패", filename=f.filename, error=str(e))
                zf.writestr(f"{f.filename}.error.txt", str(e))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="docuax_batch.zip"'},
    )
```

> **주의:** `run_convert_pipeline`은 실제 변환 서비스 함수명으로 교체 필요. 없으면 convert.py에서 실제 파이프라인 함수를 확인한 후 올바른 함수를 임포트한다.

- [ ] **Step 2: __init__.py에 배치 라우터 등록**

`apps/backend/app/api/v1/__init__.py`에서 다른 라우터 등록 패턴을 따라 추가:

```python
from app.api.v1 import batch
api_router.include_router(batch.router, tags=["batch"])
```

- [ ] **Step 3: 배치 처리 프론트엔드 페이지 생성**

`apps/frontend/src/app/batch/page.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Download, X } from "lucide-react";

interface FileItem {
  file: File;
  status: "pending" | "done" | "error";
}

export default function BatchPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<"hwpx" | "docx" | "pdf">("hwpx");
  const [loading, setLoading] = useState(false);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList) => {
    const items = Array.from(newFiles)
      .filter((f) => f.name.endsWith(".md") || f.name.endsWith(".txt"))
      .map((f): FileItem => ({ file: f, status: "pending" }));
    setFiles((prev) => [...prev, ...items]);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleConvert = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setZipUrl(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
      const fd = new FormData();
      files.forEach((item) => fd.append("files", item.file));
      fd.append("output_format", format);
      const res = await fetch(`${API}/api/v1/batch/convert`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      setZipUrl(URL.createObjectURL(blob));
      setFiles((prev) => prev.map((f) => ({ ...f, status: "done" })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">배치 변환</h1>
      <p className="mb-6 text-sm text-neutral-500">
        마크다운(.md) 또는 텍스트(.txt) 파일을 여러 개 올려 한 번에 변환합니다.
      </p>

      {/* 드래그앤드롭 영역 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 py-10 hover:border-brand dark:border-neutral-700"
      >
        <FileUp size={32} className="mb-2 text-neutral-400" />
        <p className="text-sm font-medium text-neutral-500">
          파일을 드래그하거나 클릭해서 선택
        </p>
        <p className="text-xs text-neutral-400">.md, .txt 파일 최대 20개</p>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.txt"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* 파일 목록 */}
      {files.length > 0 && (
        <ul className="mb-4 space-y-1">
          {files.map((item, i) => (
            <li key={i} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-1.5 text-sm dark:border-neutral-800">
              <span className="truncate">{item.file.name}</span>
              <div className="flex items-center gap-2">
                {item.status === "done" && <span className="text-emerald-500 text-xs">✓</span>}
                <button onClick={() => removeFile(i)}><X size={12} className="text-neutral-400 hover:text-rose-500" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 출력 형식 + 변환 버튼 */}
      <div className="flex items-center gap-3">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
          className="rounded border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="hwpx">HWPX (한글)</option>
          <option value="docx">DOCX (Word)</option>
          <option value="pdf">PDF</option>
        </select>
        <button
          onClick={handleConvert}
          disabled={loading || files.length === 0}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "변환 중…" : `${files.length}개 파일 변환`}
        </button>
        {zipUrl && (
          <a
            href={zipUrl}
            download="docuax_batch.zip"
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:border-brand hover:text-brand dark:border-neutral-700"
          >
            <Download size={14} />
            ZIP 다운로드
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: TopBar에 "배치" 링크 추가**

`apps/frontend/src/components/TopBar.tsx`에서 "슬라이드" 링크 옆에 추가:

```tsx
<Link href="/batch" className="text-neutral-600 hover:text-brand" title="배치 변환">
  배치
</Link>
```

- [ ] **Step 5: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
cd ../backend && python -c "from app.api.v1 import batch; print('OK')"
```

- [ ] **Step 6: 커밋**

```bash
cd ../..
git add apps/backend/app/api/v1/batch.py \
        apps/backend/app/api/v1/__init__.py \
        apps/frontend/src/app/batch/page.tsx \
        apps/frontend/src/components/TopBar.tsx
git commit -m "feat(batch): 배치 처리 UI + 백엔드 ZIP 변환 엔드포인트 추가"
```

---

### Task 8: MCP 서버 등록

**Files:**
- Create: `apps/backend/app/api/v1/mcp.py`
- Modify: `apps/backend/app/api/v1/__init__.py`
- Create: `apps/frontend/src/app/mcp/page.tsx`
- Modify: `apps/frontend/src/components/TopBar.tsx`

- [ ] **Step 1: MCP 백엔드 엔드포인트 생성**

`apps/backend/app/api/v1/mcp.py`:

```python
"""MCP(Model Context Protocol) 서버 스펙 및 도구 실행 엔드포인트."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter()


def _base_url() -> str:
    s = get_settings()
    return getattr(s, "public_url", "https://docuax-production.up.railway.app")


@router.get("/mcp/spec")
async def mcp_spec() -> dict:
    """MCP 서버 스펙 반환 — Claude Desktop/Cursor에서 이 URL을 등록한다."""
    base = _base_url()
    return {
        "name": "DocuAX",
        "version": "1.0.0",
        "description": "한국어 문서 변환 플랫폼 — 마크다운 ↔ HWPX·DOCX·PDF",
        "tools": [
            {
                "name": "convert_to_hwpx",
                "description": "마크다운 텍스트를 HWPX 한글 문서로 변환합니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string", "description": "변환할 마크다운 텍스트"},
                        "title": {"type": "string", "description": "문서 제목 (선택)"},
                    },
                    "required": ["markdown"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/convert_to_hwpx",
            },
            {
                "name": "convert_to_docx",
                "description": "마크다운 텍스트를 DOCX Word 문서로 변환합니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string"},
                        "title": {"type": "string"},
                    },
                    "required": ["markdown"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/convert_to_docx",
            },
            {
                "name": "convert_to_pdf",
                "description": "마크다운 텍스트를 PDF로 변환합니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string"},
                        "title": {"type": "string"},
                    },
                    "required": ["markdown"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/convert_to_pdf",
            },
            {
                "name": "fill_template",
                "description": "{필드명} 플레이스홀더가 있는 마크다운 템플릿에 값을 채웁니다.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "template": {"type": "string", "description": "{필드명} 패턴이 포함된 마크다운"},
                        "fields": {
                            "type": "object",
                            "description": '{"필드명": "값"} 딕셔너리',
                        },
                    },
                    "required": ["template", "fields"],
                },
                "endpoint": f"{base}/api/v1/mcp/tools/fill_template",
            },
        ],
    }


class ToolRequest(BaseModel):
    markdown: str | None = None
    title: str | None = None
    template: str | None = None
    fields: dict | None = None


@router.post("/mcp/tools/fill_template")
async def mcp_fill_template(req: ToolRequest) -> dict:
    """플레이스홀더 채우기 — 파일 다운로드 없이 채워진 마크다운 반환."""
    if not req.template or not req.fields:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="template과 fields 필수")
    result = req.template
    for key, value in req.fields.items():
        result = result.replace(f"{{{key}}}", str(value))
    return {"markdown": result}
```

- [ ] **Step 2: __init__.py에 MCP 라우터 등록**

`apps/backend/app/api/v1/__init__.py`에 추가:

```python
from app.api.v1 import mcp
api_router.include_router(mcp.router, tags=["mcp"])
```

- [ ] **Step 3: MCP 설정 가이드 페이지 생성**

`apps/frontend/src/app/mcp/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE || "https://docuax-production.up.railway.app";

const CONFIGS = {
  claude: {
    label: "Claude Desktop",
    filename: "claude_desktop_config.json",
    code: JSON.stringify(
      {
        mcpServers: {
          docuax: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-fetch"],
            env: { MCP_SERVER_URL: `${API}/api/v1/mcp/spec` },
          },
        },
      },
      null,
      2
    ),
  },
  cursor: {
    label: "Cursor / Windsurf",
    filename: ".cursor/mcp.json",
    code: JSON.stringify(
      { servers: [{ name: "DocuAX", url: `${API}/api/v1/mcp/spec` }] },
      null,
      2
    ),
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-neutral-400 hover:text-brand">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function McpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">MCP 서버 등록</h1>
      <p className="mb-8 text-sm text-neutral-500">
        AI 에이전트(Claude, Cursor 등)에서 DocuAX의 문서 변환 기능을 직접 호출할 수 있습니다.
      </p>

      {Object.entries(CONFIGS).map(([key, cfg]) => (
        <div key={key} className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{cfg.label}</h2>
            <span className="text-xs text-neutral-400">{cfg.filename}</span>
          </div>
          <div className="relative rounded bg-neutral-950 p-3">
            <pre className="overflow-auto text-xs text-neutral-200">{cfg.code}</pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={cfg.code} />
            </div>
          </div>
        </div>
      ))}

      <div className="rounded-lg bg-brand/5 p-4 text-sm text-brand dark:bg-brand/10">
        <p className="font-semibold mb-1">MCP 서버 스펙 URL</p>
        <code className="text-xs">{API}/api/v1/mcp/spec</code>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: TopBar에 MCP 링크 추가**

`apps/frontend/src/components/TopBar.tsx`에 배치 링크 옆에 추가:

```tsx
<Link href="/mcp" className="text-neutral-600 hover:text-brand" title="MCP 서버 설정">
  MCP
</Link>
```

- [ ] **Step 5: 빌드 확인**

```bash
cd apps/frontend && npx tsc --noEmit
cd ../backend && python -c "from app.api.v1 import mcp; print('OK')"
```

- [ ] **Step 6: 최종 커밋 + 배포**

```bash
cd ../..
git add apps/backend/app/api/v1/mcp.py \
        apps/backend/app/api/v1/__init__.py \
        apps/frontend/src/app/mcp/page.tsx \
        apps/frontend/src/components/TopBar.tsx
git commit -m "feat(mcp): MCP 서버 등록 엔드포인트 + 설정 가이드 페이지"
git push origin main
```

Expected: Vercel·Railway 자동 배포 트리거
