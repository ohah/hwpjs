# HWPX section 텍스트·내부 요소 이벤트

[한컴의 HWPX 구조 설명](https://tech.hancom.com/hwpxformat/)은 section의 `hp:p` 아래 `hp:run`과 `hp:t`가 본문 텍스트를 담는다고 설명합니다. `Document.inspectSectionText`는 기존 [header·spine 구조](hwpx-document-structure.md)가 고른 평문 section만 spine 순서로 다시 읽고, 2011 paragraph namespace의 `p`·`run`·`t`를 구분합니다. `hp:t`의 XML 문자 참조·CDATA·줄바꿈 정규화가 끝난 UTF-8 내용과 내부 요소 시작·끝·빈 태그를 원래 순서대로 콜백에 전달합니다. 콜백의 `Tag`·namespace scope·텍스트 바이트는 호출 중에만 유효하므로 보관하려면 호출자가 복사해야 합니다. 파싱 또는 콜백 오류 전까지의 이벤트는 이미 전달됐을 수 있으므로 호출자는 실패한 스트림의 부분 상태를 버려야 합니다. section의 manifest item 인덱스와 section·문단·run·text의 관측 순번을 이벤트에 포함합니다. 실제 편집 가능한 문서 모델은 아직 만들지 않습니다.

`paragraph_start/end`·`run_start/end`도 전달하므로 빈 문단과 빈 run을 건너뛰지 않고 경계를 복원할 수 있습니다. 시작 이벤트의 `Tag`에서 `id`·`paraPrIDRef`·`styleIDRef`·`charPrIDRef`를 XML 정규화된 값으로 읽을 수 있지만, 그 값의 header 참조 검증은 기존 [section 서식 참조](hwpx-section-references.md)가 소유합니다. [한컴의 본문 구조 설명](https://tech.hancom.com/python-hwpx-parsing-2/)에서 section은 하나 이상의 직접 문단, 문단은 하나 이상의 직접 run을 갖는다고 설명합니다. 이 계층은 두 필수 자식의 부재와 문단 직접 자식이 아닌 run을 별도 진단으로 반환합니다. 없는 문단·run을 만들어 채우지 않고, 한 실파일 편차 때문에 나머지 내용을 버리지 않습니다.

내부 요소의 2011 namespace 이름 `tab`, `fwSpace`, `nbSpace`, `lineBreak`, `titleMark`, `markpenBegin`, `markpenEnd`, `hypen`을 별도 종류로 분류합니다. 철자가 `hypen`인 실제 XML 이름도 임의로 고치지 않습니다. text/inline 태그와 속성은 콜백에 원형 `Tag`로 제공하되, 이 계층은 tab의 너비·leader/type, titleMark의 ignore, markpenBegin의 color를 해석하거나 inline 요소를 공백·줄바꿈 문자로 치환하지 않습니다. 미분류 내부 이름, 중첩 내부 요소, `run`의 직접 자식이 아닌 `t`는 각각 진단으로 남깁니다. 다른 namespace의 `t`는 본문 텍스트로 오인하지 않습니다.

`hp:t` 바깥의 비공백 XML 본문은 곧바로 손상으로 판정하지 않습니다. 실제 corpus에 `script`, `stringParam`, `shapeComment`, `integerParam`, `booleanParam`, `metaTag`, `firstKey`, `mainText`, `subText`의 텍스트가 있으므로 각각 관측 건수로 분리합니다. 이들은 표시용 `hp:t`가 아니며 이 계층은 내용 의미를 해석하지 않습니다. 그 밖의 부모 요소에 있는 비공백 본문은 `unknown`으로 집계하고 문제 건수에 포함합니다.

보고서의 `text_bytes`는 `hp:t` 하위의 UTF-8 내용 합계이고, `empty_text_elements`는 문자 내용이 0바이트인 `t` 수입니다. 내부 제어 요소가 있어도 문자 내용이 없으면 여기서는 비어 있다고 셉니다. 기본 한도는 section XML 하나 128 MiB·합계 256 MiB, `t` 200만 개·내부 요소 200만 개·본문 UTF-8 64 MiB이며 XML 공통 문법·깊이 한도도 유지합니다. 이 수치는 가시 문자 수나 렌더링 결과가 아닙니다. 조건부 분기 선택, 표·도형 내부 텍스트의 화면상 순서, 필드 의미, 다른 버전 namespace, 원문 왕복·저장은 후속 검증 대상입니다.

후속 [run 위치·자식 진단](hwpx-run-topology.md)은 section 텍스트 이벤트를 바꾸지 않고, 같은 `hp:run`의 직접 부모와 직접 자식·`secPr` 위치를 별도 보고서로 관측합니다. 두 보고서의 run 수·비직접 run 수는 실파일 검증에서 대조합니다.

## 검증

단위·통합 테스트는 참조·CDATA와 제어 요소 사이의 순서, 속성 접근의 콜백 수명, 8종 분류, namespace 위장, 미분류·중첩 요소, 중첩 문단 순번, 정확한 한도, 콜백 오류 뒤 재시도, 전 할당 실패 경로를 확인합니다. 실파일 선택 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus section text and inline token read-only survey'`로 실행합니다. 독립 oracle `python3 tools/hwpx-section-text-oracle.py`는 Python 표준 ZIP/XML 파서로 OPF spine을 따라가며 제품 코드를 사용하지 않습니다. 두 조사의 corpus 의존성은 [개발·검증 명령](development-commands.md)을 따릅니다.

두 구현은 로컬 corpus의 HWPX 484개 중 ZIP 거부 6개·암호 문서 2개를 제외한 476개, section 544개에서 문단 215,146개·run 267,347개·`hp:t` 230,677개·문자 내용 0바이트인 `t` 14,607개·본문 UTF-8 7,975,957바이트로 일치했습니다. 내부 요소는 tab 7,582·fwSpace 2,981·nbSpace 1,398·lineBreak 2,852·titleMark 367·markpenBegin 27·markpenEnd 31·hypen 17건이고 미분류·중첩·`run` 밖의 `t`는 0건입니다. `hp:t` 밖 비공백 내용 27,168건도 script 23,227·stringParam 1,833·shapeComment 1,687·integerParam 400·booleanParam 12·metaTag 4·firstKey 3·mainText 1·subText 1건으로 정확히 일치하며 미분류 0건입니다. 이는 현재 corpus의 토큰 경계·개수 대조이지 표시 결과나 텍스트 의미의 동치 증명이 아닙니다.

독립 조사에서 직접 section 문단 76,920개, 직접 문단이 없는 section 0개, 직접 run이 없는 문단 1개, 비직접 run 0개를 관측했습니다. 유일한 편차는 `reference/rhwp/samples/hwpx/opengov/36386761_백제학연구총서위탁판매의뢰목록.hwpx`의 `Contents/section0.xml`에 있는 최상위 `hp:p`로, `id="2147483648"`이며 자식은 `linesegarray`뿐입니다. 파일 SHA-256은 `be62c96c2766375dc42640c7f22cddc384f1e47271aae3bc636800d0fc98ece5`, version.xml의 버전은 5.1.0.1입니다. 이 자료만으로 파일 손상인지 생성기의 허용 편차인지 단정하지 않고 미지원/불일치 진단으로 남깁니다.

첫 section 텍스트 커밋 `4602ef10` 당시 기본 `zig build test --summary all` 2,153/2,153 테스트, section 텍스트 ReleaseFast 전용 9/9 테스트, Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`, ReleaseSafe 제품 빌드 및 기존 JS 비교가 통과했습니다. 이들 기본 감사에는 위 선택 실파일 조사가 포함되지 않으므로 제품 Zig 조사와 독립 Python oracle을 별도로 실행했습니다. 문단/run 경계 추가 후 검증은 별도로 기록합니다.

문단/run 경계 추가 후 `zig fmt --check build.zig src`, `git diff --check`, section 텍스트 Debug 11/11 테스트와 실파일 편차 단독 ReleaseFast 테스트, 기본 `zig build test --summary all` 2,155/2,155 테스트, ReleaseSafe 제품 빌드·기존 JS 비교 47/47 테스트, Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all`이 통과했습니다. 선택 제품 조사는 476개 파일의 모든 문단/run 시작·종료 건수와 중첩 순서를 확인했고, 독립 Python oracle과 새 진단값 76,920/0/1/0 및 기존 텍스트 집계가 일치했습니다. 이 검증도 전체 HWPX 스키마 적합성이나 편집·렌더링 정확도를 증명하지는 않습니다.
