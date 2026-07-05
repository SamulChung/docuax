import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "기능 가이드 — DocuAI × 농축협 DT",
  description: "역관목조분·요정분생설·G16 톤변환·채널 내보내기 등 7가지 신규 기능 확인 방법",
};

// ─── 데이터 ───────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    priority: "🔴",
    badge: "즉시",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    id: "yogmcp",
    title: "역관목조분 프롬프트 빌더",
    subtitle: "役·關·目·條·分 5축 자동 조합",
    difficulty: "낮음 (UI만)",
    impact: "매우 높음",
    where: "상단 네비 → AI 확대 → 입력창 위 📐 버튼",
    steps: [
      { icon: "1", text: "화면 우상단 <strong>AI 확대</strong> 버튼을 클릭합니다." },
      { icon: "2", text: "채팅 입력창 위의 <strong>역관목조분</strong> 버튼(접기 아이콘)을 클릭해 빌더를 펼칩니다." },
      { icon: "3", text: "役(역할) · 關(분야) · 目(목적) · 條(조건) · 分(분량) 5개 필드를 채웁니다." },
      { icon: "4", text: "<strong>프롬프트 생성 → 입력창에 채우기</strong> 버튼을 누르면 구조화된 프롬프트가 자동으로 입력창에 채워집니다." },
    ],
    tip: "필드가 비어있는 축은 결과 프롬프트에서 자동으로 제외됩니다.",
    color: "border-red-200 dark:border-red-900",
    iconBg: "bg-red-50 dark:bg-red-950/50",
  },
  {
    priority: "🔴",
    badge: "즉시",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    id: "nhprompt",
    title: "농협 프롬프트 팩 (41종)",
    subtitle: "농협·공공기관 특화 실전 프롬프트",
    difficulty: "낮음 (데이터)",
    impact: "높음",
    where: "좌측 에디터 상단 → 프롬프트 버튼",
    steps: [
      { icon: "1", text: "에디터 상단 <strong>☆ 프롬프트</strong> 버튼을 클릭합니다." },
      { icon: "2", text: "프롬프트 라이브러리 모달에서 조직 드롭다운을 클릭합니다." },
      { icon: "3", text: "<strong>농협·공공기관</strong>을 선택하면 41개 카드가 표시됩니다." },
      { icon: "4", text: "원하는 프롬프트를 클릭하면 에디터에 바로 로드됩니다." },
    ],
    tip: "카테고리: 사업전략·요약·정리·분석·생성·설명·NotebookLM·공문·마케팅·이미지·영상 등 13종",
    color: "border-red-200 dark:border-red-900",
    iconBg: "bg-red-50 dark:bg-red-950/50",
  },
  {
    priority: "🟡",
    badge: "단기",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    id: "yojbss",
    title: "요정분생설 출력 모드 칩",
    subtitle: "要·精·分·生·說 5종 출력 모드 자동 지정",
    difficulty: "중간",
    impact: "높음",
    where: "상단 AI 확대 → 채팅 입력창 바로 위 칩 행",
    steps: [
      { icon: "1", text: "<strong>AI 확대</strong>를 클릭해 채팅 패널을 엽니다." },
      { icon: "2", text: "입력창 위에 색깔 칩 5개가 표시됩니다: <strong>要 요약 · 精 정리 · 分 분석 · 生 생성 · 說 설명</strong>" },
      { icon: "3", text: "원하는 칩을 클릭 → 활성화(테두리 강조) → 메시지 전송 시 <code>[출력 모드: 要(핵심만 압축)]</code> 가 자동 앞붙임됩니다." },
      { icon: "4", text: "같은 칩을 다시 클릭하면 모드가 해제됩니다." },
    ],
    tip: "모드를 바꿔도 기존 대화 내용은 유지됩니다. 질문 유형에 따라 다른 모드를 선택해 보세요.",
    color: "border-amber-200 dark:border-amber-900",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
  },
  {
    priority: "🟡",
    badge: "단기",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    id: "templates",
    title: "뉴스레터·영상기획서·보도자료 템플릿",
    subtitle: "콘텐츠 카테고리 3종 신규 추가",
    difficulty: "중간",
    impact: "높음",
    where: "에디터 상단 → 템플릿 → 기본 템플릿 → 콘텐츠",
    steps: [
      { icon: "1", text: "에디터 상단 <strong>□ 템플릿</strong> 버튼을 클릭합니다." },
      { icon: "2", text: "<strong>기본 템플릿</strong> 탭에서 카테고리 필터 <strong>콘텐츠</strong>를 선택합니다." },
      { icon: "3", text: "3개 템플릿이 표시됩니다:<br/>📧 조합원 뉴스레터 (역관목조분+PASA)<br/>🎬 홍보 영상 기획서 (9컷 스토리보드)<br/>📰 보도자료 (A4 1.5페이지 표준)" },
      { icon: "4", text: "클릭하면 에디터에 골격이 로드됩니다. <strong>{{빈칸}}</strong> 부분을 채우세요." },
    ],
    tip: "백엔드 서버(포트 8000)가 실행 중이어야 템플릿이 표시됩니다.",
    color: "border-amber-200 dark:border-amber-900",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
  },
  {
    priority: "🟡",
    badge: "단기",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    id: "g16",
    title: "G16 세대별 톤 변환 매크로",
    subtitle: "60대·40대·MZ 세 가지 어투 자동 변환",
    difficulty: "중간",
    impact: "중간",
    where: "리모컨 → 글자 탭 → G16",
    steps: [
      { icon: "1", text: "먼저 에디터에 텍스트를 입력하고 <strong>Ctrl+Enter</strong>로 변환을 실행합니다." },
      { icon: "2", text: "오른쪽 <strong>리모컨 패널</strong>에서 <strong>글자</strong> 탭을 클릭합니다." },
      { icon: "3", text: "<strong>G16 세대별 톤 변환</strong> 카드를 클릭합니다." },
      { icon: "4", text: "다이얼로그에서 <strong>60대 / 40대 / MZ</strong> 중 하나를 선택 → <strong>적용 ⏎</strong>" },
    ],
    tip: "LLM provider가 연결돼 있으면 AI 변환, 없으면 규칙 기반 변환으로 폴백됩니다.",
    color: "border-amber-200 dark:border-amber-900",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
  },
  {
    priority: "🟢",
    badge: "중기",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    id: "aipersona",
    title: "조직 전용 AI 비서 Instructions",
    subtitle: "채팅 시스템 프롬프트에 조직 지침 자동 주입",
    difficulty: "높음",
    impact: "높음",
    where: "로그인(관리자) → 조직 양식 관리 → AI 비서 설정",
    steps: [
      { icon: "1", text: "관리자 계정으로 로그인 후 상단 계정 메뉴에서 <strong>조직 양식 관리</strong>를 엽니다." },
      { icon: "2", text: "좌측 목록에서 편집할 조직을 선택합니다." },
      { icon: "3", text: "우측 편집 폼을 아래로 스크롤 → <strong>AI 비서 설정</strong> 섹션을 찾습니다." },
      { icon: "4", text: "<strong>AI 비서 이름</strong>(예: 농협 공문 비서)과 <strong>조직 전용 AI 인스트럭션</strong>을 입력 → 저장합니다." },
      { icon: "5", text: "이후 해당 조직이 선택된 상태에서 AI 채팅 시 인스트럭션이 시스템 프롬프트에 자동 추가됩니다." },
    ],
    tip: "인스트럭션 예시: '농협 브랜드 가이드라인 준수 · 공문 작성 시 역관목조분 적용 · 외부 기관명 언급 금지'",
    color: "border-emerald-200 dark:border-emerald-900",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
  {
    priority: "🟢",
    badge: "중기",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    id: "channel",
    title: "1:N 채널 내보내기 프리셋",
    subtitle: "한 문서를 인스타그램·밴드·이메일·블로그에 맞게 자동 변환",
    difficulty: "높음",
    impact: "중간",
    where: "리모컨 → 출력 탭 → 채널 내보내기",
    steps: [
      { icon: "1", text: "먼저 <strong>Ctrl+Enter</strong>로 문서를 변환합니다." },
      { icon: "2", text: "리모컨 패널에서 <strong>출력</strong> 탭을 클릭합니다." },
      { icon: "3", text: "다운로드 섹션 아래 <strong>채널 내보내기</strong> 2×2 그리드를 찾습니다." },
      { icon: "4", text: "원하는 채널 버튼을 클릭합니다." },
    ],
    tip: null,
    channels: [
      { emoji: "📸", name: "인스타그램", desc: "G16 MZ톤으로 변환 후 클립보드 복사" },
      { emoji: "💬", name: "밴드·카카오", desc: "G16 60대톤으로 변환 후 클립보드 복사" },
      { emoji: "📧", name: "이메일", desc: "PDF 다운로드 (첨부 최적화)" },
      { emoji: "✍️", name: "블로그", desc: "HTML+텍스트 클립보드 복사" },
    ],
    color: "border-emerald-200 dark:border-emerald-900",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
] as const;

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* 헤더 */}
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-neutral-500 hover:text-brand dark:text-neutral-400">
              ← DocuAI
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-sm font-medium">기능 가이드</span>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                농축협 DT 프로젝트과정 연계
              </span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                2026 · 정원훈 박사 / TenAI
              </span>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              DocuAI 신규 기능 7가지 확인 가이드
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              역관목조분·요정분생설 기반 AI 문서 작성 도구 — 기능별 위치·사용법 안내
            </p>
          </div>
        </div>
      </header>

      {/* 우선순위 요약 표 */}
      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">선순위</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">기능</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500 sm:table-cell">난이도</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500 sm:table-cell">임팩트</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">바로가기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {FEATURES.map((f) => (
                <tr key={f.id} className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="px-4 py-3 text-center text-base">{f.priority}</td>
                  <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200">{f.title}</td>
                  <td className="hidden px-4 py-3 text-neutral-500 dark:text-neutral-400 sm:table-cell">{f.difficulty}</td>
                  <td className="hidden px-4 py-3 text-neutral-500 dark:text-neutral-400 sm:table-cell">{f.impact}</td>
                  <td className="px-4 py-3">
                    <a href={`#${f.id}`} className="text-brand hover:underline text-xs font-medium">
                      보기 ↓
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기능별 카드 */}
      <div className="mx-auto max-w-4xl space-y-6 px-6 pb-16">
        {FEATURES.map((f, idx) => (
          <article
            key={f.id}
            id={f.id}
            className={`scroll-mt-6 overflow-hidden rounded-xl border-2 bg-white dark:bg-neutral-900 ${f.color}`}
          >
            {/* 카드 헤더 */}
            <div className={`border-b border-inherit px-6 py-4 ${f.iconBg}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xl">{f.priority}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${f.badgeColor}`}>
                      {f.badge}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-400">#{String(idx + 1).padStart(2, "0")}</span>
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{f.title}</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{f.subtitle}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-[10px]">
                  <span className="text-neutral-400">난이도: {f.difficulty}</span>
                  <span className="text-neutral-400">임팩트: {f.impact}</span>
                </div>
              </div>

              {/* 위치 */}
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-inherit bg-white/60 px-3 py-2 dark:bg-neutral-900/60">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">위치</span>
                <code className="text-xs text-neutral-700 dark:text-neutral-300">{f.where}</code>
              </div>
            </div>

            {/* 단계별 안내 */}
            <div className="px-6 py-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">사용 방법</h3>
              <ol className="space-y-3">
                {f.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                      {step.icon}
                    </span>
                    <span
                      className="text-sm text-neutral-700 dark:text-neutral-300"
                      dangerouslySetInnerHTML={{ __html: step.text }}
                    />
                  </li>
                ))}
              </ol>

              {/* 채널 그리드 (채널 내보내기 전용) */}
              {"channels" in f && f.channels && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {f.channels.map((ch) => (
                    <div
                      key={ch.name}
                      className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      <div className="mb-1 text-xl">{ch.emoji}</div>
                      <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{ch.name}</div>
                      <div className="text-[10px] text-neutral-500">{ch.desc}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 팁 */}
              {f.tip && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <span className="shrink-0">💡</span>
                  <span>{f.tip}</span>
                </div>
              )}
            </div>
          </article>
        ))}

        {/* 공문 원클릭 정돈 — 보너스 */}
        <article
          id="gongmun"
          className="scroll-mt-6 overflow-hidden rounded-xl border-2 border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                보너스
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">공문 원클릭 정돈</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              T5·T16·S12·S13·B20 매크로 5종 순차 자동 실행
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/60 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/60">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">위치</span>
              <code className="text-xs text-neutral-700 dark:text-neutral-300">
                리모컨 → 변환 탭 (헤비유저 모드) → 공문 원클릭 정돈 버튼
              </code>
            </div>
          </div>
          <div className="px-6 py-5">
            <ol className="space-y-3">
              {[
                "상단 <strong>헤비유저 모드</strong>로 전환합니다.",
                "에디터에 공문 마크다운을 입력하고 <strong>정밀 변환 (HWPX)</strong>을 실행합니다.",
                "리모컨 변환 탭의 <strong>공문 원클릭 정돈</strong> 버튼(초록색)을 클릭합니다.",
                "T5(셀병합) → T16(줄간격) → S12(들여쓰기) → S13(행간) → B20(범피스제거) 순서로 자동 적용됩니다.",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span
                    className="text-sm text-neutral-700 dark:text-neutral-300"
                    dangerouslySetInnerHTML={{ __html: text }}
                  />
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="shrink-0">💡</span>
              <span>각 매크로가 실패해도 나머지는 계속 실행됩니다. 결과는 실시간으로 미리보기에 반영됩니다.</span>
            </div>
          </div>
        </article>

        {/* 푸터 */}
        <div className="pt-4 text-center text-xs text-neutral-400 dark:text-neutral-600">
          DocuAI × 농축협 DT 프로젝트과정 연계 가이드 · (주)TenAI · 정원훈 박사
          <br />
          <Link href="/" className="mt-1 inline-block hover:text-brand hover:underline">
            ← DocuAI 메인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
