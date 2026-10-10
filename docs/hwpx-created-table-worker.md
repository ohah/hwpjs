# 생성 표 Worker 표시 경계

로컬 생성 셀 geometry와 글자 배치 책임은 [생성 표 셀 배치](hwpx-created-table-layout.md)를 따릅니다.

Worker `insert-table`은0기반 paragraph를 native1기반으로 변환하고 기존 공개 생성 거래를 호출합니다. `created-cell-text`는 section/identity/row/column/text를 전용 생성 셀 거래로 전달합니다. history가 켜진 HWPX에서만 명령을 수락합니다. 생성 identity는 응답에 유지합니다.

`editor_display_save.save`와 선택적 `saveForDisplay()`는 임시 section view에서 생성 registry만 제외해 기존 flat native 문단 주소를 유지하는 파생 표시 ZIP을 만듭니다. 원문과 registry·셀 텍스트를 변경하지 않으며 borrowed Session을 해제하지 않습니다. **다운로드 저장에 사용할 수 없습니다.** 일반 `save()`는 생성 표를 포함한 실제 저장입니다. 이전 WASM의 표시 저장은 기존 save로 fallback하며 생성 기능 availability는 네 관련 ABI가 모두 있을 때만 켭니다.

Worker의 HWPX 표시 재해석 경로는 표시 저장을 사용합니다. 생성 표는 `created-table-content`가 native 현재 스냅샷에서 별도 `content.createdTables`로 전달합니다. source node/flat 문단을 신규 셀 주소로 합성하지 않고 hostParagraph/anchorUnit만0기반 표시 주소로 파생합니다. 구간 밖 host의 표는 그 구간 응답에 넣지 않습니다. 생성 셀 표시 텍스트 예산을 초과하면 전체 조회를 거부하고 부분 문자열을 완전한 셀로 반환하지 않습니다.

pending 생성 표가 있는 구역의 host 입력 gate는 native와 일치하도록 editable/plainEditable/anchorEditable을false로 표시합니다. host 위치 재배치를 구현해 이 gate를 제거하는 것은 남은 작업입니다. 기존 표 inventory와 생성 표 inventory는 아직 Canvas에서 함께 그리지 않습니다.

2026-10-11 후보 `/tmp/hwpjs-created-table-display-save-20261011/bin/hwpjs.wasm`의 ReleaseSafe build·fmt, 공개 생성/history6/6·exit0과 실제 Worker3/3·exit0은 생성/셀 Unicode 입력/표시 기존 주소/undo 원문복원/잘못된 생성 뒤 redo/저장 바이트 일치를 확인했습니다. Worker 회귀는 체크박스 XML oracle와 header/footer 구조 입력도 포함합니다. 초기 테스트는 Buffer/Uint8Array 타입과 Worker 오류 envelope 및 오류명 전제를 잘못 두어 실패했으며 실제 바이트/계약으로 수정했습니다. 최초 공개 실행의 ENOENT는 빌드 완료 전 후보를 읽은 실행 오류였고 동일 빌드 완료 뒤 재실행했습니다.

표시 저장 native 집중2/2(root 포함)·exit0은 전체 할당 실패에서 registry/셀 텍스트 불변, 표시 원문 바이트와 실제 저장 바이트 보존을 확인했습니다. projection 집중2/2·exit0은 구간 밖 host 필터·wide identity 보존·표시 예산 초과 거부의 원자성과 이전 ABI 비조회 경계를 확인했습니다. 현재 기본 WASM에서도 체크박스/header-footer Worker2/2·exit0으로 fallback 회귀를 확인했습니다. 후보 SHA256은 `5cc964046d0424a45f2e483a4d0170a7a1e97c04fb0ecb0e6a53e5fda8070a45`입니다.

전체 corpus·실제 브라우저/Canvas 생성 표 paint·셀 hit-test/IME/삽입 메뉴·HWP5 신규 표는 아직 완료로 검증하지 않았습니다. 기본 WASM은 교체하지 않았습니다.
