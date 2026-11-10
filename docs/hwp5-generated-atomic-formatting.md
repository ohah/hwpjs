# HWP5 생성 본문의 일괄 서식

같은 편집 세션에서 분할로 만든 최상위 HWP5 본문에도 `queryFormatting`과 `APPLY_FORMATTING_PATCH_COMMAND`를 사용합니다. 글자·문단 속성을 한 번에 적용하거나 현재 문단 스타일을 기준으로 character/paragraph/all을 초기화합니다. 비어 있지 않은 글자 선택, 현재 token·소유권·Native capability가 필요하며 생성 셀·글상자·각주까지 함께 확대하지 않습니다. 기존 원본 중첩 문단의 계약은 유지합니다.

## 원인과 실행

기존 Native projection은 원본 source node만 허용했습니다. 따라서 legacy 개별 setter가 생성 본문을 처리해도 query·patch·reset은 `UnsupportedFormattingOwner`였습니다. Core만 우회하면 해결되지 않습니다.

Core는 기존 선택·범위 검증 뒤 현재 생성 문단의 일곱 data 필드를 소유 복사합니다. Runtime은 같은 Native 세션에서 현재 슬롯·epoch·scope·identity·본문 소유권을 확인한 직후 query합니다. 참조는 Native의 엄격한 selector DTO에 넘기기 전에 제거합니다. 기존 wire 종류 이름 `original-paragraph`는 호환성을 위해 유지하며 현재 source 슬롯을 가리킵니다. 생성 ID와 문단 ordinal을 바꾸어 사용하지 않습니다.

발급된 target과 Native session/revision binding으로 기존 atomic patch와 `History.applyBatch`를 실행합니다. 별도 이력·쓰기 모델·자동 저장/재열기를 만들지 않습니다. 오래된 참조와 binding, 보호·잘못된 scalar 범위는 쓰기 전에 거부합니다. 동일 값은 알려진 no-op이며 한 적용은 한 undo 항목입니다. 후기 실패와 OOM은 기존 rollback·redo·poison 계약을 유지합니다.

## 조회 수명과 비용

Runtime의 참조 창·flow Map은 query 한 번에만 사용하며 mutation·undo·다음 query로 넘기지 않습니다. 일괄 요청은 구역별 flow를 한 번 읽고 참조는 최대 1024 슬롯의 비중첩 창으로 공유합니다. Native Snapshot도 구역 소유권·보호, formatting source와 style/shape 결과를 query/preflight 안에서 공유하고 소멸 시 해제합니다. OOM을 정상 관측 결과처럼 캐시하지 않습니다.

구조 계획은 기존 paragraph-flow 소유권 인덱스와 instance Map, 뒤쪽 owner 인덱스로 반복 탐색을 줄입니다. 원본 ID의 중복·0과 생성 ID의 유일성 정책을 구분하며 이전 plan 또는 오류와의 차등 검사를 유지합니다. 일반 생성 본문 및 restart 없는 다중 삭제의 계측은 입력량에 비례합니다. retained restart 재검증과 서로 다른 raw 리소스 투영 비용은 남은 성능 작업입니다. 모든 상태·필드·문서에서 전체 API가 O(n)이라는 주장은 하지 않습니다.

## 검증 범위

Native 메모리 검사는 결합 적용·세 reset·사용자 지정 및 없는 스타일·보호된 대상·후행 실패·단일 이력·no-op·stale 참조·소유권과 할당 실패를 검사합니다. query/plan의 정해진 할당 지점과 transaction의 표본을 검사했으며 모든 commit/restore 실패를 전수 확인한 것은 아닙니다. 실제 Core와 새 WASM의 독립 CFB 검사는 전체 기존 레코드·다른 스트림·비대상 문단·UTF-16별 서식과 undo/redo를 대조합니다. 오라클은 Git에 추적된 정확한 의존성만 사용합니다.

공개 갤러리의 101개 경로, 고유 91개 입력은 이전 Native와 새 후보를 같은 고정 JS·입력·하네스로 비교했습니다. 읽기 91개와 편집 가능한 89개의 전체 문단 흐름·무편집 저장 결과에 차이가 없고, 2개 배포 문서의 기존 편집 거부도 유지됩니다. 이는 원본 앱의 bitmap·조판 동치나 모든 문서의 편집 완료를 뜻하지 않습니다.

근거는 `zig-out/verification/hwp5-generated-atomic-r1/`의 Native·SDK·corpus·계약 로그로 분리합니다. 검증 WASM은 `e140d7ec8388c4bc21440c6fd42c4de833da88d885e118ce82233b9fa18d2447`입니다. 브라우저·배포와 npm 게시는 별도입니다. 캐럿의 확장 다음 입력 서식과 전체 바꾸기는 별도 text transaction 작업입니다.

격리된 공개 데모 r2에서 Vanilla·React·Svelte 각각 생성 HWP5 본문의 글자(굵게·크기·색)와 문단(가운데 정렬·grid) 결합 적용을 검사했습니다. 6개 시나리오 모두 저장/재열기 이전의 첫 조회·한 Apply·한 undo/redo, 독립 CFB의 비대상 문단 보존과 후속 입력/재열기를 통과했습니다. 노출된 character reset과 API의 세 reset 검증은 구분합니다. 문단 여백은 `hwp5-source-unit`의 물리 단위 연결이 남아 있어 이 UI 검증에 포함하지 않습니다. [크기 빈 초안](formatting-dialogs.md#글자-크기를-지우고-다시-입력할-때)의 잘못된 관측값 복원도 별도로 수정했습니다. HWPX 생성 문단과 공개 서버 반영은 이 6개 양성 결과로 증명하지 않습니다.

HWPX의 분할 생성 본문은 이전 승인 빌드와 r2 모두 `UnsupportedFormattingOwner`로 복합 서식 조회가 거부됩니다. HWPX 원본 본문의 동일 모달 적용·단일 undo/redo는 r2에서 독립 XML로 확인했으며, 생성 본문의 실패를 양성 결과에 합치지 않습니다. 이 기존 제한의 확장은 후속 작업입니다.
