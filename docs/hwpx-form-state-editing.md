# HWPX 폼 현재 상태·편집

HWPX 라디오·텍스트 폼의 현재 조회와 편집 계약이다. HWP5 폼 writer는 그대로 재사용한다. CLI/MCP 공통 입장·논리 참조·현재 owner 검증은 [폼 상태 연결](cli-form-state.md)이 소유한다. npm 릴리스나 원격 배포 완료를 뜻하지 않는다.

## 현재 Native 계약

optional export는 `hwpx_edit_radio_state(section,node)`, `hwpx_edit_select_form_radio(section,node)`, `hwpx_edit_form_text(section,node)`, `hwpx_edit_set_form_text(section,node,ptr,length)`, `hwpx_edit_form_text_retains_layout_flags()`, `hwpx_edit_radio_unnamed_singleton()` 여섯 개다. 기존 global ABI6와 history2를 유지한다. HWPX section은0부터, form node는 그 구역 Native source tree의 ID다. 이것을 영속 대상·다른 문서의 권한으로 사용하지 않는다.

`radio_state`/`form_text`는 현재 열린 세션의 pending 값을 조회한다. 기존 SDK output buffer 소유권·free 규칙을 그대로 적용한다. radio state는 CHECKED/UNCHECKED이며 미지 문자열을 기본값으로 바꾸지 않는다. text는 유효 UTF-8을 반환하고 선두 BOM을 데이터로 보존한다. SDK writer는 기존 optional 존재 검사, 정수 주소, Unicode, UTF-16 65535단위/UTF-8 196605바이트 상한을 적용한다.

Native에서 구역·source basis·활성 분기·문단 ancestor를 확인한다. radio 선택은 명시된 같은 nonempty 그룹명을 문서 전체에서 수집하고 선택 대상만 CHECKED로 만든다. 명시 빈 그룹은 문서 전체에 하나만 있을 때 허용하며 복수는 AmbiguousUnnamedRadioGroup이다. 부재 그룹명·미지 상태·변경 대상 권한 부재/보호는 거절한다. JS가 그룹별 setter를 반복하지 않는다.

폼텍스트는 hp:edit/hp:comboBox의 유일한 직접 hp:text 잎만 지원한다. 중복/부재 hp:text나 그 안의 요소 중첩은 거절한다. enabled/editable, edit의 readOnly/numOnly, combo의 editEnable을 Native가 검사한다. edit의 줄바꿈은 multiLine=true일 때만, numOnly=true는 ASCII 숫자만 받는 보수적 편집 정책이다. maxLength가 있으면 UTF-16 단위로 검사한다. XML 허용 문자·UTF-8은 기존 scalar/XML writer가 검증한다. 속성의 부재·미지 값에 권한 기본값을 넣지 않는다.

각 구역의 원본 tree는 유지하고 owned pending text/scalar를 기존 source identity에 저장한다. 모든 할당과 candidate.save를 성공시킨 뒤 no-allocation swap으로 live 세션에 반영한다. radio는 여러 구역의 준비값을 모두 검증한 뒤 교체한다. 기존 managed history의 checkpoint capture/exchange/owned byte cost에 form text를 포함한다. 선택·텍스트 변경 하나는 한 이력 항목이며 no-op은 추가하지 않는다. 후행 실패와 OOM에서 live 값·undo/redo가 유지된다.

## 저장과 보존

기존 XML tree/selection/identity binding/leaf text changes/source writer/ZIP serializer를 재사용한다. JS XML parser나 별도 Native 폼 모델은 추가하지 않는다. 체크박스/라디오 scalar 저장 후 text identity mapping을 적용하며, text mapping의 sibling 집합은 edit/comboBox와 기존 구조 owner로 한정한다. 다른 종류의 폼 추가·선택 때문에 text identity가 이동하지 않는다.

독립 XML oracle는 상태 value와 선택 hp:text 내용 외 section XML의 정확한 바이트, 다른 ZIP 멤버와 metadata를 비교한다. style/font/header/unknown 속성·주석·PI·list item·위치·폼 metadata를 보존한다. HWP5 회귀는 독립 CFB/record oracle 일반 및 -O로 비교한다. 합성 fixture로 검증한 보존을 임의 문서 전체의 무손실 인증으로 확대하지 않는다.

## 공개 화면 범위

기존 Native form source layout/font와 inline geometry가 검증된 edit/comboBox, checkbox/radio를 입력 대상으로 노출한다. edit의 멀티라인은 별도 preview profile을 따르며 미지 색·크기·layout flag는 화면 편집을 노출하지 않는다. Native는 다중행 edit를 지원하므로 CLI 지원 범위와 Canvas 표시 범위는 다르다. 기존 폼 controls를 Vanilla의 Core input lease/공통 bridge에 연결하며 React·Svelte는 같은 surface를 사용한다. 문서 교체/새 snapshot은 임시 input을 닫고 surface 종료는 listener를 정리한다. hit-test의 스크롤 stamp는 완료된 paint frame에만 게시한다.

## 출처와 검증 한계

공식 [KS X 6101](https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSX6101&menuId=503&tmprKsNo=KSX6101&topMenuId=502), [한컴 형식 공개 안내](https://www.hancom.com/support/downloadCenter/hwpOwpml), [한컴 양식 속성 도움말](https://help.hancom.com/hoffice130/ko-KR/Hwp/view/workwindow/workwindow%28attribute%29.htm)과 자체 Native tree/attribute/XML writer 계약을 사용했다. 도움말의 폼 속성 의미와 이 후보의 보수적 편집 정책을 구분한다. 공식 XSD 전체에 대한 유효성 검증 완료를 주장하지 않는다. 외부 비교 구현은 읽거나 사용하지 않았다. 프로젝트 전체의 엄격한 클린룸 인증을 주장하지 않는다.

멀티라인 화면 확장은 [별도 preview profile](hwpx-form-multiline-preview.md)을 따른다. Native/CLI 범위와 현재 화면 profile은 구분한다.

### HWP5 폼 텍스트의 표시·입력 권한

HWP5 edit/combo의 Canvas 표시는 원본 metadata·geometry·font를 그대로 사용한다. 입력창 진입은 같은 표시 descriptor의 `form.editable`로 제한하며 기존 HWPX와 같은 `form-text-canvas-controls` guard를 재사용한다. 원본 Native content를 수정하거나 별도 문서 모델을 만들지 않는다.

`hwp5FormTextEditAvailable`와 `hwp5FormTextLayoutRetentionAvailable`가 모두 명시적으로 true이고 원본 enabled/editable이 알려진 true일 때만 입력을 허용한다. edit는 read_only가 알려진 false, combo는 edit_enable이 알려진 true여야 한다. 누락·미지 값·형식 불일치는 false로 투영하며 기본값을 추정하지 않는다. readonly/disabled 및 미지 permission의 필드 자체는 계속 표시한다. Native는 적용 시 현재 권한과 문서 수명을 다시 검사한다.

F509 기반의 별도 증분에서 두 형식 × Vanilla/React/Svelte 정상 6흐름을 유지하고, 두 형식 readonly/disabled 음성 4흐름은 입력창이 열리지 않으며 실제 저장 결과가 원본과 바이트 단위로 같다. 독립 CFB/XML 일반/-O와 Native 현재 관측·미지 permission·구형/미지 optional flag의 집중 검증은 별도 handoff의 exact manifest를 따른다. 이 F509 검증만으로 OS IME·문서 암호 전수 검증이나 CRLF/wordWrap 확장의 완료를 뜻하지 않는다.


## 여러 줄 폼 원값의 표시·입력 투영

[여러 줄 폼 Canvas 계약](hwpx-form-multiline-preview.md)을 따릅니다. Native 원값의 CRLF/CR/LF를 유지하고 textarea LF는 임시 입력 투영으로 한정합니다. 변경하지 않은 행끝은 유지하며 새 줄의 명시 정책과 혼합 행끝의 모호한 교체 거절을 같은 계약에서 정의합니다. wordWrap=true는 Native frame/font의 Canvas 측정으로 soft wrap하고 저장값에 LF를 추가하지 않습니다. F2 현재 permission projection/readonly/oldABI/lease/history 계약은 그대로 유지합니다. 기존 form-text schema와 JSON 문자열의 `\r\n`/`\n`을 사용하므로 새 Native/CLI schema를 추가하지 않습니다. 현재 ac652 source/Node/타입 및 canonical full Demo17개 GUI 검증을 이전 후보 증거와 구분하며, 실제 OS IME·열린 폼의 live font mutation 완료를 주장하지 않습니다.

<a id="mixed-form-source-row"></a>
## 폼 값과 원본 표 행 편집의 혼합 Native 이력

자체 생성한 6개 폼과 같은 문서의 plain HOST에 만든 2×2 비병합 source table을 저장/재열기한 고정 입력을 사용합니다. 입력 SHA·크기는 `packages/cli/e2e/fixtures/form-source-row/manifest.json`이 소유하며 생성 엔진은 ac652입니다. 외부 문서/글꼴/리소스를 이식하지 않습니다. 폼 앞/뒤 표, HWP5/HWPX, 행 삽입/삭제, 폼→행/행→폼을 검사합니다. 구조 변경 후 current owner를 다시 읽고 바인딩을 발급하며 숫자 node를 영속 참조로 저장하지 않습니다.

폼 텍스트·체크박스·라디오를 연속 반영한 뒤 마지막 쓰기와 row 호출 사이에는 getter/save를 넣지 않습니다. 매 undo/redo 단계의 현재 값·독립 CFB/XML·정확 save/reopen을 확인하며 전체 undo는 원본 bytes, 전체 redo는 최초 mixed 저장 bytes와 같습니다. 보호/readonly/stale 거절은 성공한 이전 pending 변경과 전체 Native history/revision/redo를 유지합니다. HWPX 셀 보호는 숫자 `protect="1"`로 `ProtectedSourceTable`을 검증합니다. 문자열 `true`의 정수 파싱 거절을 보호 권한 검사로 간주하지 않습니다.

같은 gate는 실제 canonical CLI subprocess와 MCP stdio에서 원본 및 Native pending 저장본의 보호 셀 row 삽입/삭제를 거절하고 입력 SHA 불변·신규 출력 부재를 확인합니다. 프로세스 간 live pending/history 공유를 주장하지 않습니다. 독립 oracle 일반/`-O` 및 틀린 폼/셀 기대값 반례를 포함합니다. [정확 환경과 실행 명령](development-commands.md#폼-pending-값과-원본-표-행-편집-혼합-회귀)을 따릅니다. 임의 복합표·Noori 혼합·GUI·모든 폼 지원의 근거로 확대하지 않습니다.

## 요청 범위의 현재값 조회

폼 getter의 요청 인덱스와 CLI/MCP 수집기의 동기 callback 계약은 [읽기 범위 계약](hwpx-read-observation-scope.md#동기-구간의-폼-조회-인덱스)이 소유합니다. 현재 원본·pending 값·history가 SSOT이며 별도 폼 문서 모델이나 쓰기 권한을 만들지 않습니다.
