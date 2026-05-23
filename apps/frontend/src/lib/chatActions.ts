/**
 * AI 응답의 액션 태그 파서 + 실행기.
 *
 * 백엔드 chat.py 의 DEFAULT_SYSTEM_PROMPT 에서 안내된 태그:
 *   [블록교체:blk-XXXX] 본문...
 *   [블록추가:after:blk-XXXX] 본문...
 *   [에디터교체] 본문...
 *   [에디터추가] 본문...
 *   [변환실행]
 *
 * 태그는 항상 줄 시작 위치에서 매치. 본문은 그 줄의 나머지 + 다음 줄들 (다음 태그 전까지).
 */

export interface ChatAction {
  type: "replace_block" | "append_after_block" | "replace_editor" | "append_editor" | "convert";
  blockId?: string;
  payload?: string;
  /** 원본 매치 문자열 — 사용자 메시지에서 제거할 때 사용 */
  raw: string;
}

const TAG_PATTERNS: Array<{
  re: RegExp;
  build: (m: RegExpMatchArray) => ChatAction;
}> = [
  {
    re: /^\[블록교체:\s*(blk-[A-Za-z0-9]+)\][\t ]*([\s\S]*?)(?=(?:^|\n)\[(?:블록교체:|블록추가:|에디터교체\]|에디터추가\]|변환실행\])|(?![\s\S]))/m,
    build: (m) => ({ type: "replace_block", blockId: m[1], payload: m[2].trim(), raw: m[0] }),
  },
  {
    re: /^\[블록추가:\s*after:\s*(blk-[A-Za-z0-9]+)\][\t ]*([\s\S]*?)(?=(?:^|\n)\[(?:블록교체:|블록추가:|에디터교체\]|에디터추가\]|변환실행\])|(?![\s\S]))/m,
    build: (m) => ({ type: "append_after_block", blockId: m[1], payload: m[2].trim(), raw: m[0] }),
  },
  {
    re: /^\[에디터교체\][\t ]*([\s\S]*?)(?=(?:^|\n)\[(?:블록교체:|블록추가:|에디터교체\]|에디터추가\]|변환실행\])|(?![\s\S]))/m,
    build: (m) => ({ type: "replace_editor", payload: m[1].trim(), raw: m[0] }),
  },
  {
    re: /^\[에디터추가\][\t ]*([\s\S]*?)(?=(?:^|\n)\[(?:블록교체:|블록추가:|에디터교체\]|에디터추가\]|변환실행\])|(?![\s\S]))/m,
    build: (m) => ({ type: "append_editor", payload: m[1].trim(), raw: m[0] }),
  },
  {
    re: /^\[변환실행\]\s*$/m,
    build: (m) => ({ type: "convert", raw: m[0] }),
  },
];

/**
 * AI 응답에서 액션 태그를 모두 추출.
 * @returns 액션 배열 (없으면 빈 배열)
 */
export function parseChatActions(text: string): ChatAction[] {
  const actions: ChatAction[] = [];
  let working = text;
  // 각 태그 패턴을 한 번씩 반복 매치
  let safeguard = 0;
  while (safeguard++ < 20) {
    let matched = false;
    for (const { re, build } of TAG_PATTERNS) {
      const m = re.exec(working);
      if (m) {
        actions.push(build(m));
        // 매치된 영역 제거 — 다음 태그 검색
        working = working.slice(0, m.index) + working.slice(m.index + m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return actions;
}

/**
 * AI 응답에서 액션 태그를 제거하고 사람이 읽는 본문만 반환.
 */
export function stripChatActions(text: string): string {
  let stripped = text;
  for (const { re } of TAG_PATTERNS) {
    stripped = stripped.replace(new RegExp(re.source, "gm"), "");
  }
  return stripped.trim();
}

export function actionLabel(a: ChatAction): string {
  switch (a.type) {
    case "replace_block":      return `${a.blockId} 블록 교체`;
    case "append_after_block": return `${a.blockId} 뒤에 추가`;
    case "replace_editor":     return "에디터 전체 교체";
    case "append_editor":      return "에디터 끝에 추가";
    case "convert":            return "변환 실행";
  }
}

export function actionShortLabel(a: ChatAction): string {
  switch (a.type) {
    case "replace_block":      return "교체";
    case "append_after_block": return "추가";
    case "replace_editor":     return "전체 교체";
    case "append_editor":      return "추가";
    case "convert":            return "변환";
  }
}


// ─── AI 응답 메타 문구 정리 ────────────────────────────────────────────
//
// AI 가 시스템 프롬프트를 따라도 가끔 회화체 도입·마무리를 끼워넣음.
// 자동반영 시 본문에 회화체가 그대로 들어가는 걸 막는 후처리.
//
//   "다음은 ~ 보고서입니다."        ← 첫 줄
//   "이 템플릿은 ~"                  ← 첫 줄
//   "도움이 되었길 바랍니다."        ← 마지막 줄
//   "추가 수정이 필요하시면 ~"       ← 마지막 줄
//   "---" 다음에 안내 문구           ← 마지막 블록

const META_INTRO_PATTERNS = [
  /^다음은\s+.+(입니다|드립니다)\.?\s*$/,
  /^아래는\s+.+(입니다|드립니다)\.?\s*$/,
  /^여기\s*(에|는)?\s*.+(입니다|드립니다)\.?\s*$/,
  /^(이|해당)\s+(보고서|문서|템플릿|양식|초안)(은|는|이|가)\s+/,
  /^.*요청.*에\s*따라\s+.+드립니다\.?\s*$/,
  /^.*작성(해|하)\s*드(립|렸)?\s*(니다|어요)\.?\s*$/,
];

const META_OUTRO_PATTERNS = [
  /^.*추가\s*수정.*말씀.*주세요\.?\s*$/,
  /^.*필요하시면.*(알려|말씀).*주세요\.?\s*$/,
  /^.*도움이\s*되.*기.*바랍니다\.?\s*$/,
  /^.*도움(이|을)\s+드릴\s+수\s+있.*\.?\s*$/,
  /^감사합니다\.?\s*$/,
  /^.*기쁩니다\.?\s*$/,
];

/**
 * AI 답변에서 도입·마무리 회화체 메타 문구 제거 + 코드 펜스 래퍼 풀기.
 * 자동반영 흐름에서 본문이 에디터에 들어가기 전 정리.
 *
 * 처리 단계:
 *   0) 전체가 ```markdown ... ``` 같은 코드 펜스로 감싸져 있으면 안쪽 본문만 추출
 *   1) 첫 줄·연속 빈 줄까지 검사. 도입 메타면 제거.
 *   2) 마지막 줄·구분선('---') 다음 메타 블록도 제거.
 *   3) 의도된 본문(헤딩·리스트·표·내부 코드블록)은 절대 건드리지 않음.
 */
export function stripMetaPhrases(text: string): string {
  // 0) 전체 마크다운이 ```markdown / ```md / ``` 펜스로 감싸진 경우 풀기
  //    AI 가 "이건 마크다운이에요" 알려주려고 친절히 감싸는 흔한 패턴.
  //    조건: 첫 비어있지 않은 줄이 ``` 시작 + 마지막 비어있지 않은 줄이 ``` 단독.
  const stripped = text.trim();
  const fenceMatch = /^```(?:markdown|md|)?\s*\n([\s\S]*?)\n```\s*$/.exec(stripped);
  if (fenceMatch) {
    text = fenceMatch[1];
  }

  let lines = text.split("\n");

  // 1) 앞쪽 — 메타 도입 줄 + 그 다음 빈 줄들 제거
  while (lines.length > 0) {
    const first = lines[0].trim();
    if (first === "") {
      lines.shift();
      continue;
    }
    if (META_INTRO_PATTERNS.some((re) => re.test(first))) {
      lines.shift();
      continue;
    }
    break;
  }

  // 2) 뒤쪽 — 마지막 메타 줄 + 직전 '---' 구분선 제거
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === "") {
      lines.pop();
      continue;
    }
    if (META_OUTRO_PATTERNS.some((re) => re.test(last))) {
      lines.pop();
      // 직전 '---' 구분선도 같이 (메타 안내용으로 쓰인 것)
      while (lines.length > 0) {
        const tail = lines[lines.length - 1].trim();
        if (tail === "" || tail === "---" || tail === "***") {
          lines.pop();
          continue;
        }
        break;
      }
      continue;
    }
    break;
  }

  return lines.join("\n").trim();
}
