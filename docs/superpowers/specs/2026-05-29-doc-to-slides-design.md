# 문서 → 슬라이드 내보내기 통합 설계

**Goal:** DocuAX 변환 결과 미리보기에서 슬라이드 생성기로 문서 내용을 원클릭으로 전달한다.

**Architecture:** sessionStorage를 브리지로 사용해 PreviewPane → /slides 페이지 간 데이터를 전달한다. 기존 SlideGeneratorPanel을 그대로 재사용해 코드 중복 없음.

**Tech Stack:** Next.js router, sessionStorage, 기존 `useWorkspace` store, `SlideGeneratorPanel`

---

## 컴포넌트 변경

### 1. PreviewPane.tsx — 버튼 추가

- 위치: 미리보기 상단 툴바, 📋 복사 버튼 왼쪽
- 조건: `preview` 가 존재할 때만 표시 (변환 결과 있을 때)
- 동작:
  1. `useWorkspace`에서 `source` (마크다운 원문) 읽기
  2. `sessionStorage.setItem('docuax_slide_prefill', source)` 저장
  3. `router.push('/slides')` 이동

```tsx
{preview && (
  <button onClick={handleExportToSlides}>
    🎞 슬라이드
  </button>
)}
```

### 2. SlideGeneratorPanel.tsx — 자동 채우기

- 마운트 시 `sessionStorage.getItem('docuax_slide_prefill')` 확인
- 값이 있으면 `documentText` state에 설정 + 모드를 `"document"`로 설정
- 즉시 `sessionStorage.removeItem('docuax_slide_prefill')` 삭제 (일회용)
- 텍스트가 길면 50,000자로 자르기 (API 제한)

---

## 데이터 흐름

```
사용자 클릭
  → PreviewPane: sessionStorage['docuax_slide_prefill'] = source
  → router.push('/slides')
  → SlideGeneratorPanel 마운트
  → sessionStorage 읽기 → documentText 채우기 → 삭제
  → 사용자: instruction 입력 후 생성 클릭
  → generateSlides API 호출
  → 슬라이드 에디터에 결과 표시
```

---

## 수정 파일

| 파일 | 변경 |
|------|------|
| `apps/frontend/src/components/preview/PreviewPane.tsx` | 슬라이드 내보내기 버튼 추가 |
| `apps/frontend/src/components/slides/SlideGeneratorPanel.tsx` | sessionStorage 자동 채우기 |

---

## 엣지 케이스

- source가 비어있으면 버튼 비활성화 (disabled)
- source가 50,000자 초과 시 잘라서 저장 + "(자동 요약됨)" 안내
- /slides 에서 뒤로가기 후 다시 방문해도 sessionStorage는 이미 삭제됨 (일회용)
