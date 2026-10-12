# 형광펜 마커와 빈 편집 위치

## 현재 원문·표시·편집의 차이

`정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx` 원본의0구역27/29/31/114/168/169/170/172/190번은 markpenBegin/markpenEnd만 있는 텍스트입니다. `field-exterior-table-input` 후보 SHA256 `1775eeeeeb6fa26a5ee5ea67e18f75898d704c78ba6cf88a66db82e81fcb0a73`의 실제 reader 이벤트에는 각 문단의 known markpen_begin/markpen_end가 노출되고, `displayHwpxContent`의 문자열은 모두 빈 문자열입니다. 같은 후보의 실제 splice는9개 모두 MissingTextSite로 거부됐고 마지막 save는 원문 byte-exact였습니다.

현재 `hwpx-content.mjs`는 알려진 markpen/title 마커에 폭을 합성하지 않습니다. U+FFFC는 unknown 인라인에만 적용됩니다. 따라서 알려진 형광펜 마커를 U+FFFC라고 가정하여 native 편집 축을 맞추는 방식은 현재 코드와 다릅니다. `text_sites.collect`의 일반 빈 t 수집은 first_child가 있는 요소를 제외하며, 해당 문단의 run도 비어 있지 않아 empty-run fallback 대상이 아닙니다.

## 독립 표시 경계 검사

`node --test tests/hwpx/markpen-display-axis.test.mjs`는1/1 exit0입니다. known 마커 쌍의 표시0단위, 앞뒤 Unicode 텍스트 보존, unknown 인라인의 U+FFFC 유지와1단위 표시 예산에서 emoji를 반으로 자르지 않는 것을 검사합니다. 새 파일은 현재 진행 중인657파일 실행 시작 뒤에 추가했으므로 그 전체 실행 범위에 소급 포함하지 않습니다. 기본 목록 등록은 형광펜 source 편집 회귀와 함께 후속 작업입니다.

## 구현·검증할 계약

마커가 있는 빈 텍스트의 원본 삽입 위치와 서식 상속, 보존 마커의0단위 위치, 실제 강조 범위의 시작/끝 소유 관계를 따로 정의해야 합니다. metadata-only run fallback으로 새 run/t를 만들어 덮어쓰거나 미지원 인라인을 전부 허용하지 않습니다. 마커 속성과 원문 구조는 [인라인 주석 검사](hwpx-inline-annotations.md)의 공통 규칙을 재사용합니다.

로컬 2011 ParaList schema의 t는 mixed이며 markpenBegin의 선택적color와 markpenEnd를 직접 자식으로 정의합니다. 이것만으로 불균형 마커의 한글 표시 의미나 입력 affinity를 확정하지 않습니다. 현재 문서는 원인 재현과 표시 좌표만 검증했고, source 입력·실제 강조 렌더링·저장/undo/redo·브라우저 입력은 아직 구현/검증 완료가 아닙니다.
