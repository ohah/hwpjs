# HWP5 빈 문단 삽입 위치의 서식 관측

## 원인과 단일 출처

`page.hwp` 구역0/문단4는 원본 PARA_TEXT가 없고 header 문자 수가 1이며,
현재 Native character run은 위치0/shape1이다. 기존 Native는 `0..0` 범위를 반환했지만
일반 문자 coverage helper가 0길이를 읽지 않아 toolbar가 unknown을 표시했다.
입력 뒤 실제 문자가 생기면 같은 shape의 바탕/1000이 관측되었다.

공식 [HWP 5.0 revision1.3](https://cdn.hancom.com/link/docs/한글문서파일형식_5.0_revision1.3.pdf)
4.2.6 및 4.3.1~4.3.3의 문단 header/문자 위치/shape ID와 언어별 글꼴 참조 구조를
따른다. 생략된 빈 text의 의미는 기존 자체 `editableTextBytes`/current Session 모델의
`tokens 없음 + declared_units <= 1` 계약을 재사용한다. 이를 공식 포맷이 모든 missing
text를 빈 문단으로 보장한다고 해석하지 않는다. 문서 문자열/주변 문단에서 글꼴·크기를
추측하거나 기본값을 추가하지 않는다.

## Native와 private DTO

`insertion_character_source.zig`는 현재 Session 문단의 알려진 빈 삽입 위치만 판정한다.
생략/0길이 text와 declared_units<=1 또는 정확한 현재 CR-only 문단을 구분하고,
`character_display_ranges`가 검증한 단일 위치0 resource를 재사용한다. 선언이 없거나
손상된 missing text, 잘못된 리소스는 새 proof를 얻지 못한다. 본문 문자나 가짜 범위를
만들지 않고, readonly 관측은 파일/history를 변경하지 않는다.

Native `Backend.insertionField`는 같은 Session/ranges/characterField를 사용한다.
값이 known이어도 쓰기 권한은 `CaretTypingIntentRequired`로 거부한다. 범위 query의
빈 문자 선택 admission을 바꾸지 않으며 일반 `queryFormatting`의 문자 범위 API를
새 caret API로 확장했다는 주장은 하지 않는다.

기존 private HCR1의 flags bit0은 resource 존재다. 새 bit1(값2)은 Native가 확인한
빈 삽입 위치다. 따라서 새 관측 행의 flags는 3이며 기존 행은 0/1 그대로다. 기존
`hwp5_edit_character_ranges` export와 행 크기를 재사용한다. 새 WASM export/optional
함수를 추가하지 않는다. 이 비트는 HWP5 파일에 쓰는 값이 아니다.

SDK는 flags3의 단일 위치0/원본 end<=1 계약을 검증한다. 표시 투영은 표시 길이0에서만
proof를 유지한다. 일반 문자 범위 helper는 계속 0길이를 거부한다. 별도 insertion
관측만 proof를 소비하며 기존 단일 리소스/언어별 resolver를 재사용한다. 별도 파서나
ZIP/XML reader를 추가하지 않는다. Native 판정은 O(1), 기존 run 검증과 리소스 관측은
기존 제한 안의 O(n)이며 입력마다 Native/파일 재읽기를 새로 추가하지 않는다.

## toolbar와 pending intent

`getSelectionFormatting`은 토큰/owner가 검증된 현재 빈 caret에서만 이 proof를 읽는다.
서식 값은 읽기 권한과 쓰기 권한을 분리한다. 기존 `EmptyCharacterSelection`이나
readonly 거부 이유를 지우지 않는다. 이미 존재하는 Surface caret capture가 현재
pending properties와 해당 언어의 pending font를 합친다. Core create-editor,
wasm H5Edit, table split, field prompt를 수정하지 않는다.

7언어 값을 각각 유지한다. 대표 값은 기존 shell의 규칙대로 모든 언어가 같은
관측일 때만 단일 이름을 표시한다. 영문만 pending 변경하면 한글 값은 유지되고
대표 표시는 '언어별 글꼴'이다. source size는 Native의 1/100 point를 유지하며 toolbar의
기존 pt 표시 경계만 사용한다. marker paint/layout 및 폰트 수치 환산을 바꾸지 않는다.

## 검증과 남은 경계

Native 집중 probe는 실제 page.hwp에서 크기1000/한글 바탕, 조회 전후 저장 byte-exact,
입력·undo/redo와 단일 쿼리의 current Session을 검사한다. 합성 missing-text/선언 없음
반례와 allocation failure도 검사한다. Core/SDK 집중 검사는 stale/readonly/손상/구형
proof/없는 리소스, 서로 다른 언어별 이름과 정상 범위 회귀를 구분한다.

실제 공개 Vanilla/React/Svelte에서 원래 빈 문단 pointer/Home, 바탕10, 기본 입력,
undo/redo, 커서 이동, 영문만 pending font·대표/한글 표시, pending 저장 무변경,
pending12 입력 후 저장·undo/redo·재열기를 검사한다. 독립 CFB oracle은 정상/-O와
틀린 기대 크기 반례를 확인하고 source 선언/비대상 stream·문단 보존을 비교한다.
브라우저/server는 finally 종료하고 launch 전 8GiB 조건을 검사한다.

구형 WASM은 새 proof를 제공하지 않으므로 새 UI도 빈 위치를 unknown으로 유지한다.
구형 strict SDK는 flags3을 거부하므로 **Native + SDK/Worker + Core를 함께 재빌드**해야
한다. export set이 같다는 사실을 wire 의미 호환과 혼동하지 않는다. Main의 최종 결합
WASM SHA 프로필 등록은 기존 정책과 합본 게이트를 따른다. 초기 단독 R1 후보는
profile registry를 수정하지 않았으며, 현재 결합본은 아래 입력·Worker·이력 검증을 거쳐
정확한 바이너리 해시를 등록한다. 이 검증을 새로운 속도 측정 결과로 해석하지 않는다. 기존 empty owner 경로가
거부되는 경우에는 기존 full snapshot 경로가 유지된다. HWPX 빈 caret 지원 확대,
새 public caret Native ABI, 실제 readonly GUI 실행은 범위에 포함하지 않는다.

현재 합본은 Native 빈 문단 2건과 실제 Native/Core·구형 엔진·합성 손상/언어별 관측 9건을 검사한다. `empty-caret-formatting.test.mjs`는 실제 readonly Core 조회도 검사하며, 실제 readonly GUI 검증과 구분한다. Unicode 입력 `사😀`는 독립 CFB 일반/최적화 검사에서 UTF-16 단위 수와 원래 shape 승계를 대조한다. 실행·저장·재열기와 pending 언어별 글꼴/크기는 세 프레임워크 GUI에서 확인한다. 프로필 등록 후 실제 입력·Worker·이력 회귀 40건을 통과한 정확한 합본 WASM만 등록한다.
