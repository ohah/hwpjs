# 관측 DocInfo 보존 모드의 JS 경계

## 계약

`createExperimentalHwp5Editor(wasm, input, { retainObservedDocInfo: true })`는 선택적 native 보존 모드를 명시적으로 요청합니다. 기본false이며 기존 strict open은 바뀌지 않습니다. CFB 보정이 필요하면 `normalizeObservedCfb:true`를 별도로 지정합니다. 이 옵션은 boolean만 허용하고 distribution/availableSectionCopy와의 조합은 WASM을 읽기 전에 거부합니다.

필요한 선택적 ABI는 `hwp5_edit_open_observed_docinfo(ptr,size,normalize_cfb)`와 `hwp5_edit_observed_docinfo_diagnostics()`입니다. 둘 중 하나라도 없으면 Hwp5ObservedDocInfoAbiUnavailable이며 자동으로 strict/다른 모드로 열지 않습니다. 기존 필수 ABI 목록을 늘리지 않습니다.

`editor.observedDocInfoDiagnostics()`는 native output의 복사본을 디코딩합니다. ABI가 지원하는 strict 세션의 결과는null이고, 보존 모드는 absent_carets/unresolved_font_types/unresolved_style_characters/unresolved_character_tails/absent_fill_additionals의5개 u32 개수와 resource_count_mismatch boolean을 반환합니다. 부재 값을0으로 제조하지 않습니다. 닫힌 세션에서는 EditorClosed가 우선하며, 해당 ABI가 없는 기존 WASM의 열린 세션에서는 Hwp5ObservedDocInfoAbiUnavailable입니다. 옵션·wire 검사는 `js/hwp5-observed-docinfo.mjs`가 소유하고 native 원문 해석은 담당하지 않습니다.

## 게시와 검증 (2026-10-20)

이번 게시 범위는 JS 연결·옵션/wire 회귀와 gate 등록뿐입니다. native 구현·Worker 자동 판단/동의 UI·실험 중인 표 생성/현재 참조 API는 포함하지 않았습니다. 현재 기본30434b54는 새 보존 모드 ABI가 없으므로 명시적 요청을 거부합니다. 이 게시만으로 불완전 DocInfo 파일이 기본 데모에서 편집 가능해지는 것은 아닙니다.

main fcbf8dc4의 분리 사본 `/tmp/hwpjs-observed-api-publish.BS1yKu`에서 통합 후보8aeb8f4d6bbf1692ece828ba22dd7d517ad345a24b1a588465f2ffcee0c74355·구형 baseline30434b54를 명시한 options/short-object-common-editor/negative-count/open-atomicity/range-edit 다섯 파일은8/8·skip0·exit0입니다. 실제 원본 보존·독립 전체 Section/비대상 stream·200개 범위 편집/이력/재열기·mapping18슬롯·실패 open의 상태 보존을 포함하지만 후보 전체 native 완료나 모든 편집 명령을 증명하지 않습니다.

같은 JS와 기본30434b54로 options/editor/normalization-abi 세 파일을 실행한 결과는10/10·skip0·exit0입니다. 기존 편집·독립 세션·정규화의 옵션/ABI·strict 바이트 보존과 새 모드의 구형 ABI 명시 거부를 확인했습니다. 두 실행은 서로 다른 artifact와 검사 목록이며 합산한 전수 수치로 표현하지 않습니다. 회귀의 구형 ABI 사례는 HWPJS_BASELINE_WASM을 명시해야 실행되며 미제공 시 skip입니다.
