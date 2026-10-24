# 글상자와 도형 캡션의 원본 텍스트 서식

본문·표 셀과 마찬가지로 원본 글상자와 도형 캡션 문단도 Native source paragraph ordinal ABI로 문자 속성·문단 정렬을 변경합니다. `paragraphSelectionOwner`가 검증된 drawingNode/listNode와 text/caption 종류를 포함한 소유자를 계산하며 core와 Canvas가 같은 함수를 사용합니다. 두 종류 또는 표 셀과 도형 소유권이 동시에 붙은 모호한 문단은 거부합니다. 미지 중첩 문단을 본문 소유자로 대체하지 않습니다.

문자 범위는 기존 display→source 변환과 보호 표식 검사를 따릅니다. HWP5에는 original currentReference가 필요하며 생성 문단/생성 셀 지원을 추가하지 않습니다. 서식 후 선택은 텍스트·sourceOffsets·현재 참조 identity·표/도형 소유 메타데이터가 같을 때만 유지합니다. textNode 또는 captionNode가 바뀌었으면 소유자 문자열이 같더라도 이전 선택을 유지하지 않습니다.

저장 파일을 다시 열면 Native node ID가 재배정될 수 있습니다. owner는 세션 수명 안의 소유권 표현이지 저장되는 영속 ID가 아닙니다. 재열기에서는 새로운 문서 토큰과 현재 바인딩으로 owner를 다시 조회하며, 이전 문서의 토큰/owner를 재사용하지 않습니다. HWP5 textbox 캡션 서식 후 재열기에서 drawingNode19→18이 관측되어 잘못된 영속 ID 기대를 제거했습니다. 독립 전체 레코드 oracle로 개체 구조 보존을 별도로 검사합니다.

## 검증

- `tests/hwp5/paragraph-selection.test.mjs`: 기존 선택·복사·범위 회귀와 도형 종류/리스트/모호한 소유자·잘못된 node 값 검증 6건.
- `packages/core/tests/commands/formatting-selection.test.ts`: 기존 13건과 도형 메타데이터 유지/변경의 선택 연속성 4건.
- `packages/core/tests/integration/typed-drawing-formatting.test.ts`: 실제 textbox.hwp/hwpx의 글상자/도형 캡션 × 문자 속성/정렬 8건. 독립 CFB/전체 DocInfo·레코드 및 ZIP/전체 XML oracle의 일반/-O 실행·오답 거부, undo/redo·저장·재열기, body/다른 종류 owner 및 stale 토큰 거부를 포함합니다.
- 제품 Canvas `demo-drawing-formatting/2026-10-24T16-45-06-881Z`: 세 프레임워크 × 두 형식 글상자 물리 선택·네 서식 동작·실제 다운로드·별도 WASM 재열기·이력·재업로드 6건 통과. 별도 WASM은 독립 CFB/XML oracle와 구분하며, 제품 캡션도 `demo-caption-formatting/2026-10-24T17-00-45-190Z`에서 같은 6건을 통과했습니다. 초기 캡션 자동화는 제어 표식이 있는 문단 전체를 제외하여 대상이 없었으나, 실제 선택할 앞 두 글자가 보호 표식 앞에 있는 경우만 허용하도록 검증기를 고쳤습니다. 실패 산출물은 보존합니다. 현재 작업 트리 데모 검증이지 전체 UI 패키지 게시를 뜻하지 않습니다.

현재 작업 트리 패키지 185건·타입 검사와, 게시할 소스 후보의 독립 회귀 145건이 통과했습니다.

이 확장은 원본 한 글상자/캡션의 서식이며 전체 도형·조판·생성 문단·다중 개체 선택이나 모든 fixture 편집의 완료를 뜻하지 않습니다. 원본 표 셀 계약은 [별도 주제](headless-original-cell-formatting.md), 현재 참조 수명은 [HWP5 SDK 현재 참조](hwp5-sdk-current-references.md)가 소유합니다.
