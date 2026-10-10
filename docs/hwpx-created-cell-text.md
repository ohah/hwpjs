# 생성 표 셀 텍스트 편집

`created_cell_text_session.set`은 section·생성 표 identity·0기반 row/column으로 생성 셀의 전체 UTF-8 텍스트를 교체합니다. 원본 표 node나 기존 flat 문단 번호를 생성 셀 주소로 사용하지 않습니다. 생성 셀 모델만 텍스트를 소유하며 XML은 저장 시 파생합니다. XML 문자 검증 → registry 복제 → 셀 교체 → 저장 검증 순서로 진행하고 실패하면 registry를 복원합니다. 동일 값은 변경하지 않습니다.

native History의 `created_cell_text` 명령은 기존 checkpoint를 공유합니다. 뒤 명령 실패 시 앞 셀 편집도 롤백하며 거부·동일 값은 redo를 제거하지 않습니다. WASM `hwpx_edit_set_created_cell_text(section, identity_low, identity_high, row, column, ptr, length)`와 JS `setCreatedCellText(section, identity, row, column, text)`는 선택적 API입니다. identity는 정밀도 손실을 막기 위해 양의 u64 정규 decimal string만 받으며 조회 decoder와 같은 검증기를 사용합니다. 이전 WASM에서는 `HwpxCreatedCellTextAbiUnavailable`입니다.

2026-10-11 ReleaseSafe native 집중 테스트 2/2(root 포함), 공개 집중 테스트 7/7, fmt 검사·ReleaseSafe build가 exit0입니다. 실제 charshape.hwpx 기반 staged 표의 Unicode/escape/CR 저장·재열기, undo/redo 저장 바이트 일치, 원본 불변, NUL/주소 거부, 늦은 batch 실패, 셀 교체·저장 경로의 모든 할당 실패를 확인했습니다. 공개 테스트는 원본 table.hwpx의 생성 identity 거부·원문과 빈 history 보존을 검사합니다. 공개 생성 명령으로 셀을 만든 JS 성공 E2E는 아직 없습니다.

후보 `/tmp/hwpjs-created-cell-text-20261011/bin/hwpjs.wasm` SHA256 `8f2809dd1f7ca379ab803b05fb2a9f652257f7e4e646174acd7bb8c4bf18145e`입니다. 기존 dirty 변경을 포함한 후보이며 기본 배포 WASM을 교체하지 않았습니다. 전체 native/전체 corpus 통과 주장으로 확대하지 않습니다.

공개 표 생성의 문서 전체 ID·서식 검증, Worker/Canvas projection·입력 연결, host 편집 위치 재배치, 셀 서식·여러 문단 편집, HWP5 신규 표 저장은 남아 있습니다.
