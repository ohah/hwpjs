# HWP5 생성 본문 문단의 공개 서식 명령

`SET_CHARACTER_PROPERTIES_COMMAND`의 size/bold/italic과 `SET_PARAGRAPH_ALIGNMENT_COMMAND`는 같은 편집 세션에서 분할로 만들어진 HWP5 본문 문단도 대상으로 받습니다. 글자 속성은 비어 있지 않은 선택에 적용하고, 문단 정렬은 caret에서도 사용할 수 있습니다. caret의 다음 입력 서식, 생성 셀·글상자·각주, 다른 속성 명령과 atomic formatting patch의 지원 범위를 함께 확대하지 않습니다.

## 대상과 실행 경계

Core는 기존 선택 token·소유권·UTF-16 scalar 경계·capability를 검증합니다. 생성 문단은 `current-paragraph-reference.ts`로 epoch/scope/kind/section/id/row/column의 정확한 data 필드와 범위를 검사하고 요청용 복사본을 만듭니다. 표시 문단 번호는 그대로 유지하며 ID로 치환하지 않습니다. 글자 범위는 기존 display/source offset 변환을 재사용합니다. 정렬은 텍스트 범위 변환과 분리합니다. 순수 `getSelectionFormatting`도 같은 admission을 사용합니다.

Runtime은 참조가 포함된 HWP5 명령에 `hwp5-current-body-reference.mjs`를 적용합니다. 실제 Native source 문단 슬롯의 현재 참조와 전체 필드를 대조하고, 같은 Native 세션의 flow에서 body/top_level 소유권을 확인한 뒤 바로 기존 setter를 호출합니다. 검사와 setter 사이에 await는 없습니다. 잘못된 참조는 `InvalidCurrentFormattingReference`, 본문 외 소유권은 `UnsupportedFormattingOwner`로 쓰기 전에 거부합니다.

표 삽입도 같은 DTO 복사와 Native 바인딩 helper를 사용합니다. 표 고유 오류 코드는 wrapper에서 유지합니다. 원본 서식·하이퍼링크의 기존 ordinal 계약과 HWPX의 기존 번호 변환을 변경하지 않습니다. 참조 없는 직접 Runtime 요청은 기존 legacy 경로이며 이 새 바인딩 보장의 대상이 아닙니다.

## 비용과 검증 범위

참조 조회는 한 문단만 읽습니다. Native flow ABI는 구간 조회가 없어 소유권 확인 시 해당 구역을 한 번 읽는 O(n) 경로를 사용합니다. 일반 텍스트 입력·IME·증분 paint 경로에는 추가하지 않습니다.

검증 증거는 `zig-out/verification/hwp5-current-formatting-r1/`에 둡니다. Core 관측·명령, 실제 Native 및 독립 CFB 저장 비교, canonical SDK, 브라우저·배포를 구분합니다. 새 문단을 저장·재열어 원본 문단으로 바꾼 결과를 같은 세션 생성 문단의 증거로 사용하지 않습니다. npm 게시나 전체 서식·조판 완료를 뜻하지 않습니다.

## 크기 입력 초안

크기 입력창에서 적용 버튼으로 포커스를 옮기는 동안의 관측 갱신이 입력 초안을 기존 서식 값으로 덮지 않도록 합니다. 포인터 적용은 다른 도구 모음 버튼과 같은 기본 포커스 이동 방지 정책을 사용하고, 키보드로 적용 버튼에 포커스가 있을 때도 초안을 유지합니다. 명시적 `resetFormatDraft`는 이 경우에도 초안을 폐기합니다. 선택 token과 명령 허용 검사는 기존 bridge가 계속 수행합니다. 통제된 실패와 수정 검사는 `size-focus-before-fix.log`·`size-focus-after-fix.log`에 분리합니다.

## 실제 검사 결과와 후속 경계

같은 세션의 HWP5 생성 문단은 원본 표가 앞에 있는 경우를 포함해 canonical 공개 명령과 Native 저장 값·범위·다른 문단 보존·undo/redo를 독립 CFB로 대조했습니다. 브라우저는 Vanilla/React에서 HWP5 생성 본문과 원본 본문의 드래그 선택·굵게·기울임·19pt·가운데 정렬·입력 복구·저장 재열기를 확인했습니다. 크기 적용 클릭의 초안 덮임은 수정 전 실제 이벤트 순서와 저장 불변을 보존했고, 수정 후 19pt 저장을 확인했습니다.

HWPX의 저장·재열기 후 본문 서식은 같은 두 프레임워크에서 회귀 검사를 통과했습니다. 반면 새 문서를 여러 문단으로 나눈 같은 세션의 생성 본문에 굵게를 적용하면 `UnsupportedInlineControl`로 거부되는 별도 경계가 확인됐습니다. 직전 배포 번들에서도 같은 사례가 재현됐고, 거부 시 저장 바이트는 변하지 않았습니다. 이는 이번 HWP5 지원 확대로 해결된 것으로 계수하지 않습니다. 기존 거부를 우회하거나 문서를 자동 저장·재열어 성공한 것처럼 처리하지 않습니다. 정확한 UI/API/Native 경계와 원인은 별도 후속 조사 대상입니다.

Native·canonical 근거는 `contract/receipt.json`, UI 근거는 `browser/cohort-r6-r2-full/summary.json`의 HWP5 사례와 `browser/cohort-r9-r2-persisted-hwpx/summary.json`입니다. 같은 세션 HWPX 거부의 이전 배포 비교는 `browser/cohort-r8-previous-hwpx/summary.json`에 분리합니다.

HWPX 생성 문단의 `UnsupportedInlineControl`은 이후 수정됐습니다. 이 문서의 HWPX 거부 사례는 이전 후보의 재현 기록이며, 현재 원인·수정·검증은 [HWPX 생성 문단 서식 저장](hwpx-live-generated-formatting.md)을 따릅니다.
