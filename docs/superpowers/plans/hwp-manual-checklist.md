# HWP 바이너리 실기 검증 체크리스트

Task 6 (HWP 5.0 바이너리 렌더러) 자동 테스트로 검증 불가능한 항목 — 실제 한컴오피스 필요.

자동 검증 완료 상태 (참고):
- olefile CFB 왕복, zlib 스트림, 레코드 정합성(바이트 단위 소비) — pytest 통과
- pyhwp 0.1b15 독립 파서로 DocInfo·BodyText 전체 레코드 파싱 + XML 변환 왕복 통과
  (SectionDef·ColumnsDef·TableControl·TableBody·TableCell 모두 정상 인식, 잔여 바이트 0)

## 한컴 한글 실기 확인

- [ ] 한글 2020/2024에서 생성 .hwp 열림 (오류 대화상자 없음)
- [ ] 제목·본문·굵게/기울임/밑줄 표시
- [ ] 헤딩이 크기+굵게로 구분되어 보임 (H1=16pt … H6=10pt)
- [ ] 리스트 마커(□ ○ ― ※) 텍스트로 표시
- [ ] 기본 표 렌더링 (2×2 이상, 셀 텍스트·테두리)
- [ ] 병합 셀 표는 텍스트로 강등되어 표시 (경고 정상)
- [ ] 미리보기(PrvText)·문서 정보(제목) 정상
- [ ] 프론트 HwpDropZone(kordoc)으로 재가져오기 성공
- 실패 시: UI 경고 + HWPX 대체 안내 확인

## 문제 발생 시 우선 의심 지점

1. 첫 문단의 secd/cold 컨트롤 헤더 페이로드 (`app/renderers/hwp/bodytext.py::_section_ctrl_records`)
2. 표 개체 공통 속성 플래그 (`_table_ctrl_records`의 CommonControl flags — 글자처럼 취급 비트)
3. PARA_LINE_SEG 더미 값 (한글이 저장된 레이아웃을 신뢰하는 경우 줄 높이 이상 가능)
4. CharShape 68바이트 레이아웃 (5.0.2.1+ borderFillId/strikeoutColor 미포함 — pyhwp DIFFSPEC 기준)
