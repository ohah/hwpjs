# HWP5 기존 수식 스크립트 편집 소스 후보

## 현재 경계와 원인

기준은 원격 main `338723f1a1c49b8564942f3ddb884bfa07681df2`이다. HWP5 본문 caret 생성은 이미 equation_create_request/records/section/session 및 optional ABI로 연결돼 있다. 기존 수식의 equationSites/equationSnapshot은 읽기 전용이며 생성과 달리 내용을 바꾸는 Command가 없었다. 이 후보는 기존 EQEDIT의 스크립트만 편집하는 Native Command를 추가한다. 본문 root 수식만 입장하며 셀·머리말 등 중첩 host는 아직 거부한다. JS/SDK/Worker/UI 또는 ABI 추가는 이 패킷에 없다.

## 소유권과 자료

한컴 공식 HWP5 revision1.3(2018-11-08) 46쪽 표104/105의 EQEDIT 속성·길이·스크립트·색·기준선 구조를 대조했다. 원문 URL: https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf . 명세가 설명하지 않는 word와 폰트 배치를 새로 추측하지 않는다. 기존 자체 equation.Properties/readSelected의 명시 with_font 또는 version_only 배치를 받으며, 버전·길이 자동 fallback은 없다. 스크립트 뒤 bytes는 의미를 부여하지 않고 정확히 보존한다.

허용 raw는 기존 자체 공개 생성 예제 SHA256 `ad090cb478e4e160e15d8d97e8c14b07e0d993fa533a993f48ea5b55158f58ef`, 4096바이트다. 독립 own stdlib CFB 읽기로 header version0x05000300, records11, EQEDIT node10 하나와 원문 `x over y`를 확인했다. Native 기대값은 이 한 원본에 고정했다. 다른 구현·expected JSON·알고리즘을 입력으로 사용하지 않았다. 공식 검색 결과의 비공식 링크는 열거나 근거로 사용하지 않았다.

## 요청과 게시

observeEquationScriptEdit는 section/equation_node/명시 layout을 받고 현재 실제 equation_sources.Site, 전체 History ticket, 현재 section/payload/CTRL_HEADER·metadata 꼬리 SHA256과 속성을 값으로 복사한다. 표시 node만으로 편집 권한이 생기지 않는다. apply는 full binding/epoch, 현재 owner/anchor 및 hashes를 다시 대조한다. 보호 문단·수식 앵커와 겹치는 field·중복 control 원문·EQEDIT 하위 레코드는 거부한다. 선택한 레코드만 디코딩하므로 무관한 수식의 꼬리 배치를 추측하지 않는다.

새 script는 비어 있지 않은 UTF-8이며 UTF-16 code units <=65535, 입력 bytes <=262140이다. 기존 EQEDIT의 속성4바이트를 보존하고 길이 WORD와 스크립트 UTF-16LE만 교체한다. 폰트·색·기준선·버전·불명 word/꼬리, 모든 다른 레코드의 원문은 유지한다. record 수·순서·물리 node는 동일하며, payload 길이와 extended header 변경에 따른 PARA_HEADER style byte offset만 다시 계산한다.

기존 Section.rebased_source와 clone/checkpoint를 재사용해 현재 text/field/form/picture/table 의미값을 유지한다. pending table·자원 state는 교체하지 않는다. 후보 State에서 실제 전체 CFB save를 수행하고 새 Source로 재열어 동일한 유일 CTRL_HEADER 원문 소유자의 script를 검증한 뒤 Section 하나를 게시한다. 모호한 소유자나 writer가 원문 common을 변경하는 미지원 조합은 게시 전에 거부한다. 실질 변경 없음은 null 준비 결과라 이력·redo를 바꾸지 않는다.

수식 박스 크기·위치·baseline은 편집하지 않는다. 고정 geometry의 기존 줄 위치는 유지하며 내용에 맞춘 자동 크기 측정·재조판은 제공하지 않는다. 변경 후 기본 save는 기존 LayoutReflowRequired로 거부하며 명시 allow_stale_layout 정책을 유지한다. 이 선택을 정상 재조판 완료로 표시하지 않는다.

## 검증과 남은 작업

집중 진입점은 `src/hwp5_equation_script_edit_probe.zig`이며 `zig build test-hwp5-equation-script-edit`와 일반 core test 그래프에 연결했다. 현재 Native6 named+registration1을 준비했다. 범위는 실제 own raw 조회/단일 History/디스크 저장/재열기/undo/redo, 모든 비대상 CFB stream과 레코드·metadata tail 보존, stale/forged owner/hash, no-op와 invalid encoding의 prior redo 보존, 실제 output exact cap 및 cap-1, pending 생성 문단/본문 보존이다.

별도 own Python oracle은 정상/최적화 원본 자체 대조와 잘못된 script 기대값 거부를 검사한다. 이는 oracle 준비 증거이며 Native 출력 통과가 아니다. 실제 Native 컴파일/실행, allocation-failure sweep, 보호 field/중첩 host 반례 실행, 기본/extended header 전환 회귀 실행, 패키지 선언/ABI·Worker·공용 UI·실제 Canvas·렌더링과 저장 oracle 적용은 미실행이다. 후속 Native에는 1회 compiler/closure/slot/resource 고정이 필요하다.

## Native 보관 lease ABI 소스 후속

[선택 ABI·JS 계약](hwp5-equation-script-edit-abi.md)은 observation을 Native에만 보관하고 opaque 단일 사용 lease만 전달한다. Native 본체의 이전 cohort와 ABI 소스 준비·JS controlled 검사를 구분한다.

## Core·Worker·데모 연결

전체 HWP5 문서의 기존 본문 수식은 `hwp5EquationScriptSources(state)`로 열거한다. 조회 대상에는 현재 선택이 가리키는 수식의 section·equationNode와 원본에서 확인한 layout을 전달한다.

1. `editor.getHwp5EquationScript(selector, { token })`으로 현재 스크립트와 편집 대상을 조회한다.
2. 결과가 `available`이면 반환된 `target`과 새 `script`를 `EDIT_HWP5_EQUATION_SCRIPT_COMMAND`에 전달한다.
3. 적용 없이 닫을 때는 `editor.releaseHwp5EquationScript(target)`을 호출한다. 다시 선택하면 새 편집 대상을 조회한다.

Core는 현재 선택과 조회 순서를 검사한다. Worker는 SDK가 발급한 원본 객체를 보관하며 Native가 현재 문서·이력·보기 상태에서 쓰기 가능 여부를 최종 검증한다. 내부 식별자는 공개 타입에 포함되지 않는다.

데모 수식 도구는 `version-only` 배치의 기존 본문 수식을 선택하고, 현재 스크립트를 확인한 뒤 적용하는 흐름을 제공한다. `with-font`는 원본 배치를 확인한 Core 호출자가 명시한다. 저장과 고정 수식 상자의 제한은 위 계약을 따른다.

통합 소스 검증에서 정확한 선택, 지연 응답, 취소, 외부 대상, 한글 조합 중 제출 방지와 기존 HWPX 수식 동작을 확인했다. 새 WASM의 실제 편집과 브라우저 저장·재열기 검증은 별도로 남아 있다.
