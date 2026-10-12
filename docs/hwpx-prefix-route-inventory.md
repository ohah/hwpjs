# HWPX prefix 입력 경로의 읽기 전용 전수 조사

`node tools/hwpx-prefix-route-inventory.mjs --wasm=/absolute/candidate/hwpjs.wasm --fixture=/absolute/document.hwpx`는 reader가 반환한 모든 문단에서 기존 prefix 입력 경로 선택을 조사합니다. 문서 전체 문단 번호와 구역 로컬 번호는 기존 `hwpx-paragraph-coordinates`가 소유합니다.

`hwpx-prefix-route-query`는 실제 입력의 `hwpx-prefix-edit-probe.insertPrefix`를 재사용합니다. 조회 함수만 전달하고 세 mutator를 plain/anchored/field 결과를 반환하는 대역으로 바꾸므로 실제 입력·값 변경은 실행하지 않습니다. 경로가 선택돼도 보호 검사·저장·이력·독립 XML 대조가 성공한다고 주장하지 않습니다. 거부는 전부 기록하고 종료코드1로 반환하며 OOM 등을 성공으로 세지 않습니다.

조사 후 저장본/원본 파일의 byte-exact 불변과 지정 WASM의 SHA256 불변을 확인합니다. 결과에는 입력/산출물 hash·경로별 수·모든 거부 위치를 포함합니다. 읽기/소유 경계·원본 조판·객체 payload 편집을 검증하는 명령은 아닙니다.

입력 파일과 WASM의 메모리/파일 불변 판정은 기존 `audit-input-identity`를 재사용합니다. 비교 대상 버퍼 자체가 변조된 경우도 최초 hash와 대조하며 별도의 해시/파일 판정 규칙을 유지하지 않습니다.

## 현재 실측

최신 nested-field-range-boundaries 후보 SHA256 `e64bdcfa3223fbbc2a07febb11bbf452a86c00a521cf5b247151e8a1d76a8711`로 두 issue1891 원본의 전체 문단 query를 재실행했습니다.80168은 plain3745/anchored184/field232·거부3(186~188번),86712는 plain1936/anchored84/field57·거부24(386~398/403~405/1789~1796번)입니다. 남은27개는 모두 unmatched 누름틀의 소유 목록이며 오류는 UnsupportedFieldLabelRange입니다. MissingTextSite와 정상 중첩/줄바꿈 사례의 거부는 없어졌습니다. 두 CLI 모두 exit1이며 성공으로 바꾸지 않습니다. 로그는 후보 폴더의 routes-80168.log/routes-86712.log입니다. 저장/입력/WASM 불변도 확인했지만 모든 선택 경로의 실제 편집 완료는 아닙니다.

prefix edit probe와 read-only route proxy도 [입력 범위의 대상 조회](hwpx-field-range-target.md)를 공유합니다. 새 native query가 있는 경우 그 유일한 소유자만 사용하고 null/예기치 않은 오류에서 기존 목록의 첫 필드로 fallback하지 않습니다. 이전 API의 유일 후보 정책은 유지합니다. 원래 요청0위치를 이동하지 않고, 잘못된/위치가 다른 반환 대상도 거부합니다. 관련 기존/새 route·CLI·identity 집중11/11 exit0이며 실제 mutator 호출 금지·source 오류/OOM 전파·모호한 구형 후보 거부를 포함합니다.

최신 후보의 참조 root 후속 query 조사도 시작했습니다. 현재 이름이 .hwpx인439경로를 수집한 뒤 실제 signature를 확인하며 HWP3 원본은 제외하고 HWPX 변환본은 포함합니다. 이전975개 전체 HWP/HWPX 후보 조사와 입력 목록·산출물 시점이 다릅니다. 로그는 후보 폴더의 reference-prefix-full.log이고 최종 summary 전에는 전수 완료나 최종 거부 수를 주장하지 않습니다. 별도 공개 전체 HWP5/HWPX 테스트도 HWPJS_TEST_WASM을 이 후보로 고정해 실행 중이며 public-full.log에 보관합니다. metadata-text-sites native 전체 실행은 중첩/API 변경 이전 바이너리입니다.

## 전체 참조 HWPX 후속 조사

누락 필드의 구조 범위 계산 실험·반례·현재 미연결 경계는 [끝 마커 없는 필드의 소유 범위](hwpx-unmatched-field-scope.md)가 소유합니다.

`/tmp/hwpjs-reference-prefix-route-current.log`의 별도 읽기 전용 root 조사에서 실제975개 HWP/HWPX 후보를 서명으로 구분했습니다. 역할 후보 SHA256 `50cabdb019974d12a6545d44281cf51cbabb86df5d987e185b41a11b3ccc2c24`의 실제 HWPX436개 중 암호 기본 열기 거부1개·조회435문서/214461문단입니다. HWP5513개는 이 HWPX 단계의 조회 대상이 아니며 실제 HWP326개는 사용자 요청 범위 밖입니다. 이름에 hwp3가 있는 실제 HWPX 변환본은 포함합니다. 기존 단일 fixture 도구의 route helper·좌표/서명·입력 identity를 재사용한 별도 Node orchestration이며 단일 fixture CLI의 root 옵션으로 실행한 것은 아닙니다.

경로 선택은 plain188756·anchored15489·field473,거부9743개입니다.71문서에서 UnsupportedFieldLabelRange4032·MissingTextSite11·InvalidFieldLinks5700이 나왔으며, 후자는 issue1891의80168_regulatory_analysis/86712_regulatory_analysis 원본에 집중됩니다. 성공한 조회 문서마다 저장 원문 byte-exact·입력 파일/메모리·WASM 불변을 확인했습니다. 경로 거부를 성공으로 분류하지 않으며 모든 문단의 실제 입력·저장/이력 또는 전체 파서 의미 검증은 아닙니다.

두 issue1891 원본의 독립 XML/현재 native marker 진단은 각각593/354마커·unmatched begin1/4이며 duplicate/unresolved/non-LIFO/fieldid mismatch는 모두0입니다. `buildKnown`은 정상296/175사본 범위를 반환하고 strict build만 InvalidFieldLinks로 거부합니다. 누락된 CLICK_HERE는 모두 표 셀 subList 안에 있으며80168의186~188번,86712의386~398/403~405/1789~1796번 소유 목록입니다. 현재 `source_field_outside_positions`는 unmatched 시작 이후 같은 section의 모든 source segment를 보호하고 `source_field_analysis.lease`는 unmatched가 하나라도 있으면 strict 조회를 거부합니다. 소유 목록 밖까지 보호하는 정책의 필요성과 안전한 개선 범위는 후속 검증 대상이며 문서 마커를 자동 보정하거나 보호를 제거하지 않았습니다.

`src/field_link_reference_probe.zig`의 standalone native 진단은1/1 exit0이고 각 원본의 저장 byte-exact 불변도 확인했습니다. 첫 진단은 buildKnown도 실패할 것으로 잘못 기대해 성공 반환 배열을 해제하지 못했고 검사 자체의 누수를 냈습니다. 성공 배열을 소유/해제하고 known 성공/strict 실패를 별도로 검사해 교정했으며, 이 초기 실패는 제품 누수나 문서 파손 증거로 계수하지 않습니다. 진단 파일은 정규 root gate와 분리돼 있고 런타임 정책 수정/커밋은 아직 없습니다.

처음 재사용하려던 차트 census에는 전체436 ZIP 경로가 아니라 차트/암호93경로만 있어 시작 전 inventory assertion으로 거부됐습니다. 이를 제품 거부나 참조 root 성공으로 계수하지 않았고 전체 경로 직접 순회/서명 선택으로 다시 조사했습니다. 거부 원문의 직접 자식/field type 분류는 진단용이며 보호된 필드·빈 문단·필드 연결 실패를 같은 미구현으로 묶지 않습니다.

143E433F503322BD33의39/40/41번 원문은 FORMULA editable0이며 prefix query=false·fieldLabels빈 배열·anchorText UnsupportedParagraphControl을 확인했습니다. 세 위치 모두 시작 분할 query=true이므로 prefix 거부를 문단의 모든 구조 편집 불가로 바꾸지 않습니다. reader 결과 문자열 길이를 editor suffix 위치로 사용한 첫 조사는 InvalidTextPosition으로 실패했으며 현재 표시/편집 좌표 동치가 확인된 검사가 아닙니다. 이 세 위치의 실제 구조 편집과 나머지 거부의 root cause는 후속입니다.

## 단일 대형 fixture 조사

역할 후보 `50cabdb0…`의 실제 행정업무 편람 specialized 전수(`/tmp/hwpjs-large-specialized-role-current.log`)가 exit0으로 종료했습니다.522시도 모두522편집/독립 XML/이력·재열기 확인,그중 필드7개,refused빈 객체입니다. 아래 실행 중 기록은 당시 상태이며 일반9887경로의 실제 전수 입력·후속 필드 정책 후보나 모든 명령 완료로 합산하지 않습니다.

후보 SHA256 `50cabdb019974d12a6545d44281cf51cbabb86df5d987e185b41a11b3ccc2c24`, `reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx` SHA256 `c6dd7e847a99f219681afc5a29c80a9665c04df9cda4d820a3350d739664fdf6`에서 exit0입니다. `/tmp/hwpjs-large-prefix-route-inventory.log`의10409문단은 plain9887·anchored515·field7이고 refused 배열은 비어 있습니다. 저장본/입력 파일/산출물 불변 검사도 통과했습니다.

같은 후보의 이전20거부 위치 집중 편집 검사는1/1 exit0(234063.131667ms)이며 실제 입력·독립 전체 XML normal/-O·잘못된 기대값 거부·저장/재열기·undo/redo를 확인했습니다.20개 실제 편집 성공과10409개 읽기 전용 경로 선택은 별도 범위입니다. 현재 전용 prefix 전수 편집 감사(`/tmp/hwpjs-large-specialized-role-current.log`)는 실행 중이며 파일 전체 성공으로 합산하지 않습니다.

`node --test tests/hwpx/prefix-route-query.test.mjs tests/hwpx/prefix-edit-probe.test.mjs`는6/6 exit0입니다. 일반/필드 외부/앵커/유일 필드 선택, 실제 mutator 호출 금지, ABI 부재 fallback, 애매한 후보 거부와 예기치 않은 오류 전파를 검사했습니다.

`prefix-route-inventory.test.mjs`·`audit-input-identity.test.mjs`를 더한 실행은9/9 exit0입니다. CLI의 누락/빈 인수·중복 scope·허용하지 않은 history 옵션을 파일 읽기 전에 거부하고, 실제 linespacing26문단 전수 plain/빈 refused와 정확한 입력/산출물 hash·파일 불변을 확인했습니다. 공통 identity 검사는 메모리 변조·파일 변조·누락 파일을 각각 거부했습니다.
