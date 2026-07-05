# 글집 편집 경험 완성 (Phase 1) — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동 저장+복구, 문서 보관함(서버 CRUD), 찾기/바꾸기, 인쇄, 목차, 명령 팔레트, DOCX 가져오기 — 워드프로세서 기본기 7종 완성.

**Architecture:** 프론트는 기존 Zustand 스토어·editorCommands·shell 컴포넌트 체계를 확장. 백엔드는 **기존 `Document` 모델(tables.py:60, title/source_md/updated_at 이미 존재)을 재사용**해 CRUD 라우터만 신설 — 마이그레이션 불필요. 명령 팔레트는 MenuBar·Ribbon과 명령 레지스트리(lib/commands.ts)를 공유해 중복 제거.

**Tech Stack:** 기존 스택 + `@codemirror/search`, `mammoth`, `turndown` (신규 프론트 의존성 3개)

**설계서:** `docs/superpowers/specs/2026-07-06-guelzip-editing-experience-design.md`
**브랜치:** `feature/editing-experience` (이미 체크아웃됨)

**핵심 관례 (v3 사이클에서 확립):**
- 프론트 Jest 테스트는 반드시 `apps/frontend/src/__tests__/` 아래 (jest testMatch 제약)
- 커밋 시 자기 파일만 스테이지 (`git add <구체 경로>`), index.lock 충돌 시 2-5초 후 재시도
- `.claude/settings.local.json`, `AuthModal.tsx`, `slide_generator.py`, `tsconfig.tsbuildinfo`, 미추적 잡파일은 절대 스테이지 금지
- 백엔드 인증 패턴: `user: Annotated[User, Depends(get_current_user)]` + `db: AsyncSession = Depends(get_db)` (app/api/deps.py, app/db)
- 검증 명령: 프론트 `cd apps/frontend && npx tsc --noEmit && npx jest --watchAll=false` (현재 31개) / 백엔드 `cd apps/backend && python -m pytest tests/ -q` (현재 184개)

---

## 파일 구조 총괄

```
apps/frontend/src/
├── lib/draft.ts                          [신규] localStorage 임시 저장
├── lib/outline.ts                        [신규] 마크다운 헤딩 파서
├── lib/commands.ts                       [신규] 명령 레지스트리 (팔레트·메뉴 공유)
├── lib/docxImport.ts                     [신규] DOCX→마크다운 변환
├── lib/api.ts                            [수정] documents CRUD 함수 5종
├── lib/editorCommands.ts                 [수정] scrollToLine 추가
├── store/workspace.ts                    [수정] currentDocId·dirty·lastSavedAt·saveState
├── components/Workspace.tsx              [수정] draft 복구·서버 자동저장 훅·팔레트 마운트
├── components/editor/MarkdownEditor.tsx  [수정] search()·Ctrl+S·Ctrl+K 키맵
├── components/editor/HwpDropZone.tsx     [수정] .docx 분기 추가
├── components/shell/MenuBar.tsx          [수정] 파일 메뉴 확장·commands.ts 사용
├── components/shell/StatusBar.tsx        [수정] 저장 상태 표시
├── components/shell/DocumentPicker.tsx   [신규] 문서 열기 모달
├── components/shell/OutlinePanel.tsx     [신규] 목차 사이드바
├── components/shell/CommandPalette.tsx   [신규] Ctrl+K 팔레트
├── components/shell/RibbonToolbar.tsx    [수정] 목차 토글 버튼
└── styles/globals.css                    [수정] @media print

apps/backend/
├── app/api/v1/documents.py               [신규] CRUD 라우터
├── app/api/v1/__init__.py                [수정] documents 등록
└── tests/test_documents_api.py           [신규]
```

각 태스크 종료 시 커밋. 메시지는 한국어 `feat(scope): …` 관례.

---

### Task 1: 자동 저장 + 복구 (draft)

**Files:**
- Create: `apps/frontend/src/lib/draft.ts`
- Modify: `apps/frontend/src/store/workspace.ts` (구독 등록)
- Modify: `apps/frontend/src/components/Workspace.tsx` (복구 훅)
- Modify: `apps/frontend/src/components/shell/StatusBar.tsx`
- Test: `apps/frontend/src/__tests__/lib/draft.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { saveDraft, loadDraft, clearDraft, DRAFT_KEY } from "@/lib/draft";

describe("draft", () => {
  afterEach(() => localStorage.removeItem(DRAFT_KEY));

  it("saveDraft → loadDraft 왕복", () => {
    saveDraft({ source: "# 제목", title: "문서1" });
    const d = loadDraft();
    expect(d?.source).toBe("# 제목");
    expect(d?.title).toBe("문서1");
    expect(typeof d?.savedAt).toBe("number");
  });

  it("빈 source는 저장하지 않고 기존 draft를 지운다", () => {
    saveDraft({ source: "x", title: "" });
    saveDraft({ source: "", title: "" });
    expect(loadDraft()).toBeNull();
  });

  it("clearDraft로 삭제", () => {
    saveDraft({ source: "x", title: "" });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("깨진 JSON이면 null (throw 금지)", () => {
    localStorage.setItem(DRAFT_KEY, "{broken");
    expect(loadDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/__tests__/lib/draft.test.ts` → 모듈 없음 FAIL

- [ ] **Step 3: draft.ts 구현**

```ts
/** localStorage 임시 저장 — 새로고침·탭 닫기로 인한 작업 유실 방지. */
export const DRAFT_KEY = "guelzip_draft";

export interface Draft {
  source: string;
  title: string;
  savedAt: number;
}

export function saveDraft(d: { source: string; title: string }): void {
  try {
    if (!d.source.trim()) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const draft: Draft = { ...d, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 사파리 프라이빗 등 접근 불가 시 무시 (기존 패턴)
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return typeof d.source === "string" && typeof d.savedAt === "number" ? d : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
```

- [ ] **Step 4: 통과 확인** — PASS (4 tests)

- [ ] **Step 5: 스토어 연결**

`store/workspace.ts`에 저장 상태 필드 추가 (WorkspaceState + 구현):

```ts
  /** 저장 상태 — draft: 로컬 임시, saved: 서버 저장됨, error: 서버 저장 실패 */
  saveState: { kind: "none" | "draft" | "saved" | "error"; at: number | null };
  setSaveState: (s: WorkspaceState["saveState"]) => void;
```

```ts
  saveState: { kind: "none", at: null },
  setSaveState: (s) => set({ saveState: s }),
```

파일 하단(스토어 정의 뒤)에 1초 디바운스 구독 — SSR 가드 필수:

```ts
// ── 자동 임시 저장 — source/title 변경 1초 후 localStorage 기록 ──
if (typeof window !== "undefined") {
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  useWorkspace.subscribe((state, prev) => {
    if (state.source === prev.source && state.title === prev.title) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      saveDraft({ source: useWorkspace.getState().source, title: useWorkspace.getState().title });
      if (useWorkspace.getState().source.trim()) {
        useWorkspace.getState().setSaveState({ kind: "draft", at: Date.now() });
      }
    }, 1000);
  });
}
```

주의: zustand 기본 `subscribe(listener)`는 `(state, prevState)` 두 인자를 받는다 (subscribeWithSelector 미들웨어 불필요). import 추가: `import { saveDraft } from "@/lib/draft";`

`resetWorkspace`에 `clearDraft()` 호출 추가 (import 포함) + `saveState: { kind: "none", at: null }` 리셋.

- [ ] **Step 6: 복구 훅 — Workspace.tsx**

`Workspace` 컴포넌트에 마운트 1회 복구:

```tsx
  // 임시 저장 복구 — 에디터가 비어 있을 때만 (마운트 1회)
  useEffect(() => {
    const { source, setSource, setTitle } = useWorkspace.getState();
    if (source.trim()) return;
    const draft = loadDraft();
    if (draft?.source) {
      setSource(draft.source);
      setTitle(draft.title);
      useWorkspace.getState().setSaveState({ kind: "draft", at: draft.savedAt });
    }
  }, []);
```

import: `useEffect`, `loadDraft`.

- [ ] **Step 7: StatusBar 저장 상태 표시**

`StatusBar.tsx`의 글자수 span 뒤에 추가:

```tsx
      {saveState.kind !== "none" && saveState.at && (
        <span className={saveState.kind === "error" ? "text-red-500" : ""}>
          {saveState.kind === "draft" && `임시 저장됨 ${fmtTime(saveState.at)}`}
          {saveState.kind === "saved" && `저장됨 ${fmtTime(saveState.at)}`}
          {saveState.kind === "error" && "저장 실패 — 로컬 백업 유지"}
        </span>
      )}
```

컴포넌트 밖 헬퍼:

```tsx
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
```

셀렉터 추가: `const saveState = useWorkspace((s) => s.saveState);`

- [ ] **Step 8: 검증** — `npx tsc --noEmit && npx jest --watchAll=false` (35개) 후 수동: 입력→새로고침→내용 복구 확인.

- [ ] **Step 9: 커밋** — `feat(draft): 자동 임시 저장 + 새로고침 복구 (작업 유실 방지)`

---

### Task 2: 문서 CRUD API (백엔드)

기존 `Document` 모델(app/models/tables.py:60 — id/user_id/title/source_md/status/created_at/updated_at 등 이미 존재)을 그대로 사용. 마이그레이션 없음.

**Files:**
- Create: `apps/backend/app/api/v1/documents.py`
- Modify: `apps/backend/app/api/v1/__init__.py` (import + include_router)
- Test: `apps/backend/tests/test_documents_api.py`

- [ ] **Step 1: 실패 테스트 작성** — 기존 `tests/test_integration.py`의 ASGITransport/AsyncClient + lifespan 패턴을 그대로 따른다 (파일을 먼저 읽고 fixture 구성을 복사). 테스트 케이스:

```python
# 개요 (패턴은 test_integration.py 를 따름 — 사용자 등록 후 토큰으로 호출):
# 1. test_create_and_get_document — POST {title, source_md} → 200, id 반환;
#    GET /documents/{id} → source_md 일치
# 2. test_list_documents — 2건 생성 후 GET /documents → 2건, updated_at 내림차순,
#    항목에 preview(본문 앞 120자) 포함, source_md 미포함
# 3. test_update_document — PUT {source_md: "수정"} → GET에서 반영, updated_at 갱신
# 4. test_delete_document — DELETE → 200, GET → 404
# 5. test_ownership_isolation — 사용자 A 문서를 사용자 B 토큰으로 GET/PUT/DELETE → 404
# 6. test_unauthenticated — 토큰 없이 GET /documents → 401
# 7. test_size_limit — source_md 2MB 초과 POST → 413
```

각 케이스를 실제 코드로 작성한다 (위 개요의 숫자·조건 그대로).

- [ ] **Step 2: 실패 확인** — `python -m pytest tests/test_documents_api.py -q` → 404 (라우터 없음) FAIL

- [ ] **Step 3: documents.py 구현**

```python
"""문서 보관함 CRUD — 사용자 소유 문서의 저장·목록·열기·삭제.

기존 Document 모델(tables.py)을 재사용한다. 소유권: 본인 문서만 접근,
타인 문서는 존재 여부를 숨기기 위해 404.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.tables import Document, User

router = APIRouter()

MAX_SOURCE_BYTES = 2 * 1024 * 1024  # 2MB


class DocumentCreate(BaseModel):
    title: str = Field(default="", max_length=500)
    source_md: str = ""


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    source_md: str | None = None


class DocumentOut(BaseModel):
    id: str
    title: str
    source_md: str
    created_at: str
    updated_at: str


class DocumentListItem(BaseModel):
    id: str
    title: str
    preview: str
    updated_at: str


def _check_size(source_md: str | None) -> None:
    if source_md is not None and len(source_md.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="문서가 2MB를 초과합니다")


async def _owned(db: AsyncSession, user: User, doc_id: str) -> Document:
    doc = (
        await db.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user.id)
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    return doc


def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        source_md=doc.source_md,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
    )


@router.get("/documents", response_model=list[DocumentListItem])
async def list_documents(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    rows = (
        await db.execute(
            select(Document)
            .where(Document.user_id == user.id)
            .order_by(Document.updated_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    ).scalars().all()
    return [
        DocumentListItem(
            id=d.id, title=d.title, preview=d.source_md[:120],
            updated_at=d.updated_at.isoformat(),
        )
        for d in rows
    ]


@router.post("/documents", response_model=DocumentOut)
async def create_document(
    body: DocumentCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    _check_size(body.source_md)
    doc = Document(user_id=user.id, title=body.title, source_md=body.source_md)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _to_out(doc)


@router.get("/documents/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    return _to_out(await _owned(db, user, doc_id))


@router.put("/documents/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    _check_size(body.source_md)
    doc = await _owned(db, user, doc_id)
    if body.title is not None:
        doc.title = body.title
    if body.source_md is not None:
        doc.source_md = body.source_md
    await db.commit()
    await db.refresh(doc)
    return _to_out(doc)


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    doc = await _owned(db, user, doc_id)
    await db.delete(doc)
    await db.commit()
    return {"success": True}
```

`__init__.py`: import 목록에 `documents` 추가 + `api_router.include_router(documents.router, tags=["documents"])` (알파벳 순서 위치 준수).

주의: `updated_at`은 모델의 `onupdate=_now`로 자동 갱신 — SQLite에서 값 변경이 없으면 onupdate가 발화하지 않으므로 test 3은 source_md를 실제로 다른 값으로 변경할 것.

- [ ] **Step 4: 통과 확인** — `python -m pytest tests/test_documents_api.py -q` PASS (7), 전체 `pytest tests/ -q` 191개 PASS

- [ ] **Step 5: 커밋** — `feat(documents): 문서 보관함 CRUD API (기존 Document 모델 재사용)`

---

### Task 3: 문서 보관함 프론트

**Files:**
- Modify: `apps/frontend/src/lib/api.ts` (documents 함수 5종)
- Modify: `apps/frontend/src/store/workspace.ts` (currentDocId·dirty)
- Create: `apps/frontend/src/components/shell/DocumentPicker.tsx`
- Modify: `apps/frontend/src/components/shell/MenuBar.tsx` (파일 메뉴 확장)
- Modify: `apps/frontend/src/components/editor/MarkdownEditor.tsx` (Ctrl+S)
- Modify: `apps/frontend/src/components/Workspace.tsx` (서버 자동 저장 훅)

- [ ] **Step 1: api.ts에 documents 함수**

기존 `http<T>` 헬퍼 패턴(파일 내 다른 함수 참고)을 그대로 사용:

```ts
// ─── 문서 보관함 ───────────────────────────────────────────────────────────

export interface DocumentListItem {
  id: string;
  title: string;
  preview: string;
  updated_at: string;
}

export interface DocumentOut extends DocumentListItem {
  source_md: string;
  created_at: string;
}

export async function listDocuments(limit = 50, offset = 0) {
  return http<DocumentListItem[]>(`/documents?limit=${limit}&offset=${offset}`);
}

export async function createDocument(input: { title: string; source_md: string }) {
  return http<DocumentOut>("/documents", { method: "POST", body: JSON.stringify(input) });
}

export async function getDocument(id: string) {
  return http<DocumentOut>(`/documents/${id}`);
}

export async function updateDocument(id: string, input: { title?: string; source_md?: string }) {
  return http<DocumentOut>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export async function deleteDocument(id: string) {
  return http<{ success: boolean }>(`/documents/${id}`, { method: "DELETE" });
}
```

(먼저 api.ts의 `http` 시그니처를 읽고 정확히 맞출 것 — preview에서 필드 누락 시 조정.)

- [ ] **Step 2: 스토어 확장**

```ts
  /** 서버 문서 연결 — 열려 있는 서버 문서 id (없으면 순수 로컬) */
  currentDocId: string | null;
  setCurrentDocId: (id: string | null) => void;

  /** 마지막 서버 저장 이후 수정 여부 */
  dirty: boolean;
  setDirty: (d: boolean) => void;
```

구현: `currentDocId: null`, `setCurrentDocId: (id) => set({ currentDocId: id })`, `dirty: false`, `setDirty: (d) => set({ dirty: d })`. `setSource`가 호출되면 dirty가 돼야 하므로 `setSource: (s) => set({ source: sanitizeString(s), dirty: true })`로 변경. `resetWorkspace`에 `currentDocId: null, dirty: false` 추가.

- [ ] **Step 3: 저장 로직 — lib/commands.ts에 두지 말고 우선 MenuBar에서 사용할 헬퍼로 Workspace 근처에** — `lib/docActions.ts` 생성:

```ts
/** 문서 저장/열기 액션 — MenuBar·팔레트·Ctrl+S가 공유. */
import { createDocument, updateDocument } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

/** Ctrl+S / 파일>저장. currentDocId 있으면 PUT, 없으면 제목 확인 후 POST. */
export async function saveCurrentDocument(): Promise<void> {
  const s = useWorkspace.getState();
  if (!s.source.trim()) return;
  try {
    if (s.currentDocId) {
      await updateDocument(s.currentDocId, { title: s.title, source_md: s.source });
    } else {
      const title = s.title || prompt("문서 제목을 입력하세요", "제목 없음") || "";
      if (title === "") return; // 취소
      s.setTitle(title);
      const doc = await createDocument({ title, source_md: s.source });
      s.setCurrentDocId(doc.id);
    }
    s.setDirty(false);
    s.setSaveState({ kind: "saved", at: Date.now() });
  } catch {
    s.setSaveState({ kind: "error", at: Date.now() });
  }
}

/** 다른 이름으로 저장 — 항상 새 문서 생성. */
export async function saveAsNewDocument(): Promise<void> {
  const s = useWorkspace.getState();
  const title = prompt("새 문서 제목", s.title || "제목 없음");
  if (title === null) return;
  try {
    const doc = await createDocument({ title, source_md: s.source });
    s.setCurrentDocId(doc.id);
    s.setTitle(title);
    s.setDirty(false);
    s.setSaveState({ kind: "saved", at: Date.now() });
  } catch {
    s.setSaveState({ kind: "error", at: Date.now() });
  }
}
```

비로그인 시 http()가 401을 던지므로 catch에서 error 상태 표시 — MenuBar 항목에는 로그인 여부에 따라 "(로그인 필요)" 라벨을 붙인다 (getMe SWR 캐시 활용은 과설계 — MenuBar에서 `useSWR("me", ...)`가 이미 TopBar에 있으므로 같은 키 재사용).

- [ ] **Step 4: DocumentPicker 모달**

`components/shell/DocumentPicker.tsx` — 기존 모달 패턴(SamplePicker.tsx를 먼저 읽고 스타일 복사):

```tsx
"use client";

import { useEffect, useState } from "react";
import { FileText, Trash2, X } from "lucide-react";

import { deleteDocument, getDocument, listDocuments } from "@/lib/api";
import type { DocumentListItem } from "@/lib/api";
import { useWorkspace } from "@/store/workspace";

export function DocumentPicker({ onClose }: { onClose: () => void }) {
  const [docs, setDocs] = useState<DocumentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = () =>
    listDocuments()
      .then(setDocs)
      .catch(() => setError("문서 목록을 불러오지 못했습니다. 로그인 상태를 확인해주세요."));

  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    const s = useWorkspace.getState();
    if (s.dirty && s.source.trim() && !confirm("저장하지 않은 변경이 있습니다. 계속할까요?")) return;
    const doc = await getDocument(id);
    s.setSource(doc.source_md);
    s.setTitle(doc.title);
    s.setCurrentDocId(doc.id);
    s.setDirty(false);
    s.setSaveState({ kind: "saved", at: Date.now() });
    onClose();
  };

  const remove = async (id: string) => {
    if (!confirm("이 문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    await deleteDocument(id);
    if (useWorkspace.getState().currentDocId === id) useWorkspace.getState().setCurrentDocId(null);
    load();
  };

  const filtered = (docs ?? []).filter(
    (d) => !query || d.title.includes(query) || d.preview.includes(query),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-bold">문서 열기</h2>
          <button onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
        <div className="px-4 py-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·내용 검색"
            className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <div className="flex-1 overflow-auto px-2 pb-2">
          {error && <p className="p-4 text-xs text-red-500">{error}</p>}
          {docs && filtered.length === 0 && !error && (
            <p className="p-4 text-xs text-neutral-400">저장된 문서가 없습니다. Ctrl+S로 저장해보세요.</p>
          )}
          {filtered.map((d) => (
            <div key={d.id} className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <button onClick={() => open(d.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                <FileText size={14} className="mt-0.5 shrink-0 text-neutral-400" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{d.title || "제목 없음"}</span>
                  <span className="block truncate text-[10px] text-neutral-400">{d.preview}</span>
                  <span className="block text-[10px] text-neutral-400">{new Date(d.updated_at).toLocaleString()}</span>
                </span>
              </button>
              <button
                onClick={() => remove(d.id)}
                className="invisible p-1 text-neutral-400 hover:text-red-500 group-hover:visible"
                aria-label="삭제"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 파일 메뉴 확장 (MenuBar.tsx)**

파일 메뉴를 다음으로 교체 (모달 상태 `const [pickerOpen, setPickerOpen] = useState(false);` 추가, 컴포넌트 끝에 `{pickerOpen && <DocumentPicker onClose={() => setPickerOpen(false)} />}`):

```ts
    파일: [
      { label: "새 문서", action: () => { if (confirm("에디터 내용을 초기화할까요?")) resetWorkspace(); } },
      { label: "열기… (내 문서)", action: () => setPickerOpen(true) },
      "divider",
      { label: "저장 (Ctrl+S)", action: () => void saveCurrentDocument() },
      { label: "다른 이름으로 저장", action: () => void saveAsNewDocument() },
      "divider",
      { label: "마크다운으로 저장 (.md)", action: () => downloadMarkdown(source, title) },
      { label: "인쇄 (Ctrl+P)", action: () => window.print() },
    ],
```

(인쇄 항목은 Task 4에서 CSS가 완성되지만 메뉴는 여기서 함께 추가해 커밋 충돌을 줄인다.)

- [ ] **Step 6: Ctrl+S 키맵 (MarkdownEditor.tsx)**

`formatKeymap`에 추가:

```ts
  { key: "Mod-s", run: () => { void saveCurrentDocument(); return true; }, preventDefault: true },
```

import: `import { saveCurrentDocument } from "@/lib/docActions";`

- [ ] **Step 7: 서버 자동 저장 훅 (Workspace.tsx)**

```tsx
  // 서버 자동 저장 — 로그인 + 서버 문서 연결 + 변경 존재 시 30초마다
  useEffect(() => {
    const timer = setInterval(() => {
      const s = useWorkspace.getState();
      if (s.currentDocId && s.dirty && s.source.trim()) void saveCurrentDocument();
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
```

- [ ] **Step 8: 검증** — tsc·jest 통과 + 수동: 로그인 → 입력 → Ctrl+S(제목 프롬프트) → 상태바 "저장됨" → 파일>열기에서 목록·열기·삭제 확인. 비로그인 → Ctrl+S → 상태바 "저장 실패" + 로컬 draft 유지 확인.

- [ ] **Step 9: 커밋** — `feat(documents): 문서 보관함 — 파일 메뉴·Ctrl+S·열기 모달·서버 자동 저장`

---

### Task 4: 찾기/바꾸기 + 인쇄

**Files:**
- Modify: `apps/frontend/package.json` (`npm i @codemirror/search@^6`)
- Modify: `apps/frontend/src/components/editor/MarkdownEditor.tsx`
- Modify: `apps/frontend/src/components/shell/MenuBar.tsx` (편집 메뉴)
- Modify: `apps/frontend/src/styles/globals.css` (@media print)
- Modify: `apps/frontend/src/components/Workspace.tsx`·`PreviewPane.tsx` 등 (print 숨김 클래스)

- [ ] **Step 1: `npm install @codemirror/search@^6`**

- [ ] **Step 2: MarkdownEditor에 검색 통합**

```ts
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
```

extensions 배열에 (formatKeymap 앞):

```ts
          search({ top: true }),
          keymap.of(searchKeymap),
          EditorState.phrases.of({
            "Find": "찾기", "Replace": "바꾸기", "next": "다음", "previous": "이전",
            "all": "모두", "match case": "대소문자", "regexp": "정규식",
            "by word": "단어 단위", "replace": "바꾸기", "replace all": "모두 바꾸기",
            "close": "닫기", "current match": "현재 일치", "replaced $ matches": "$개 바꿈",
            "replaced match on line $": "$번째 줄에서 바꿈", "on line": "줄",
          }),
```

Ctrl+H 바인딩 (formatKeymap에):

```ts
  { key: "Mod-h", run: (v) => { openSearchPanel(v); return true; }, preventDefault: true },
```

- [ ] **Step 3: 편집 메뉴 항목**

```ts
      "divider",
      { label: "찾기 (Ctrl+F)", action: withEditor((v) => openSearchPanel(v)) },
      { label: "바꾸기 (Ctrl+H)", action: withEditor((v) => openSearchPanel(v)) },
```

import: `openSearchPanel` from `@codemirror/search`.

- [ ] **Step 4: 인쇄 CSS**

`globals.css` 끝에:

```css
/* ── 인쇄 — A4 미리보기 내용만 종이에 ───────────────────────────── */
@media print {
  .no-print { display: none !important; }
  /* 미리보기 패널만 남기고 전체 폭으로 */
  .print-root { display: block !important; height: auto !important; overflow: visible !important; }
  .print-sheet { width: 100% !important; max-width: none !important; box-shadow: none !important; }
  .print-sheet .page-guide { display: none !important; }
  .preview table, .preview img, .preview figure { break-inside: avoid; }
}
```

적용:
- TopBar·MenuBar·DocumentTabs·RibbonToolbar·StatusBar·에디터 section·RemoteControl section·ChatPanel/ChatDock 래퍼에 `no-print` 클래스 추가 (Workspace.tsx의 각 요소와 Editor 내부 ChatDock).
- 미리보기 section과 그 조상 grid에 `print-root`, A4Sheet 종이 div에 `print-sheet`, 가이드 오버레이 div에 `page-guide` 클래스 추가 (A4Sheet.tsx).
- 미리보기 스크롤 컨테이너(`h-full overflow-auto`)에도 `print-root`.

- [ ] **Step 5: 검증** — tsc·jest + 수동: Ctrl+F 패널 한국어 표시·하이라이트, Ctrl+H, 브라우저 인쇄 미리보기(Ctrl+P)에서 문서 내용만 나오는지.

- [ ] **Step 6: 커밋** — `feat(editor): 찾기/바꾸기(한국어 패널) + 인쇄 스타일`

---

### Task 5: 목차 사이드바

**Files:**
- Create: `apps/frontend/src/lib/outline.ts`
- Create: `apps/frontend/src/components/shell/OutlinePanel.tsx`
- Modify: `apps/frontend/src/lib/editorCommands.ts` (scrollToLine)
- Modify: `apps/frontend/src/components/shell/RibbonToolbar.tsx` (토글)
- Modify: `apps/frontend/src/store/workspace.ts` (outlineOpen)
- Modify: `apps/frontend/src/components/Workspace.tsx` (패널 배치)
- Test: `apps/frontend/src/__tests__/lib/outline.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
import { parseOutline } from "@/lib/outline";

describe("parseOutline", () => {
  it("H1~H3 헤딩을 줄 번호와 함께 추출", () => {
    const src = "# 제목\n본문\n## 소제목\n### 세부\n#### 4단계는 제외";
    expect(parseOutline(src)).toEqual([
      { level: 1, text: "제목", line: 1 },
      { level: 2, text: "소제목", line: 3 },
      { level: 3, text: "세부", line: 4 },
    ]);
  });

  it("코드펜스 내부 #은 무시", () => {
    const src = "```\n# 주석\n```\n# 진짜 제목";
    expect(parseOutline(src)).toEqual([{ level: 1, text: "진짜 제목", line: 4 }]);
  });

  it("빈 문서 → []", () => {
    expect(parseOutline("")).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인** → **Step 3: 구현**

```ts
/** 마크다운 헤딩(H1~H3) 목차 파서 — 코드펜스 내부는 무시. */
export interface OutlineItem {
  level: 1 | 2 | 3;
  text: string;
  line: number; // 1-based
}

export function parseOutline(source: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  source.split("\n").forEach((raw, i) => {
    if (/^(```|~~~)/.test(raw.trim())) { inFence = !inFence; return; }
    if (inFence) return;
    const m = /^(#{1,3})\s+(.+)$/.exec(raw);
    if (m) items.push({ level: m[1].length as 1 | 2 | 3, text: m[2].trim(), line: i + 1 });
  });
  return items;
}
```

- [ ] **Step 4: scrollToLine (editorCommands.ts)**

```ts
/** 1-based 줄 번호로 스크롤 + 커서 이동. */
export function scrollToLine(line: number): void {
  if (!view) return;
  const docLine = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
  view.dispatch({
    selection: { anchor: docLine.from },
    effects: EditorView.scrollIntoView(docLine.from, { y: "start" }),
  });
  view.focus();
}
```

import 추가: `import { EditorView } from "@codemirror/view";` (type-only import를 값 import로 변경 — 기존 `import type` 라인 수정).

테스트 추가 (editorCommands.test.ts): scrollToLine 후 `v.state.selection.main.anchor`가 해당 줄 시작 오프셋인지 (jsdom에서 scrollIntoView effect는 무해).

- [ ] **Step 5: 스토어 + OutlinePanel + 배치**

스토어: `outlineOpen: boolean` + `toggleOutline: () => void` (기본 false).

```tsx
"use client";

import { List } from "lucide-react";
import { scrollToLine } from "@/lib/editorCommands";
import { parseOutline } from "@/lib/outline";
import { useWorkspace } from "@/store/workspace";

export function OutlinePanel() {
  const source = useWorkspace((s) => s.source);
  const items = parseOutline(source);

  return (
    <div className="no-print flex h-full w-44 shrink-0 flex-col overflow-auto border-r border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-neutral-500">
        <List size={11} /> 목차
      </div>
      {items.length === 0 && <p className="px-1 text-[10px] text-neutral-400">제목(#)을 입력하면 목차가 생깁니다</p>}
      {items.map((it, i) => (
        <button
          key={`${it.line}-${i}`}
          onClick={() => scrollToLine(it.line)}
          className="truncate rounded px-1 py-0.5 text-left text-[11px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          style={{ paddingLeft: `${(it.level - 1) * 10 + 4}px` }}
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}
```

Workspace.tsx: 에디터 section 내부 좌측에 조건 렌더 — `<section className="col-span-4 flex …">` 안을 `<div className="flex h-full">{outlineOpen && <OutlinePanel />}<div className="flex min-w-0 flex-1 flex-col overflow-hidden"><Editor /></div></div>`로 감싼다.

RibbonToolbar: 맨 앞에 토글 버튼 `<RibbonButton title="목차" onClick={toggleOutline}><List size={15} /></RibbonButton>` + Divider.

- [ ] **Step 6: 검증·커밋** — tsc·jest (38개+) → `feat(outline): 목차 사이드바 — 헤딩 클릭 이동`

---

### Task 6: 명령 레지스트리 + 팔레트 (Ctrl+K)

**Files:**
- Create: `apps/frontend/src/lib/commands.ts`
- Create: `apps/frontend/src/components/shell/CommandPalette.tsx`
- Modify: `apps/frontend/src/store/workspace.ts` (paletteOpen)
- Modify: `apps/frontend/src/components/Workspace.tsx` (마운트 + 전역 키)
- Modify: `apps/frontend/src/components/editor/MarkdownEditor.tsx` (Ctrl+K 키맵)
- Test: `apps/frontend/src/__tests__/lib/commands.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
import { getStaticCommands, filterCommands } from "@/lib/commands";

describe("commands", () => {
  it("정적 명령에 서식·삽입·파일·내보내기 명령이 있다", () => {
    const ids = getStaticCommands().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      "format.bold", "insert.table", "file.save", "export.md", "view.slides",
    ]));
  });

  it("filterCommands — 라벨·키워드 부분 일치 (대소문자 무시)", () => {
    const cmds = [
      { id: "a", label: "굵게", keywords: "bold strong", run: () => {} },
      { id: "b", label: "표 삽입", keywords: "table", run: () => {} },
    ];
    expect(filterCommands(cmds, "bold").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(cmds, "표").map((c) => c.id)).toEqual(["b"]);
    expect(filterCommands(cmds, "").length).toBe(2);
  });
});
```

- [ ] **Step 2: 실패 확인** → **Step 3: commands.ts 구현**

```ts
/** 명령 레지스트리 — 팔레트(Ctrl+K)·메뉴·리본이 공유하는 실행 단위. */
import { insertBlock, setHeadingLevel, toggleListMarker, wrapSelection } from "@/lib/editorCommands";
import { dispatchAutoConvert } from "@/lib/events";
import { downloadMarkdown } from "@/lib/download";
import { saveCurrentDocument, saveAsNewDocument } from "@/lib/docActions";
import { useWorkspace } from "@/store/workspace";

export interface Command {
  id: string;
  label: string;
  keywords: string;
  run: () => void;
}

export const TABLE_3X3_MD = "| 항목 | 내용 | 비고 |\n|------|------|------|\n|      |      |      |\n|      |      |      |";

export function getStaticCommands(): Command[] {
  const ws = () => useWorkspace.getState();
  return [
    { id: "format.h1", label: "제목 1", keywords: "heading h1", run: () => setHeadingLevel(1) },
    { id: "format.h2", label: "제목 2", keywords: "heading h2", run: () => setHeadingLevel(2) },
    { id: "format.h3", label: "제목 3", keywords: "heading h3", run: () => setHeadingLevel(3) },
    { id: "format.body", label: "본문으로", keywords: "paragraph", run: () => setHeadingLevel(0) },
    { id: "format.bold", label: "굵게", keywords: "bold strong", run: () => wrapSelection("**") },
    { id: "format.italic", label: "기울임", keywords: "italic", run: () => wrapSelection("*") },
    { id: "format.underline", label: "밑줄", keywords: "underline", run: () => wrapSelection("<u>", "</u>") },
    { id: "format.strike", label: "취소선", keywords: "strikethrough", run: () => wrapSelection("~~") },
    { id: "format.bullet", label: "글머리 목록", keywords: "bullet list", run: () => toggleListMarker("- ") },
    { id: "format.number", label: "번호 목록", keywords: "ordered list", run: () => toggleListMarker("1. ") },
    { id: "insert.table", label: "표 삽입 (3×3)", keywords: "table", run: () => insertBlock(TABLE_3X3_MD) },
    { id: "insert.hr", label: "구분선 삽입", keywords: "horizontal rule hr", run: () => insertBlock("---") },
    { id: "insert.quote", label: "인용 삽입", keywords: "quote blockquote", run: () => insertBlock("> 인용문") },
    { id: "file.save", label: "저장", keywords: "save ctrl+s", run: () => void saveCurrentDocument() },
    { id: "file.saveAs", label: "다른 이름으로 저장", keywords: "save as", run: () => void saveAsNewDocument() },
    { id: "export.md", label: "마크다운으로 내보내기 (.md)", keywords: "export markdown download", run: () => downloadMarkdown(ws().source, ws().title) },
    { id: "convert.run", label: "AI 변환·검토 실행", keywords: "convert ai review ctrl+enter", run: () => dispatchAutoConvert() },
    { id: "view.slides", label: "슬라이드 탭으로", keywords: "slides ppt presentation", run: () => ws().setActiveTab("slides") },
    { id: "view.doc", label: "문서 탭으로", keywords: "document editor", run: () => ws().setActiveTab("doc") },
    { id: "view.outline", label: "목차 토글", keywords: "outline toc", run: () => ws().toggleOutline() },
    { id: "view.print", label: "인쇄", keywords: "print ctrl+p", run: () => window.print() },
  ];
}

export function filterCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return cmds;
  return cmds.filter(
    (c) => c.label.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q),
  );
}
```

(TABLE_3X3_MD를 여기로 승격 — MenuBar·RibbonToolbar의 중복 리터럴을 이 상수 import로 교체한다. v3 품질 리뷰에서 지적됐던 항목.)

- [ ] **Step 4: CommandPalette.tsx**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { listMacros, executeMacro } from "@/lib/api";
import { filterCommands, getStaticCommands } from "@/lib/commands";
import type { Command } from "@/lib/commands";
import { useWorkspace } from "@/store/workspace";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [macroCmds, setMacroCmds] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useWorkspace((s) => s.preview);

  // 매크로 101종 lazy 병합 — 변환 결과가 있어야 실행 가능
  useEffect(() => {
    listMacros()
      .then((macros: { id: string; name: string; description?: string }[]) =>
        setMacroCmds(
          macros.map((m) => ({
            id: `macro.${m.id}`,
            label: `${m.id} — ${m.name}`,
            keywords: `macro 매크로 ${m.description ?? ""}`,
            run: () => {
              const s = useWorkspace.getState();
              if (!s.preview) { alert("먼저 변환(Ctrl+Enter)을 실행하세요"); return; }
              void executeMacro({ document_id: s.preview.document_id, macro_id: m.id }).then((r) => s.setPreview(r.preview));
            },
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const all = useMemo(() => [...getStaticCommands(), ...macroCmds], [macroCmds]);
  const results = useMemo(() => filterCommands(all, query).slice(0, 12), [all, query]);

  useEffect(() => setSelected(0), [query]);

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <Search size={14} className="text-neutral-400" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelected((v) => Math.min(v + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelected((v) => Math.max(v - 1, 0)); }
              if (e.key === "Enter") runAt(selected);
              if (e.key === "Escape") onClose();
            }}
            placeholder="명령 검색… (서식·삽입·매크로·내보내기)"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {results.length === 0 && <p className="px-4 py-3 text-xs text-neutral-400">일치하는 명령이 없습니다</p>}
          {results.map((c, i) => (
            <button
              key={c.id}
              onClick={() => runAt(i)}
              onMouseEnter={() => setSelected(i)}
              className={`block w-full px-4 py-1.5 text-left text-xs ${
                i === selected ? "bg-brand/10 text-brand" : "text-neutral-700 dark:text-neutral-300"
              } ${c.id.startsWith("macro.") && !preview ? "opacity-50" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="border-t border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400 dark:border-neutral-800">
          ↑↓ 이동 · Enter 실행 · Esc 닫기
        </div>
      </div>
    </div>
  );
}
```

(executeMacro의 정확한 시그니처는 api.ts를 읽고 맞출 것 — params 필드가 필수라면 `{ params: {} }` 포함.)

- [ ] **Step 5: 열기 경로 2곳**

스토어: `paletteOpen: boolean` + `setPaletteOpen`. Workspace.tsx: `{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}` + 전역 keydown (에디터 밖에서도):

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useWorkspace.getState().setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
```

MarkdownEditor formatKeymap에도 `{ key: "Mod-k", run: () => { useWorkspace.getState().setPaletteOpen(true); return true; }, preventDefault: true }` (에디터 포커스 중 CodeMirror가 이벤트를 먹는 경우 대비 — 전역 리스너와 중복 실행돼도 setPaletteOpen(true) 멱등이라 안전).

- [ ] **Step 6: TABLE_3X3_MD 공유 리팩터** — MenuBar.tsx·RibbonToolbar.tsx의 표 리터럴을 `import { TABLE_3X3_MD } from "@/lib/commands"`로 교체.

- [ ] **Step 7: 검증·커밋** — tsc·jest (40개+) → `feat(palette): Ctrl+K 명령 팔레트 — 서식·매크로 101종·내보내기 통합 검색`

---

### Task 7: DOCX 가져오기

**Files:**
- Modify: `apps/frontend/package.json` (`npm i mammoth turndown && npm i -D @types/turndown`)
- Create: `apps/frontend/src/lib/docxImport.ts`
- Modify: `apps/frontend/src/components/editor/HwpDropZone.tsx` (.docx 분기)
- Test: `apps/frontend/src/__tests__/lib/docxImport.test.ts`

- [ ] **Step 1: 실패 테스트** (mammoth 모킹 — jsdom에서 실제 docx 불필요)

```ts
import { htmlToMarkdown } from "@/lib/docxImport";

describe("htmlToMarkdown", () => {
  it("헤딩·굵게·리스트 변환", () => {
    const md = htmlToMarkdown("<h1>제목</h1><p><strong>굵게</strong></p><ul><li>항목</li></ul>");
    expect(md).toContain("# 제목");
    expect(md).toContain("**굵게**");
    expect(md).toContain("- ").or; // turndown 기본 bullet은 '-' 설정으로 고정
  });

  it("표 변환 (GFM 파이프 표)", () => {
    const md = htmlToMarkdown("<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>");
    expect(md).toContain("| a | b |");
    expect(md).toContain("| 1 | 2 |");
  });
});
```

주의: 위 첫 테스트의 `.or`는 오타 방지용 표시가 아니라 **잘못된 코드** — 실제로는 `expect(md).toContain("- 항목")`으로 작성한다. turndown 옵션 `bulletListMarker: "-"`, `headingStyle: "atx"` 필수. 표는 turndown 기본이 미지원이므로 `turndown-plugin-gfm`도 설치(`npm i turndown-plugin-gfm`)하고 tables 플러그인 적용. @types 없으면 `declare module "turndown-plugin-gfm";`를 `src/types/` 아래 d.ts로.

- [ ] **Step 2: 실패 확인** → **Step 3: docxImport.ts 구현**

```ts
/** DOCX → 마크다운 가져오기 — mammoth(docx→HTML) + turndown(HTML→MD). 클라이언트 전용. */
import TurndownService from "turndown";
// @ts-expect-error — 타입 정의 없는 플러그인
import { tables } from "turndown-plugin-gfm";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
turndown.use(tables);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

/** .docx File → 마크다운. 실패 시 Error throw (호출부가 UI 안내). */
export async function docxFileToMarkdown(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const md = htmlToMarkdown(html);
  if (!md.trim()) throw new Error("빈 문서이거나 변환할 내용이 없습니다");
  return md;
}
```

(mammoth의 브라우저 진입점 경로는 설치 후 package.json exports를 확인해 조정 — `mammoth/mammoth.browser` 또는 `mammoth`.)

- [ ] **Step 4: HwpDropZone 확장** — 파일을 먼저 읽고: accept에 `.docx` 추가, 파일 처리 분기에서 확장자가 `.docx`면 `docxFileToMarkdown(file)` 결과를 기존 HWP 성공 경로와 동일하게 `setSource`(또는 기존 병합 로직)로 전달. 오류는 기존 HWP 오류 UI 재사용. 버튼/안내 문구 "HWP 가져오기" → "HWP·DOCX 가져오기".

- [ ] **Step 5: 검증·커밋** — tsc·jest → 수동으로 실제 .docx 하나 드롭해 변환 확인 → `feat(import): DOCX 가져오기 — 기존 HWP 드롭존 통합`

---

### Task 8: E2E 확장 + 최종 검증

**Files:**
- Modify: `apps/frontend/e2e/word-processor.spec.ts` (또는 신규 `e2e/editing-experience.spec.ts`)

- [ ] **Step 1: 신규 E2E 시나리오** (`e2e/editing-experience.spec.ts`, 기존 spec의 계정 등록 헬퍼 재사용):

```ts
// 시나리오: 자동저장·복구 → Ctrl+S 서버 저장 → 열기 → 찾기 → 팔레트
// 1. 로그인 상태로 /app 진입, 에디터에 "# 복구 테스트\n\n내용" 입력
// 2. 1.5초 대기(디바운스) 후 page.reload() → 에디터에 내용 복구 확인
// 3. Ctrl+S → 제목 프롬프트(page.on("dialog") accept "E2E문서") → 상태바 "저장됨" 표시
// 4. 파일>열기 모달 → "E2E문서" 목록 표시 확인 → 닫기
// 5. Ctrl+F → 검색 패널 표시("찾기" 라벨) 확인 → Esc
// 6. Ctrl+K → 팔레트 → "표" 입력 → Enter → 에디터에 "| 항목 |" 삽입 확인
```

각 단계를 실제 Playwright 코드로 작성 (기존 spec 셀렉터 관례 준수).

- [ ] **Step 2: 백엔드 mock + fresh DB로 서버 기동 후 E2E 전체(기존 + 신규) 실행** — 기존 spec 회귀 포함 전부 PASS.

- [ ] **Step 3: 전체 게이트** — 프론트 tsc/jest/build, 백엔드 pytest 전체, ruff (touched files).

- [ ] **Step 4: 커밋** — `test(e2e): 편집 경험 시나리오 — 복구·저장·열기·찾기·팔레트`

---

## Self-Review 결과

- **스펙 커버리지**: §2.1→T1, §2.2→T2, §2.3·2.4→T3, §2.5·2.6→T4, §2.7→T5, §2.8→T6, §2.9→T7, §6 E2E→T8. 누락 없음.
- **주의 지점**: Document 모델이 이미 존재(마이그레이션 불필요)함을 확인했고 T2는 라우터만 신설. docxImport의 mammoth 진입점·turndown-plugin-gfm 타입은 설치 후 확인 단계 명시. Task 1의 zustand subscribe 2-인자 시그니처는 미들웨어 없는 기본 동작.
- **타입 일관성**: `saveState.kind` 유니언(T1↔T3), `Command` 인터페이스(T6 내), `DocumentOut/DocumentListItem`(T2 pydantic ↔ T3 TS 미러) 확인. `saveCurrentDocument`는 T3 docActions에서 정의되고 T6 commands가 import — 순서상 T3이 선행.
