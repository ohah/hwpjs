# HWP5 생성 본문의 밑줄·취소선·색·글꼴

같은 편집 세션에서 분할로 만든 최상위 HWP5 본문의 비어 있지 않은 선택에 네 가지 기존 명령을 적용합니다. 밑줄 종류, 취소선 on/off, 글자색, 언어 하나의 글꼴 이름을 변경합니다. 생성 문단 ID와 현재 source ordinal은 다른 값이며 서로 바꿔 사용하지 않습니다.

## 원인과 수정

실제 Native setter는 생성 문단에도 적용·저장·undo/redo가 가능했지만 Core는 기본 글자 속성과 정렬에만 생성 참조를 허용했습니다. 따라서 네 명령은 Native에 도달하기 전에 `UnsupportedFormattingReference`로 거부됐습니다. 반대로 저수준 Runtime의 네 분기는 전달된 참조를 읽지 않고 ordinal로만 실행했습니다. Core 제한만 풀면 오래된 참조가 다른 현재 대상에 적용되는 위험이 남습니다.

Core는 기존 `validateFormattingTarget`에서 네 capability도 생성 본문으로 허용하고 `current-paragraph-reference.ts`로 일곱 필드를 검증·복사합니다. Runtime의 네 분기는 기존 `validateHwp5CurrentBodyReference`를 호출한 후 즉시 setter를 실행합니다. Native 조회와 mutation 사이에는 await가 없습니다. epoch/scope/kind/section/id/row/column의 현재 값과 최상위 body 소유권을 확인하며 잘못된 참조는 쓰기 전에 거부합니다.

기존 선택 token·읽기 전용·capability·UTF-16 scalar 경계·보호 anchor·관측 값 검증은 유지합니다. 생성 셀·중첩 개체·빈 선택과 atomic query/patch/reset을 함께 허용하지 않습니다. 참조 없는 원본 ordinal Runtime 호환 경로도 유지하며, 해당 경로를 새 참조 보장의 대상으로 안내하지 않습니다.

## 비용과 검증

참조는 한 문단을 조회하고 소유권은 해당 구역의 flow를 한 번 읽습니다. 기존 공통 helper의 O(n) 비용을 재사용하며 일반 입력/IME 경로에는 추가하지 않습니다. 별도 참조 캐시를 만들어 Native와 다른 상태를 관리하지 않습니다.

Core 검사는 생성 ID와 ordinal이 다른 대상, 복사된 일곱 필드, token·범위·capability·소유권·관측 오류를 확인합니다. 실제 WASM 검사는 같은 세션의 공개 Core dispatch, 네 서식의 누적 보존, no-op·undo/redo, 오래된/다른 세션/다른 문단/잘못된 참조의 저장 바이트 불변을 확인합니다. 독립 CFB 비교기는 DocInfo·본문·다른 스트림과 메타데이터를 검사합니다. Native setter 성공만으로 공개 UI 전체의 완료를 주장하지 않습니다.

근거는 `zig-out/verification/hwp5-generated-extended-formatting-r1/`에 보관합니다. 사용한 Native WASM은 `72dadc5054047db9af10bf2eff69ea186804d4451644ba9cba7ad9abd3c87d74`이며 이 확장에는 Native 변경이 없습니다. npm 게시와 모든 서식·조판 완료는 별도입니다.
