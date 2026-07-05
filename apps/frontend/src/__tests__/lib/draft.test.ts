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

  it("docId 왕복 — 저장 시 함께 기록되고 복원된다", () => {
    saveDraft({ source: "# 제목", title: "문서1", docId: "doc-123" });
    const d = loadDraft();
    expect(d?.docId).toBe("doc-123");
  });

  it("docId 없이 저장된 기존 draft도 하위호환으로 통과한다", () => {
    saveDraft({ source: "# 제목", title: "문서1" });
    const d = loadDraft();
    expect(d).not.toBeNull();
    expect(d?.docId).toBeUndefined();
  });
});
