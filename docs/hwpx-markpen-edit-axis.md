# 형광펜 마커와 빈 편집 위치

## 현재 원문·표시·편집의 차이

`정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx` 원본의0구역27/29/31/114/168/169/170/172/190번은 markpenBegin/markpenEnd만 있는 텍스트입니다. `field-exterior-table-input` 후보 SHA256 `1775eeeeeb6fa26a5ee5ea67e18f75898d704c78ba6cf88a66db82e81fcb0a73`의 실제 reader 이벤트에는 각 문단의 known markpen_begin/markpen_end가 노출되고, `displayHwpxContent`의 문자열은 모두 빈 문자열입니다. 같은 후보의 실제 splice는9개 모두 MissingTextSite로 거부됐고 마지막 save는 원문 byte-exact였습니다.

현재 `hwpx-content.mjs`는 알려진 markpen/title 마커에 폭을 합성하지 않습니다. U+FFFC는 unknown 인라인에만 적용됩니다. 따라서 알려진 형광펜 마커를 U+FFFC라고 가정하여 native 편집 축을 맞추는 방식은 현재 코드와 다릅니다. `text_sites.collect`의 일반 빈 t 수집은 first_child가 있는 요소를 제외하며, 해당 문단의 run도 비어 있지 않아 empty-run fallback 대상이 아닙니다.

## 독립 표시 경계 검사

`node --test tests/hwpx/markpen-display-axis.test.mjs`는1/1 exit0입니다. known 마커 쌍의 표시0단위, 앞뒤 Unicode 텍스트 보존, unknown 인라인의 U+FFFC 유지와1단위 표시 예산에서 emoji를 반으로 자르지 않는 것을 검사합니다. 새 파일은 현재 진행 중인657파일 실행 시작 뒤에 추가했으므로 그 전체 실행 범위에 소급 포함하지 않습니다. 기본 목록 등록은 형광펜 source 편집 회귀와 함께 후속 작업입니다.

## run 직접 마커의 후속 입력

잔여32/119/192번은 markpenBegin이 run 직접 자식이고 표 뒤의 t에 markpenEnd가 있습니다.1949번은 같은 시작 마커 뒤의 HYPERLINK(type editable0, 원본 dirty1)입니다. 2011 XSD의 t 직접 자식 정의와 구분하는 **관측 run 확장**이며 전체 문서를 XSD 유효하다고 판정하지 않습니다.

로컬 plain_paragraph_policy는 run 직접 마커도 같은 leaf retention helper로 검사하고0단위 metadata로 보존합니다. 알려지지 않은 run 자식이나 비어 있지 않은 마커는 허용하지 않습니다. 기존 anchor boundary Iterator가 표/그림 앞 원문 위치를 선택하므로 입력은 시작 마커 뒤·객체 앞에 들어가며, 문단 전체 plain 편집/객체 삭제 권한을 새로 주지 않습니다.

합성 회귀는 수정 전 UnsupportedParagraphControl을 재현했습니다. 수정 후 native3/3 exit0에서 run 마커·그림 보존형 입력과 객체 삭제 거부, 기존 빈 t/leaf 거부를 확인했습니다. 새 테스트의 삭제 위치를 UTF-16 길이5로 교정한 실행을 사용하며 최초 거부는 splice의 문단 정책에서 발생한 것입니다.

`run-markpen-source-input` 후보 SHA256 `a729e7344b6e51bfb9f88f8c1087af0bb3ff087e50c4c68e883f4394eb2b2d82`는 ReleaseSafe6/6입니다. 실제 four-site 회귀와 기본 목록 검사2/2 exit0에서32/119/192/1949 입력·독립 전체 XML/비대상 ZIP payload normal/-O·잘못된 기대값 거부·undo/redo·재열기/재저장·파일 불변을 확인했습니다. 객체 입력 oracle의 새 after_run_markpen 모드는 첫 빈 마커와 다음 tbl/pic/container를 검증하고, 마커 앞 삽입을 기대하는 기존 anchored 모드는 실제32번 결과를 거부하는 부정 대조로 유지했습니다. 이전 일반 oracle 경로를 느슨하게 바꾸지 않았습니다.

같은 후보의 원본 전체4819문단 조회는 plain4390/anchored428/field1·거부0으로 exit0입니다. 이는 경로 조회이며 실제 입력은 이번4곳과 앞선 빈 t9곳의 개별 증거로 구분합니다. 전체439파일 새 후보 재검사·마커 서식 변경/강조 렌더링·실제 브라우저·최신 전체 native/public gate는 남습니다. core 코드와 제품 승격도 아직 보류합니다.

## 구현·검증할 계약

### 로컬 source 입력 수정과 실제 검증

`retained_markpen_marker.zig`는 정확한2011 namespace의 비어 있는 leaf 시작/끝만0단위 보존 마커로 분류합니다. 외부 namespace·내부 자식·내부 문자 payload는 제외합니다. 속성을 임의 수정하거나 marker 균형/강조 효과를 평가하지 않습니다. `text_sites.collect`는 마커 leaf만 있고 기존 문자 사이트가 없는 t에 원문 시작 태그 바로 뒤의0길이 사이트를 만들며 새 run/t를 만들지 않습니다. 원문 prefix는 첫 마커 앞에 삽입하고 마커·원래 charPrIDRef를 보존합니다. 일반 문단 정책과 위치 투영은 같은 helper를 공유하고 알려지지 않은 인라인을 일괄 허용하지 않습니다.

`zig test src/markpen_regression_test.zig -O ReleaseSafe --test-filter 'markpen source empty' --test-filter 'retained markpen leaf'`는2/2 exit0입니다. 합성 빈 텍스트 입력·마커/색상 원문·저장/재열기·undo 원문/redo 수정본과 부적합 leaf 거부를 확인했습니다. 정규 root에도 새 Session 회귀를 등록했습니다.

`markpen-source-input` 후보 SHA256 `df16a06ca5c5ced870fddcb9c82f4de94eeffda48fe1883c5e715a9435d5d9b8`는 ReleaseSafe build6/6 exit0입니다. `markpen-source-reference.test.mjs`와 표시 축 검사를 함께 실행하여2/2 exit0입니다. 실제9개 문단 각각의 Unicode/XML 문자 prefix·독립 전체 XML/비대상 ZIP normal/-O·잘못된 기대값 거부·undo/redo·재열기/재저장·원본 파일 불변을 확인했습니다. 임의 원문 서식이나 마커를 별도로 보정하지 않았습니다.

두 Node 회귀를 기본 HWPX 목록에 등록하고 누락 방지 검사도 갱신하여1/1 통과했습니다. 전체 build.zig/src fmt 검사도 exit0입니다. 현재657파일/native 전체 실행은 새 source 구현 이전에 시작한 것이므로 형광펜 수정 완료 gate가 아닙니다. source 코드·기본 등록의 커밋/제품 승격, 실패 할당 전수 검사·서식 편집/강조 렌더링·Worker/Canvas 실제 입력은 아직 남습니다. 테스트/기록만 원격에 반영합니다.

후속 native2/2 exit0에서는 합성 Session의 splice 준비/문자 할당을 checkAllAllocationFailures로 순회했습니다. 실패 후 텍스트 사이트가 원래 문자열과 같고 구조 모델이 생성되지 않았으며, 정상 검사 allocator로 save한 결과가 원문 byte-exact임을 확인했습니다. source 마커 사이트 수집 자체의 open 실패 sweep과 서식 편집/강조 렌더링은 이 검사 범위에 포함하지 않습니다. Canvas Worker 하네스의 실제27번 입력 검사는 별도로 실행 중이며 최종 결과 전에는 통과로 계산하지 않습니다.

후속 Canvas Worker 하네스1/1 exit0에서 실제27번의 빈 표시/편집 권한·입력 이벤트·변경 텍스트·독립 전체 XML normal/-O·save·undo 원문·redo 수정본을 확인했습니다. 이 실행은304.3초가 걸렸으며 실제 브라우저 E2E가 아닙니다. 발견된 반복 조회와 개선·재실측은 [자동 번호 화면 snapshot](hwpx-automatic-number-display-snapshot.md)이 소유합니다.

마커가 있는 빈 텍스트의 원본 삽입 위치와 서식 상속, 보존 마커의0단위 위치, 실제 강조 범위의 시작/끝 소유 관계를 따로 정의해야 합니다. metadata-only run fallback으로 새 run/t를 만들어 덮어쓰거나 미지원 인라인을 전부 허용하지 않습니다. 마커 속성과 원문 구조는 [인라인 주석 검사](hwpx-inline-annotations.md)의 공통 규칙을 재사용합니다.

로컬 2011 ParaList schema의 t는 mixed이며 markpenBegin의 선택적color와 markpenEnd를 직접 자식으로 정의합니다. 이것만으로 불균형 마커의 한글 표시 의미나 입력 affinity를 확정하지 않습니다. 위 검증은 보존형 prefix 입력에 한하며 실제 강조 렌더링·브라우저 입력과 한글 프로그램의 affinity 동등성은 아직 완료하지 않았습니다.
