# 문단 글머리표 정의 조회와 선택 UI

`editor.listParagraphBulletDefinitions({ token? })`는 현재 HWPX 헤더의 전체 선언을 읽습니다. 본문에 사용 중인 ID를 수집해 선언 목록으로 대체하지 않습니다. Native header_read_context와 기존 글머리표 판정을 재사용하고 SDK·Worker·Core의 읽기 전용 경로로 연결합니다.

## 조회 계약

available 결과는 schemaVersion1, scope `current-header`, coverage `complete`, source 순서의 declarations입니다. ordinal·nullable id/marker·canApply·nullable reason을 반환합니다. 미참조·불가·중복·ID 없는 선언도 포함하며 InvalidBulletId, DuplicateBulletId, UnsupportedBulletDeclaration을 구분합니다. 4096개 초과는 부분 목록 없이 LimitExceeded로 거부합니다. Native 순회·ID 계수는 선형이며 Map으로 중복을 확인합니다.

canApply는 정의의 적용 가능성이며 현재 문단에 대한 쓰기 권한과는 다릅니다. Core의 문서 token·상태·수명 검사를 통과한 결과만 소유 DTO로 반환하며 조회 자체로 문서·선택·이력을 바꾸지 않습니다. 실제 선언이 없는 available 빈 배열과 optional ABI가 없는 `ParagraphBulletDefinitionsAbiUnavailable`을 구분합니다.

## 편집 UI

서식 메뉴 ‘글머리표 적용/해제’와 문단 모양 창에서 같은 도구를 엽니다. 현재 헤더 전체 목록을 표시하고 지원하지 않는 선언은 비활성 옵션과 사유로 남깁니다. PUA 문자는 Unicode 값을 표시합니다. 적용/해제는 기존 `APPLY_FORMATTING_PATCH_COMMAND`의 paragraph.bullet writer를 사용하며 capture·selectionVersion·모달·stale·IME·Native 이력 규칙을 재사용합니다. API 조회가 불가능한 엔진에서 사용 ID를 추측해 목록을 합성하지 않습니다.

HWPX와 HWP5의 지원되는 일반 본문 문단에서 기존 문자 정의를 적용·해제합니다. 새 정의 생성·수정은 [HWPX 정의 편집](paragraph-bullet-definition-editing.md)과 [HWP5 글머리표](hwp5-paragraph-bullets.md)를 따릅니다. 번호 이어가기/재시작·다수 수준·모든 glyph/폰트 조판은 별도 미완료 목표입니다. [글머리표 편집](paragraph-bullet-editing.md)의 저장·리소스 소유권 계약을 따릅니다.

## 검증

새 optional export `hwpx_edit_bullet_definitions`를 추가하며 기존493개 export를 보존합니다. 이전 엔진과의 unavailable 응답도 실제 WASM으로 검사합니다. 전체24개 선언이 있지만 본문 BULLET 참조는0개인 독립 작성 입력에서 미참조99·지원 불가100을 확인하고 Native/SDK/Core/UI를 대조합니다. malformed·duplicate·foreign namespace·할당 실패·4097 예산 반례와 readonly/history/stale/dispose를 검사합니다.

기존 표·필드-글머리표 교차 회귀와 새 엔진의 실제 HWP5 입력/이력 재사용 경로를 별도 실행합니다. 공개 번들의 실제 메뉴·keyboard undo/redo·다운로드 XML·재열기는 source 시험과 구분하며 `zig-out/verification/bullet-ui-delivery-r1`의 결과가 소유합니다. 외부 공개 반영은 최종 결합본 재빌드·CI·배포 해시 확인 후에만 완료로 판단합니다.

최종 검증 중 기존 독립 XML 비교기의 Python assert가 -O에서 제거되어 잘못된 기대값을 통과시키는 반례를 확인했습니다. 비교 조건을 명시적 예외로 바꾸고 기존 writer 회귀에서 정상 결과·잘못된 글머리표 기대값을 Python 일반/-O 모두 검사하도록 보강했습니다. 이는 검증기 결함이며 문서 writer가 잘못 저장했다는 판정과 구분합니다. 실패 원자료와 수정 후 반례 결과를 함께 보존합니다.

최종 결합 Native는 선언/할당 실패/예산3개 및 필드 속성 rebase434 할당 실패·latebatch 복원4개를 통과했습니다. 포맷 이후 재빌드 엔진은 이전 후보와 바이트가 같으며 기존493개 export 보존과 조회 export1개 추가를 확인합니다. SDK/Core/UI·표·필드 교차79건, 등록된 새 엔진의 HWP5 실제 입력/이력·Worker22건, 강화된 writer9건이 통과했습니다. 최종 공개 번들에서 Vanilla·React·Svelte3경로의 전체24개 정의 표시·미참조99 적용·문단 모양 전환·해제·Escape 원본 보존·독립 XML 일반/-O와 잘못된 기대값 반려·실제 keyboard undo/redo·다운로드 재열기 및 소유 브라우저/서버 종료를 확인했습니다. 이전 검증 wrapper14시나리오를 이 최종3경로에 합산하지 않습니다.

새 문자 정의 생성·기존 정의 수정과 optional definitionWriter/definition 조회 확장은 [정의 편집 계약](paragraph-bullet-definition-editing.md)을 따릅니다. 기존 정의 선택과 새 리소스 쓰기의 Native 이력 비용을 구분합니다.
