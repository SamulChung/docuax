// 내보내기 실행 로직 — ExportMenu에서 추출 (상단 출력 메뉴와 공유).
import { downloadUrl } from "@/lib/api";
import { downloadBlob, parseDocuaxWarnings } from "@/lib/download";

/** Content-Disposition 에서 파일명 추출 — filename*=UTF-8''… 우선, 없으면 filename="…". */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* 잘못된 인코딩 — 아래 filename= 로 폴백 */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/**
 * HWP 다운로드 — fetch + Blob 방식.
 * 백엔드가 강등 경고를 X-Docuax-Warnings 헤더로 싣는데 (render.py, 설계문서 §3.5)
 * <a href> 다운로드로는 헤더를 읽을 수 없어 fetch 로 받는다.
 *
 * @returns 강등 경고 배열 (없으면 []) — 호출자가 배너/alert 로 표시
 * @throws Error HTTP 오류 시 — 호출자가 실패 안내 표시
 */
export async function downloadHwpWithWarnings(
  documentId: string,
  title: string,
): Promise<string[]> {
  const res = await fetch(downloadUrl(documentId, "hwp"));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const warnings = parseDocuaxWarnings(res.headers.get("X-Docuax-Warnings"));
  const fallbackName =
    `${(title || "document").trim().replace(/[\\/:*?"<>|]/g, "_") || "document"}.hwp`;
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? fallbackName;
  downloadBlob(await res.blob(), filename);
  return warnings;
}
