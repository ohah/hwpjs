# 원본 표 셀의 헤드리스 서식

원본 HWP5/HWPX 표 셀 문단은 본문과 같은 source paragraph ordinal ABI로 문자 속성·문단 정렬을 변경합니다. 셀 좌표를 문단 번호나 node ID로 추정하지 않습니다. `validateSelection`이 `paragraphSelectionOwner`의 table/list 소유자와 토큰·뷰·문자 경계·편집 가능성을 검사한 뒤 `validateFormattingTarget`이 capability와 원본 참조를 확인합니다. HWP5는 `kind:original` 바인딩이 필요합니다. 생성 셀·생성 문단·출처 불명 참조·다른 셀 소유자는 허용하지 않습니다.

Canvas surface는 본문용 `row.selectionOwner`만 읽지 않고 같은 `paragraphSelectionOwner` 함수를 사용해 선택을 공개합니다. 원본 표 셀의 selectionOwner가 null이어도 검증된 tableCell의 table/list 소유권을 사용합니다. canonical 함수가 유일한 소유권 계산 출처입니다. 이 surface 연결은 현재 작업 트리 데모에 포함되며 source core 커밋과 전체 UI 패키지 게시를 구분합니다.

`packages/core/tests/integration/typed-cell-formatting.test.ts`는 실제 noori.hwp/hwpx의 원본 셀에서 문자 속성과 정렬을 각각 변경합니다. HWP5 독립 CFB/전체 레코드·DocInfo·메타데이터 보존 oracle, HWPX 독립 ZIP/전체 XML oracle의 일반/최적화 실행, 잘못된 기대값 거부, undo 원본 바이트·redo·재열기 동일성을 확인합니다. 다른 owner·stale view 거부 시 Native 호출이나 저장이 발생하지 않는 것도 검사합니다. 원본 한 셀씩의 검증이며 전체 표·모든 조판의 성공으로 확대하지 않습니다.

현재 참조 수명·선택적 ABI는 [HWP5 현재 참조](hwp5-sdk-current-references.md)가 소유합니다. 생성 셀/도형 글상자/여러 셀에 걸친 서식은 이 확장의 완료 범위에 포함하지 않습니다.

## 문단 모양 응답의 버전 경계

현재 Native 후보는 HPS2(72바이트 행)를 반환하지만 이전 source SDK 디코더는 HPS1(48바이트 행)만 받아 `InvalidParagraphShapes`를 남겼습니다. 이 경우 셀의 실제 정렬이 가운데여도 관측값은 부재였고, 가운데 정렬 요청은 정당한 no-op입니다. 독립 후보 검사에서 이를 새 편집으로 기대한 실패를 발견했습니다. 디코더는 signature로 두 버전을 엄격히 구분하고 정확한 길이·행 ID·enum·presence와 effective heading 일관성을 검사합니다. HPS1에 없는 heading 필드를 기본값으로 만들어 넣지 않습니다. HPS2의 packed/extended/effective heading 값과 명시 extended zero도 구분합니다. `tests/hwp5/paragraph-shapes-wire.test.mjs`의 4건은 두 버전·signed 필드·부재/0·오프셋 뷰·손상 framing과 모순된 heading을 검사합니다. Native serializer 계약은 `src/wasm/paragraph_shapes_wire.zig`입니다.

## 후속 실측

현재 작업 트리 패키지 173건과 타입 검사가 통과했습니다. 실제 제품 Canvas `demo-cell-formatting/2026-10-24T16-37-00-062Z`는 Vanilla/React/Svelte × 두 형식의 원본 셀에서 물리 선택·네 서식 동작·실제 다운로드·별도 WASM 재열기·undo/redo·재업로드 6건을 통과했습니다. 별도 WASM 재열기는 독립 CFB/XML 저장 oracle과 구분합니다. 초기 자동화의 glyph만으로 source row를 추측한 매칭 실패는 실제 caret의 section/paragraph와 원본 row·textarea 값을 대조하도록 수정했으며 실패 산출물은 보존했습니다. 모든 테스트 브라우저는 종료했습니다.
