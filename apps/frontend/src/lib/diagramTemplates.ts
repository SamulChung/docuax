/**
 * Mermaid 다이어그램 템플릿 카탈로그 — 16종 한국어 예시.
 *
 * 각 템플릿:
 *   - id        : 내부 식별자
 *   - label     : 사람용 라벨
 *   - description : 한 줄 설명
 *   - category  : 그룹 (프로세스·구조·동작·데이터·프로젝트·기획)
 *   - source    : Mermaid 본문 (코드 펜스 없는 raw 소스)
 *   - opts      : 기본 width / align
 *   - cheatsheet: 해당 종류별 자주 쓰는 문법 (다이얼로그에서 노출)
 *
 * 코드 펜스(``` ... ```)는 다이얼로그에서 width/align 옵션과 함께 별도 합성.
 */

export type DiagramCategory =
  | "프로세스"
  | "구조"
  | "동작"
  | "데이터"
  | "프로젝트"
  | "기획";

export interface DiagramTemplate {
  id: string;
  label: string;
  description: string;
  category: DiagramCategory;
  source: string;
  defaultWidth: string;
  defaultAlign: "left" | "center" | "right";
  cheatsheet: string;
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  // ─── 프로세스 ─────────────────────────────────────────────
  {
    id: "flowchart",
    label: "흐름도 (가로)",
    description: "프로세스·의사결정 흐름 — 좌→우",
    category: "프로세스",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `---
title: 업무 처리 흐름
---
flowchart LR
    A[시작] --> B{판단}
    B -->|예| C[처리]
    B -->|아니오| D[종료]
    C --> D`,
    cheatsheet:
      "flowchart LR (가로) / TD (세로)\n" +
      "[사각형]  ([둥근])  ((원))  {{육각}}  {다이아몬드}\n" +
      "A --> B  화살표 |라벨|  A -.-> B  점선  A ==> B 굵게",
  },
  {
    id: "flowchart_td",
    label: "흐름도 (세로)",
    description: "위→아래 흐름 (Top-Down)",
    category: "프로세스",
    defaultWidth: "70%",
    defaultAlign: "center",
    source: `---
title: 요청 처리 절차
---
flowchart TD
    A[요청 접수] --> B[검토]
    B --> C{승인?}
    C -->|승인| D[처리]
    C -->|반려| E[반려 통보]
    D --> F[완료]`,
    cheatsheet:
      "flowchart TD (세로) / LR (가로)\n" +
      "subgraph 박스로 묶기:\n" +
      "  subgraph 검토단계\n    B[검토] --> C{승인?}\n  end",
  },
  {
    id: "gitgraph",
    label: "Git 그래프",
    description: "Git 브랜치 흐름",
    category: "프로세스",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `gitGraph
    commit id: "init"
    branch develop
    checkout develop
    commit id: "feat: 차트"
    commit id: "feat: 다이어그램"
    checkout main
    merge develop
    commit id: "v1.0 release"`,
    cheatsheet:
      "branch 이름 / checkout 이름 / commit id: \"메시지\"\n" +
      "merge 이름 / cherry-pick id: \"커밋id\"",
  },

  // ─── 동작 ──────────────────────────────────────────────────
  {
    id: "sequence",
    label: "시퀀스",
    description: "객체·인물 간 시간 순 메시지 교환",
    category: "동작",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `---
title: 로그인 시퀀스
---
sequenceDiagram
    participant 사용자
    participant 시스템
    participant DB
    사용자->>시스템: 로그인 요청
    시스템->>DB: 사용자 조회
    DB-->>시스템: 사용자 정보
    시스템-->>사용자: 인증 토큰`,
    cheatsheet:
      "participant 이름\n" +
      "A->>B: 메시지  (실선)\n" +
      "A-->>B: 응답   (점선)\n" +
      "Note over A,B: 설명\n" +
      "loop / alt / opt 블록",
  },
  {
    id: "state",
    label: "상태 (State)",
    description: "상태 전이 — 문서·주문 상태 등",
    category: "동작",
    defaultWidth: "70%",
    defaultAlign: "center",
    source: `---
title: 문서 결재 상태 전이
---
stateDiagram-v2
    [*] --> 작성중
    작성중 --> 검토대기 : 제출
    검토대기 --> 승인 : 검토 통과
    검토대기 --> 작성중 : 반려
    승인 --> [*]`,
    cheatsheet:
      "[*] = 시작/종료\n" +
      "A --> B : 트리거\n" +
      "복합 상태: state 이름 { A --> B }",
  },

  // ─── 구조 ──────────────────────────────────────────────────
  {
    id: "class",
    label: "클래스 다이어그램",
    description: "객체지향 설계 — 클래스 관계",
    category: "구조",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `---
title: 사용자 도메인 모델
---
classDiagram
    class 사용자 {
        +String 이름
        +String 이메일
        +로그인()
    }
    class 관리자 {
        +권한관리()
    }
    사용자 <|-- 관리자 : 상속`,
    cheatsheet:
      "class 이름 { +공개 / -비공개 / #protected }\n" +
      "관계:\n" +
      "  <|-- 상속\n" +
      "  *-- 합성\n" +
      "  o-- 집합\n" +
      "  --> 연관",
  },
  {
    id: "c4",
    label: "C4 컨텍스트",
    description: "시스템 아키텍처 (C4 모델)",
    category: "구조",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `C4Context
    title DocuAX 시스템 컨텍스트
    Person(user, "사용자", "문서 작성자")
    System(docuax, "DocuAX", "AI 문서 변환 플랫폼")
    System_Ext(hwp, "한컴오피스", "한글 문서 편집")
    System_Ext(llm, "TenOS", "LLM 두뇌")
    Rel(user, docuax, "마크다운 입력")
    Rel(docuax, llm, "AI 변환")
    Rel(docuax, hwp, "HWPX 출력")`,
    cheatsheet:
      "Person(id, \"이름\", \"설명\")\n" +
      "System(id, \"이름\", \"설명\")\n" +
      "System_Ext(...)  외부 시스템\n" +
      "Rel(from, to, \"라벨\")",
  },
  {
    id: "requirement",
    label: "요구사항 다이어그램",
    description: "요구사항 추적 — SysML 기반",
    category: "구조",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `requirementDiagram
    requirement 사용자인증 {
        id: REQ-001
        text: 사용자는 이메일·비밀번호로 로그인할 수 있어야 한다.
        risk: high
        verifymethod: test
    }
    requirement 본인키등록 {
        id: REQ-002
        text: BYOK — 본인 API 키를 직접 등록할 수 있다.
        risk: medium
        verifymethod: demonstration
    }
    사용자인증 - contains -> 본인키등록`,
    cheatsheet:
      "requirement 이름 { id / text / risk / verifymethod }\n" +
      "risk: low | medium | high\n" +
      "관계: contains / copies / derives / satisfies / verifies / refines / traces",
  },

  // ─── 데이터 ────────────────────────────────────────────────
  {
    id: "er",
    label: "ER 다이어그램",
    description: "데이터베이스 — 엔티티 관계",
    category: "데이터",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `---
title: DocuAX 데이터 모델
---
erDiagram
    USER ||--o{ DOCUMENT : 작성
    DOCUMENT ||--|{ BLOCK : 포함
    USER {
        string id PK
        string email
        string name
    }
    DOCUMENT {
        string id PK
        string title
        string user_id FK
    }`,
    cheatsheet:
      "관계 표기 (왼쪽 카디널리티 - 오른쪽 카디널리티):\n" +
      "  ||--||  1:1\n  ||--o{  1:N (선택)\n  ||--|{  1:N (필수)\n  }o--o{  N:N\n" +
      "엔티티 안: 타입 컬럼명 [PK|FK]",
  },
  {
    id: "pie",
    label: "파이 (Pie)",
    description: "비율 — 간단한 비중 표시",
    category: "데이터",
    defaultWidth: "60%",
    defaultAlign: "center",
    source: `pie title 부서별 인원 비율
    "기획" : 25
    "개발" : 45
    "디자인" : 15
    "운영" : 15`,
    cheatsheet:
      "pie title 제목 줄\n" +
      '"라벨" : 숫자  (각 줄)\n' +
      "showData 옵션으로 값 표시",
  },

  // ─── 프로젝트 ──────────────────────────────────────────────
  {
    id: "gantt",
    label: "간트차트",
    description: "프로젝트 일정 — 작업 기간 시각화",
    category: "프로젝트",
    defaultWidth: "90%",
    defaultAlign: "center",
    source: `gantt
    title 프로젝트 일정
    dateFormat YYYY-MM-DD
    section 기획
    요구사항 분석     :a1, 2026-01-01, 14d
    설계             :a2, after a1, 10d
    section 개발
    백엔드           :b1, after a2, 30d
    프론트엔드       :b2, after a2, 30d
    section 검증
    QA              :c1, after b1, 14d
    배포            :c2, after c1, 5d`,
    cheatsheet:
      "dateFormat YYYY-MM-DD\n" +
      "section 섹션이름\n" +
      "작업명 :상태, id, 시작일/after id, 기간 / 끝일\n" +
      "상태: done, active, crit (없으면 일반)",
  },
  {
    id: "timeline",
    label: "타임라인",
    description: "연혁·로드맵 — 시간 순 이벤트",
    category: "프로젝트",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `timeline
    title DocuAX 로드맵
    2026.03 : 법인 설립
    2026.05 : 베타 출시 : 시각 요소 5종
    2026.07 : 정식 출시 : Pro/Team 플랜
    2026.10 : 엔터프라이즈 : SSO·온프레미스
    2027    : 글로벌 진출`,
    cheatsheet:
      "timeline\n  title 제목\n  시점 : 이벤트1 : 이벤트2 : ...\n" +
      "section 섹션이름 (선택)",
  },

  // ─── 기획 ──────────────────────────────────────────────────
  {
    id: "journey",
    label: "사용자 여정",
    description: "User Journey — 경험·만족도",
    category: "기획",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `journey
    title 사용자의 문서 작성 여정
    section 시작
      로그인: 5: 사용자
      대시보드 진입: 4: 사용자
    section 작성
      마크다운 입력: 5: 사용자
      AI 도움 받기: 5: 사용자, AI
    section 변환
      DOCX 다운로드: 5: 사용자
      한컴 한글 열기: 4: 사용자`,
    cheatsheet:
      "journey\n  title 제목\n  section 단계명\n    작업: 점수(1~5): 행위자, 행위자",
  },
  {
    id: "quadrant",
    label: "4분면 차트",
    description: "우선순위 매트릭스 — mermaid-cli 로컬 설치 필요",
    category: "기획",
    defaultWidth: "70%",
    defaultAlign: "center",
    source: `quadrantChart
    title 작업 우선순위 매트릭스
    x-axis 낮은 긴급도 --> 높은 긴급도
    y-axis 낮은 중요도 --> 높은 중요도
    quadrant-1 즉시 처리
    quadrant-2 계획 처리
    quadrant-3 위임
    quadrant-4 제거
    핵심 기능 개발: [0.85, 0.85]
    기술 부채 정리: [0.3, 0.8]
    회의록 정리: [0.7, 0.25]
    잡무: [0.2, 0.15]`,
    cheatsheet:
      "x-axis / y-axis 라벨\n" +
      "quadrant-1 ~ quadrant-4 각 분면 이름\n" +
      "포인트: \"이름: [x, y]\"  (0.0~1.0)",
  },
  {
    id: "mindmap",
    label: "마인드맵",
    description: "아이디어 발산 — 브레인스토밍",
    category: "기획",
    defaultWidth: "80%",
    defaultAlign: "center",
    source: `mindmap
  root((DocuAX))
    문서 작성
      마크다운
      AI 어시스턴트
      양식 학습
    출력 포맷
      HWPX
      DOCX
      PDF
    시각 요소
      차트
      다이어그램
      수식
      표지`,
    cheatsheet:
      "mindmap\n  root((중심))  ─ 둥근 사각\n" +
      "들여쓰기로 계층\n" +
      "노드 모양: [사각]  ((원))  ))cloud((  {{육각}}",
  },
];

/**
 * Mermaid 소스에서 `---\ntitle: X\n---` frontmatter 의 title 만 추출.
 * 없으면 빈 문자열.
 */
export function extractDiagramTitle(source: string): string {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(source);
  if (!m) return "";
  const tm = /^title:\s*(.+)$/m.exec(m[1]);
  return tm ? tm[1].trim() : "";
}

/**
 * Mermaid 소스에서 frontmatter 를 제거한 본문만 반환.
 */
export function stripDiagramFrontmatter(source: string): string {
  return source.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
}

/**
 * title + body 를 다시 frontmatter 형태로 합쳐 Mermaid 소스 생성.
 * title 이 비어 있으면 frontmatter 없이 body 만 반환.
 */
export function composeDiagramSource(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  if (!t) return b;
  return `---\ntitle: ${t}\n---\n${b}`;
}

/**
 * 최종 마크다운 코드 펜스 스니펫 합성 — width/align 포함.
 */
export function composeDiagramSnippet(opts: {
  source: string;
  width: string;
  align: "left" | "center" | "right";
}): string {
  return [
    `\`\`\`mermaid width=${opts.width} align=${opts.align}`,
    opts.source,
    "```",
  ].join("\n");
}
