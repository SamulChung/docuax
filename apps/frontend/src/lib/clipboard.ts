/**
 * 변환결과 클립보드 복사 헬퍼.
 *
 * 핵심 — Word/한컴/구글독스에 붙여넣을 때 서식이 유지되도록
 * `text/html` + `text/plain` 두 형식을 동시에 클립보드에 쓴다.
 * - HTML 인식 가능한 앱(Word·한컴 한글·Google Docs·Notion 등): 표·헤딩·글머리 유지
 * - HTML 미인식 앱(메모장·터미널 등): 자동으로 plain text 사용
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface CopyOptions {
  /** 선택된 블록 ID 목록. 비어있으면 전체 문서 복사. */
  blockIds?: string[];
}

/**
 * 변환결과를 클립보드에 HTML+plain 형식으로 복사.
 * Word/한컴/구글독스 등에 Ctrl+V 시 서식 유지.
 *
 * @returns 복사한 텍스트 길이 (검증·UX 표시용)
 * @throws Error  HTTP 오류 또는 클립보드 권한 거부
 */
export async function copyPreviewToClipboard(
  documentId: string,
  options: CopyOptions = {},
): Promise<number> {
  const blockIds = (options.blockIds || []).join(",");
  const query = blockIds ? `?block_ids=${encodeURIComponent(blockIds)}` : "";

  // 두 형식을 병렬 fetch
  const [htmlRes, textRes] = await Promise.all([
    fetch(`${API_BASE}/api/v1/render/${documentId}/html${query}`, {
      credentials: "include",
    }),
    fetch(`${API_BASE}/api/v1/render/${documentId}/text${query}`, {
      credentials: "include",
    }),
  ]);

  if (!htmlRes.ok) throw new Error(`HTML 가져오기 실패 (HTTP ${htmlRes.status})`);
  if (!textRes.ok) throw new Error(`텍스트 가져오기 실패 (HTTP ${textRes.status})`);

  const htmlText = await htmlRes.text();
  const plainText = await textRes.text();

  // 1) 최신 Clipboard API — text/html + text/plain 동시
  if (typeof window !== "undefined" && navigator.clipboard && "write" in navigator.clipboard) {
    try {
      const htmlBlob = new Blob([htmlText], { type: "text/html" });
      const textBlob = new Blob([plainText], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      return plainText.length;
    } catch (e) {
      // 권한 거부 등 → fallback
      console.warn("Clipboard.write 실패, fallback 시도:", e);
    }
  }

  // 2) Fallback — writeText (plain text 만)
  if (typeof window !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText);
    return plainText.length;
  }

  // 3) Legacy fallback — document.execCommand
  if (typeof window !== "undefined" && document.execCommand) {
    const ta = document.createElement("textarea");
    ta.value = plainText;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return plainText.length;
  }

  throw new Error("이 브라우저는 클립보드 API를 지원하지 않습니다.");
}
