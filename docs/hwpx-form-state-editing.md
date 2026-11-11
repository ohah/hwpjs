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

기존 Native form source layout/font와 inline geometry가 검증된 edit/comboBox, checkbox/radio를 입력 대상으로 노출한다. edit의 명시 LF 멀티라인은 별도 preview profile을 따르며 미지 색·크기·layout flag는 화면 편집을 노출하지 않는다. Native는 다중행 edit를 지원하므로 CLI 지원 범위와 Canvas 표시 범위는 다르다. 기존 폼 controls를 Vanilla의 Core input lease/공통 bridge에 연결하며 React·Svelte는 같은 surface를 사용한다. 문서 교체/새 snapshot은 임시 input을 닫고 surface 종료는 listener를 정리한다. hit-test의 스크롤 stamp는 완료된 paint frame에만 게시한다.

## 출처와 검증 한계

공식 [KS X 6101](https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSX6101&menuId=503&tmprKsNo=KSX6101&topMenuId=502), [한컴 형식 공개 안내](https://www.hancom.com/support/downloadCenter/hwpOwpml), [한컴 양식 속성 도움말](https://help.hancom.com/hoffice130/ko-KR/Hwp/view/workwindow/workwindow%28attribute%29.htm)과 자체 Native tree/attribute/XML writer 계약을 사용했다. 도움말의 폼 속성 의미와 이 후보의 보수적 편집 정책을 구분한다. 공식 XSD 전체에 대한 유효성 검증 완료를 주장하지 않는다. 외부 비교 구현은 읽거나 사용하지 않았다. 프로젝트 전체의 엄격한 클린룸 인증을 주장하지 않는다.

LF 멀티라인 화면 확장은 [별도 preview profile](hwpx-form-multiline-preview.md)을 따른다. Native/CLI 범위와 화면의 명시 LF profile은 구분한다.
