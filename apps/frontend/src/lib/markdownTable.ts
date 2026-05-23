/**
 * 마크다운 표 감지·파싱 유틸리티.
 *
 * 마크다운 표 형식:
 *   | 헤더1 | 헤더2 | 헤더3 |
 *   | --- | --- | --- |        ← 구분자 (필수)
 *   | a   | 10  | 20  |
 *   | b   | 15  | 25  |
 *
 * - 헤더 행: `|` 로 시작, 컬럼명 포함
 * - 구분자 행: `---` 또는 `:---:` 등의 정렬 표시
 * - 본문 행: 데이터
 *
 * 커서 위치 기준으로 표 블록 전체를 찾아 반환 (없으면 null).
 * 셀 안의 인라인 마크다운(**bold**, *italic*, `code`)은 단순 제거.
 * 숫자 셀은 자동 인식하여 numeric=true 로 마킹.
 */

/** 표 안의 한 셀 — 원본 문자열 + 정제 텍스트 + 숫자 파싱 결과 */
export interface TableCell {
  /** 원본 셀 텍스트 (앞뒤 공백 제거된 raw) */
  raw: string;
  /** 인라인 마크다운 제거된 평문 */
  text: string;
  /** 숫자로 파싱 시도 — 실패하면 null */
  num: number | null;
}

/** 파싱된 표 — 헤더 + 본문 행 + 위치 정보 */
export interface ParsedTable {
  /** source 안에서 표의 시작 라인 인덱스 (0-base) */
  startLine: number;
  /** 표의 끝 라인 인덱스 (포함) */
  endLine: number;
  /** source 안에서 표의 시작 문자 오프셋 */
  startOffset: number;
  /** 표의 끝 문자 오프셋 (다음 줄 시작 직전) */
  endOffset: number;
  /** 헤더 컬럼명 */
  headers: string[];
  /** 본문 행 (각 행은 헤더 길이만큼의 셀) */
  rows: TableCell[][];
}

/** 셀 내부 인라인 마크다운 제거 + 공백 정리. */
function cleanCell(raw: string): TableCell {
  const trimmed = raw.trim();
  // 인라인 코드 → 본문만, **굵게** → 본문만, *기울임* → 본문만
  const text = trimmed
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .trim();

  // 숫자 추출 — 쉼표·통화기호·단위 허용 ("1,200원", "1.5%", "₩3,500", "$25.5")
  let numText = text.replace(/[,\s₩원$¥€]/g, "");
  // % 단위는 숫자에서 떼어 그대로 인식
  numText = numText.replace(/%$/, "");
  // 음수·소수
  const numMatch = /^-?\d+(?:\.\d+)?$/.exec(numText);
  const num = numMatch ? parseFloat(numMatch[0]) : null;

  return { raw: trimmed, text, num };
}

/** 한 줄을 표 행으로 파싱 — `|` 분리. 앞뒤 빈 컬럼은 제거. */
function parseRow(line: string): TableCell[] | null {
  if (!line.trim().startsWith("|")) return null;
  // \| 이스케이프는 단순화 — 일반 사용에서 거의 없음
  const cells = line.split("|");
  // 첫·마지막 셀은 앞뒤 `|` 때문에 빈 문자열 — 제거
  if (cells.length > 0 && cells[0].trim() === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === "") cells.pop();
  if (cells.length === 0) return null;
  return cells.map(cleanCell);
}

/** 구분자 행 인식 — `| --- | --- |` 패턴. 정렬 표시(:---:, ---:) 도 OK. */
function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return false;
  // 각 셀이 :---: 또는 ---: 또는 :--- 또는 --- 형태
  const inner = t.slice(1, -1);
  const cells = inner.split("|");
  return cells.length > 0 && cells.every((c) => /^\s*:?-{3,}:?\s*$/.test(c));
}

/**
 * source 의 cursor 위치에서 표 블록을 감지.
 *
 * 알고리즘:
 *   1. cursor 가 속한 줄을 찾는다
 *   2. 위로 스캔 — `|` 로 시작하는 연속 라인 모음
 *   3. 아래로 스캔 — 동일
 *   4. 그 블록 안에 구분자 행이 있으면 표로 인정
 *   5. 헤더 = 구분자 위 첫 줄, 본문 = 구분자 아래
 *
 * 반환 null = 표 아님.
 */
export function findTableAtCursor(source: string, cursor: number): ParsedTable | null {
  const lines = source.split(/\r?\n/);

  // cursor 가 속한 줄 인덱스 + 각 줄의 시작 오프셋
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1); // +1 for \n
  }
  let cursorLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (cursor < lineOffsets[i] + lines[i].length + 1) {
      cursorLine = i;
      break;
    }
    cursorLine = i;
  }

  // 위로 스캔 — `|` 로 시작하는 연속 라인
  let start = cursorLine;
  while (start > 0 && lines[start - 1].trim().startsWith("|")) {
    start--;
  }
  // 현재 줄이 `|` 가 아니면 위/아래로 직접 확인 (커서가 표 직후 빈 줄에 있을 수도)
  if (!lines[cursorLine].trim().startsWith("|")) {
    // 위 줄이 `|` 이면 그 위로 스캔
    if (cursorLine > 0 && lines[cursorLine - 1].trim().startsWith("|")) {
      start = cursorLine - 1;
      while (start > 0 && lines[start - 1].trim().startsWith("|")) start--;
    } else if (cursorLine + 1 < lines.length && lines[cursorLine + 1].trim().startsWith("|")) {
      start = cursorLine + 1;
    } else {
      return null;
    }
  }

  // 아래로 스캔
  let end = start;
  while (end + 1 < lines.length && lines[end + 1].trim().startsWith("|")) {
    end++;
  }

  // 블록 안에 구분자 행이 있어야 표
  let sepIndex = -1;
  for (let i = start; i <= end; i++) {
    if (isSeparatorRow(lines[i])) {
      sepIndex = i;
      break;
    }
  }
  if (sepIndex === -1) return null;
  // 헤더는 구분자 바로 위 한 줄
  if (sepIndex === start) return null;

  const headerRow = parseRow(lines[sepIndex - 1]);
  if (!headerRow) return null;
  const colCount = headerRow.length;

  // 본문 — 구분자 다음부터 end 까지
  const bodyRows: TableCell[][] = [];
  for (let i = sepIndex + 1; i <= end; i++) {
    const row = parseRow(lines[i]);
    if (!row) continue;
    // 컬럼 수 맞추기 — 부족하면 빈 셀, 넘치면 자르기
    while (row.length < colCount) row.push({ raw: "", text: "", num: null });
    if (row.length > colCount) row.length = colCount;
    bodyRows.push(row);
  }
  if (bodyRows.length === 0) return null;

  // 표 시작 — 헤더 (구분자 위)
  const startLine = sepIndex - 1;
  const endLine = end;
  const startOffset = lineOffsets[startLine];
  const endOffset =
    endLine + 1 < lines.length
      ? lineOffsets[endLine + 1]
      : startOffset + lines.slice(startLine, endLine + 1).join("\n").length;

  return {
    startLine,
    endLine,
    startOffset,
    endOffset,
    headers: headerRow.map((c) => c.text),
    rows: bodyRows,
  };
}

/** 한 컬럼이 숫자 컬럼인지 — 본문 행의 70% 이상이 숫자면 yes. */
export function isNumericColumn(table: ParsedTable, colIdx: number): boolean {
  if (table.rows.length === 0) return false;
  let numeric = 0;
  for (const row of table.rows) {
    if (row[colIdx]?.num !== null && row[colIdx]?.num !== undefined) numeric++;
  }
  return numeric / table.rows.length >= 0.7;
}

/** 숫자 컬럼 인덱스 목록 — 차트의 데이터셋 후보. */
export function numericColumnIndices(table: ParsedTable): number[] {
  return table.headers.map((_, i) => i).filter((i) => isNumericColumn(table, i));
}

/** 라벨 컬럼 인덱스 — 숫자 아닌 첫 컬럼 (없으면 0). */
export function labelColumnIndex(table: ParsedTable): number {
  for (let i = 0; i < table.headers.length; i++) {
    if (!isNumericColumn(table, i)) return i;
  }
  return 0;
}
