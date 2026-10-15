# 필드 라벨 좌표의 표시 문자열

현재 게시 소스의 표 호스트 원인·후보 검증 경계는 [필드 범위 조회](hwpx-field-range-target.md)의 최신 기록이 소유합니다. 아래 과거 확장 후보의 중첩/덧말 지원을 현재 main 구현으로 소급하지 않습니다.

`fieldLabelDisplayText(section, paragraph)`는 기존1-based 문단 번호로 현재 보호 앵커·텍스트를 함께 조회합니다. 선택적 WASM export는 `hwpx_edit_field_label_display_text`이며 부재 시 JS는 `HwpxFieldLabelDisplayTextAbiUnavailable`을 반환합니다. 편집 허용 범위를 추가하거나 일반 텍스트 스냅샷을 변경하지 않습니다.

native `field_label_display_text.zig`는 먼저 기존 fieldLabels 정책을 확인합니다. 원문 모델은 기존 필드 명령 준비 결과의 segments/sites를, 현재 소유 모델은 기존 field_owned_positions 또는 보호 위치 투영을 재사용합니다. 문자열 합성과 예산 검사는 한 helper가 소유합니다. 덧말 표시 조회도 이 공통 경로를 사용합니다.

Worker의 `field-label-display-content.mjs`는 선택적 ABI가 있고 라벨이 있는 문단에만 적용합니다. 표시 예산에 실제 UTF-16 길이 차이를 반영합니다. 실패는 원래 표시 문자열을 유지하되 라벨 좌표를 비워 잘못된 위치를 편집할 수 없게 합니다.

## 실제 원인과 검증

후속 표 배치 정책의 원문 대조와 오류 문맥은 [표 앵커 거부 진단](hwpx-table-anchor-refusals.md)이 소유합니다.

36389301 덧말 파일의 인라인 표 node247은 native 문단17/앵커0이고 CLICK_HERE 라벨 범위0..1입니다. 원문 XML에도 직접 표가 있지만 일반 문자열 스냅샷은 빈 문자열이어서 표 페이지 경로가 `UnsupportedInlineTableHost`로 거부됐습니다. native 표시 조회를 연결한 뒤 호스트는 U+FFFC가 되며 다음 제한은 `UnsupportedTablePageAnchor`입니다. 임의 보호 문자 삽입이나 표 삭제로 우회하지 않았습니다.

최초 공통 표시 후보에서는 issue144 구조 분할 후 원문 준비 경로가 현재 필드 위치를 거부해 라벨이 사라지는 회귀가 발생했습니다. 현재 소유 위치 계산기를 연결한 뒤 기존 분할/입력/undo/redo 회귀를 다시 통과했습니다.

ReleaseSafe 후보 `zig-out/verification/field-label-display-owned-api/bin/hwpjs.wasm`의 SHA256은 `39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f`입니다. 빌드6/6과 아래 테스트6/6 종료코드0입니다.

`HWPJS_TEST_WASM=$PWD/zig-out/verification/field-label-display-owned-api/bin/hwpjs.wasm node --test tests/hwpx/field-label-display.test.mjs tests/hwpx/field-outside-worker.test.mjs tests/hwpx/dutmal-text-worker.test.mjs tests/hwpx/dutmal-renderer-worker.test.mjs`

실제 표 호스트 앞 Unicode 입력·조회 불변·whole-edit 거부 유지·독립 전체 XML/비대상 ZIP payload·일반 Python/-O·잘못된 기대값 거부·기존 구조 필드 회귀를 검사했습니다. native 코드는 전체 gate 전 로컬이고 JS/Worker는 선택적 API입니다. 전체 필드/문서·OOM·브라우저·표 페이지 조판 완료나 기본 WASM 승격으로 해석하지 않습니다.
