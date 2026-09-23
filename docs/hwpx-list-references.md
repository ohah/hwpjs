# HWPX 번호·글머리표 내부 참조

`Document.inspectListReferences`는 암호화 선제 거부와 정확한 `Contents/header.xml` 선택 뒤 [header 리소스 ID 색인](hwpx-header-resources.md)을 만들고 같은 XML을 다시 읽습니다. `refList/paraProperties/paraPr/heading`의 `type=NUMBER`는 명시적 `numberings/numbering.id`, `type=BULLET`은 `bullets/bullet.id`와 대조합니다. 숫자는 목록 위치가 아닌 ID입니다. 한컴 공개 모델의 [`heading` 타입 목록](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h#L522-L537)에는 `NONE`, `OUTLINE`, `NUMBER`, `BULLET`이 있고, [`heading` 속성](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/heading.cpp#L44-L60)에 `type/idRef/level`이 있습니다.

`NONE`과 `OUTLINE`은 번호·글머리표 테이블에 임의로 연결하지 않고 별도 집계합니다. 특히 corpus의 `OUTLINE idRef=0`을 번호 정의 ID 0 또는 1로 보정할 근거가 없어 링크 성공으로 세지 않습니다. 이 두 타입과 `type` 부재의 `idRef`는 숫자 문법을 검사하되, 부재와 0이 아닌 값을 진단합니다. 모르는 타입·잘못된 숫자는 오류입니다. NUMBER/BULLET의 `idRef` 부재, 대상 테이블 부재, 대상 ID 부재는 [공통 ID 대조](hwpx-header-references.md)와 같은 `id_references.zig` 회계로 구분합니다. 문단 모양의 `heading` 요소 부재와 복수 선언도 진단으로 남깁니다.

`refList/numberings/numbering/paraHead`와 `refList/bullets/bullet/paraHead`의 `charPrIDRef`는 직접 자식에서만 검사하고 명시적 `charProperties/charPr.id`와 대조합니다. 한컴 공개 모델은 [`paraHead`의 u32 참조 속성](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/ParaHeadType.cpp#L60-L86)을 읽고 씁니다. 실파일에서 흔한 최대 u32 값 `4294967295`는 해당 ID가 실제 `charPr`에 없을 때만 별도 표식으로 집계하며, 그 의미를 다른 글자 모양으로 자동 추론하지 않습니다. 실제 최대 u32 ID가 선언되면 정상 참조로 대조합니다. 속성 부재와 명시적 ID 0도 구별합니다.

2011 head namespace와 위 직접 계층만 대상입니다. XML 문법·namespace는 전체를 검사하지만 다른 하위 필드의 의미는 검사하지 않습니다. 기본 한도는 각 header XML 읽기 32MiB와 속성 값 4096바이트이며 호출자가 조정할 수 있습니다. 결과는 숫자 진단만 소유하여 별도 해제가 필요 없습니다. 기존 리소스 색인의 ID 목록은 호출 중 해제됩니다.

## 실파일·적대적 검증

두 corpus의 `.hwpx` 484개 중 ZIP 거부 6개와 암호화 2개를 제외한 476개를 조사했습니다. 문단 모양 28,144개 가운데 `heading`은 27,766개, 요소 부재는 378개, 복수 선언은 0개였습니다. 타입은 `NONE` 25,122개, `OUTLINE` 2,358개, NUMBER 153개, BULLET 133개입니다. NUMBER는 153개 전부 해결됐고 BULLET은 128개 해결·5개 대상 테이블 부재입니다. 후자 5건은 서로 다른 minor 버전 1 문서 5개에서 `idRef=0`으로 나타났으며, 대상 ID가 잘못된 경우와 구별합니다. 타입·비연결 ID 속성 부재 및 비연결 ID의 0 아닌 값은 0개였습니다.

번호 정의의 `paraHead` 4,976개에서는 글자 모양 ID 644개가 해결되고 나머지 4,332개가 미정의 최대 u32 표식이었습니다. 글머리표의 `paraHead` 83개에서는 3개가 해결되고 80개가 같은 표식이었습니다. 이 표식을 글자 모양 ID 0으로 치환하지 않습니다. 대상 ID 부재와 대상 테이블 부재는 이 두 `paraHead` 종류 모두 0개였습니다. 이는 조사한 corpus의 사실이며 더 넓은 HWPX 입력의 유효성 보증은 아닙니다.

합성 테스트는 희소·역순 번호/글머리표 ID, 타입별 분기, 글자 모양 ID 0과 최대 u32의 선언/미선언 차이, 속성·테이블·`heading` 요소 부재, 복수 `heading`, namespace·조상 위장, 잘못된 타입·숫자·크기 한도, 모든 할당 실패와 ReleaseFast 해제 회계를 검사합니다. `page.hwpx`, `lists-bullet.hwpx`와 암호 문서도 검사합니다. corpus 명령은 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus list definition links read-only survey'`이며 전체 corpus 묶음 실행으로 확대해 주장하지 않습니다.

독립 소스 복사본에서 BULLET을 NUMBER 테이블에 연결하기, `refList` 조상 검사 제거, 실제 선언된 최대 u32 글자 모양을 표식으로 오분류하기, 리소스 목록 해제 제거의 네 변이를 주입했습니다. 앞의 세 변이는 각각 타입별 ID·조상 위장·최대 ID 테스트에서 실패했고 마지막은 ReleaseFast 할당 실패 검사에서 누수를 검출했습니다. 제품 소스는 변이하지 않았습니다.

최종 소스의 HWPX 필터 테스트는 Debug·ReleaseFast 각각 71/71, 기본 전체 테스트는 2093/2093 통과했습니다. Debug·ReleaseSafe·ReleaseFast 정규 `audit`는 각 40/40 단계·2132/2132 테스트, ReleaseSafe `compare`는 8/8 단계·47/47 테스트 통과했습니다. ReleaseSafe 제품 빌드, Zig 포맷 검사, 변경 문서의 로컬 링크 검사도 통과했습니다. 정규 audit의 다른 형식 검사를 이 HWPX 계층의 의미 검증으로 계산하지 않습니다.

번호·글머리표의 텍스트 형식, `OUTLINE`의 실제 적용 관계, 이미지 글머리표, 문단별 렌더링, 2021/2024 namespace, 편집·저장 및 다른 header/section 내부 참조는 아직 미구현입니다. 이 보고서 하나로 전체 문서 검증이 끝난 것은 아닙니다.
