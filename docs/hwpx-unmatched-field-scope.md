# 끝 마커가 없는 필드의 구조적 소유 범위

현재 두 규제분석 원본의 누락 누름틀이 표 셀의 subList 안에 있는데, 외부 입력 보호는 시작 이후 구역 전체에 영향을 줍니다. 관련 거부/원문 진단은 [입력 경로 조사](hwpx-prefix-route-inventory.md)가 소유합니다.

## 현재 구현 경계

`field_source_scope.zig`는 원본 fieldBegin에서 가장 가까운 정확한 paragraph namespace의 subList를 찾고 source 시작~목록 끝의 Envelope를 반환합니다. 없으면 section 루트 끝을 사용합니다. XML namespace는 document_xml의 기존 상수를 재사용하며 parent 순환/범위 밖 인덱스·소스 바이트를 벗어나는 경계를 거부합니다.

Envelope 자체는 구조 범위 계산일 뿐이며 끝 마커를 만들거나 링크 진단을 바꾸지 않습니다. 후속 로컬 검증 구현에서 field_source_outside_positions의 unmatched 보호를 이 Envelope에 연결했습니다. strict lease와 정상 명시적 링크는 그대로입니다. 셀 목록 안의 이후 내용은 계속 보호하고 루트 시작은 계속 section 끝까지 보호합니다. 이 연결은 아직 제품/코드 커밋에 반영하지 않았습니다.

## 검증

`zig test src/field_scope_regression_test.zig -O ReleaseSafe`는4/4 exit0이며 소유 범위 두 검사와 기존 XML/namespace 두 검사를 포함합니다. 같은 목록의 후속 문단 포함, 형제 셀/바깥 문단 제외, 중첩 목록의 가장 가까운 소유자, foreign subList 무시, end 경계 제외, 잘못된 노드/부모 순환/범위 밖 parent/owner end를 검사했습니다. 수정 파일의 fmt·diff 공백도 통과했습니다.

현재 native 실제 원본 진단1/1 exit0에서 누락 필드5개 모두 셀 소유 범위를 반환하고 원본 저장 byte-exact를 유지했습니다. 독립 XML에서는 두 문서의 정상296/175쌍이 모두 같은 subList 또는 루트 소유자 안에 있었습니다. 이 관측만으로 모든 HWPX 필드의 의미 규칙을 확정하지 않습니다.

## 후속 검증

### 잔여35개 분류와 보존형 인라인 입력

쪽번호 전용 두 문단의 후속 수정과 검증은 [메타데이터 전용 run 입력](hwpx-metadata-only-run-input.md)이 소유합니다. 아래35개 분류는 field-scope-labels 후보의 당시 관측이며 후속 수정의 전수 재감사 결과가 아닙니다.

field-scope-labels 후보의 잔여35개를 원문과 다시 대조했습니다.27개는 끝 마커가 없는 누름틀의 소유 목록 안으로 계속 보호합니다. 두 문서의5번은 pageNum만 있고 텍스트 사이트가 없어 MissingTextSite입니다.80168의3807번과86712의1261번은 닫힌 중첩 누름틀이며 현재 중첩 라벨 정책에서 거부합니다. 나머지80168의324/330/331/2395번은 순차 하이퍼링크이며 라벨 조회는 각각7/4/4/3개로 성공합니다. 첫 라벨 시작은4/23/23/36으로 모두0보다 큽니다. 따라서 이 네 건은 중첩이나0위치 라벨 선택의 모호함이 아닙니다.

원인은 field_source_outside_positions가 문단 전체의 모든 비텍스트 segment를 거부하여, 입력 범위와 무관한 lineBreak 때문에 바깥 입력까지 막은 것입니다. 로컬 수정은 공통 paragraph_text_positions.validateInlineUnit을 사용해 보존형 인라인만 허용합니다. 기존 공통 validateRange는 인라인 삭제를 계속 거부하고 field_outside_range는 필드 경계·내용 침범을 계속 거부합니다. anchor는 이 경로에서 허용하지 않습니다.

새 합성 회귀는 수정 전 query에서1/1 실패를 재현하고 수정 후1/1 통과했습니다. 줄바꿈을 보존한 입력·줄바꿈 삭제 거부·필드 경계 입력 거부·거부 후 저장 불변·재열기/재저장을 검사합니다. 첫 공개 테스트 실행은 endUnit 인수에0을 전달한 검사 코드 오류로 InvalidTextPosition이 났고, 올바른 동일 start/end 경계로 교정한 재실행만 성공 근거입니다.

field-inline-exterior 후보 SHA256 `1836851a3cc4516eb1f2020d06f0c4be5a79a5e648bd14c8cfa270e7d7b1e7ed`는 ReleaseSafe build6/6 exit0입니다. `HWPJS_TEST_WASM=/absolute/field-inline-exterior/bin/hwpjs.wasm node --test tests/hwpx/field-exterior-inline-reference.test.mjs`는1/1 exit0으로 실제 네 문단 각각의 prefix 입력·normal/-O 독립 전체 XML/비대상 ZIP·잘못된 기대값 거부·라벨 경계 보호·undo 원문 byte-exact/redo 수정본·재열기/재저장·원본 파일 불변을 확인했습니다. 네 건 실제 편집이며 두 문서 전수 재감사나 전체 최신 native/public·Worker/Canvas 검증으로 해석하지 않습니다. 코어 수정과 회귀 파일은 아직 로컬이며 제품 승격도 하지 않았습니다.

라벨 정책 의존 회귀(`/tmp/hwpjs-field-scope-label-native-regression.log`)는493/493 exit0으로 완료했습니다. 최신 scoped 독립 검사기로 실제220/435번도 normal/-O 전체 XML/ZIP·잘못된 기대값 거부·undo 원문 byte-exact·redo 수정본·재열기/재저장·원본 파일 불변을 확인했습니다(`/tmp/hwpjs-field-scope-label-actual-edits.log`). 이전 strict oracle 실패는 그대로 이력이며 이 결과는 두 라벨 실제 편집만 검증합니다. 최신 전체 source gate·모든 새 경로의 실제 편집·Worker/Canvas는 별도입니다.

`hwpx-scoped-field-edit-oracle.py`는 기존 엄격 oracle 파일을 수정하지 않고 원래 전체 XML/ZIP compare를 재사용합니다. 선택 단계만 명시적 대상의 유일한 forward end와 목록 소유의 비대상 orphan을 구분하며, 원본/예상/저장 전체 XML은 제거/보정하지 않습니다. 겹침·루트 orphan·누락/중복 대상·비대상 end 참조/fieldid 불일치와 실제 원문 변경을 거부합니다. normal/-O self-test는 정상 대상·기존 strict 실패 유지 및8개 변조/보호 반례를 확인했고 Git HEAD의 엄격 oracle 의존성으로도 동일 self-test가 통과했습니다. 기존 파일의 선행 작업 변경은 커밋에 섞지 않습니다.

잔여 거부의 실제 닫힌 CLICK_HERE220/435번도 unrelated orphan 때문에 InvalidFieldLinks로 조회가 막히는 것을 확인했습니다. 로컬 후속 구현은 source_field_analysis.leaseForLabels를 getter/입력이 공유하고 source 상태의 목록 소유 누락만 허용합니다. 루트 누락·구조 모델은 strict를 유지하며 validateLinked가 후보 내용과 누락 Envelope의 겹침을 거부합니다. 목록 조회는 모든 begin 대신 검증된 known ranges를 순회해 orphan을 편집 대상으로 만들지 않습니다. 닫힌 다른 목록의 라벨 조회/입력/저장/이력·같은 누락 목록 안의 닫힌 라벨 거부·루트/기존 malformed 거부 집중3/3 exit0입니다.

외부 입력 정책의 앞선 의존 회귀492/492는 exit0으로 완료했지만 새 라벨 정책 이전 snapshot입니다. 새 후보 field-scope-labels SHA256 `86e0d0a98722c850a8a3d71140c62fb1cb9aa1038d6a51dab07b7604e0a18a99`는 ReleaseSafe build6/6 exit0이고 후속 전체 의존 회귀는 실행 중입니다. query-only 결과는80168 plain3740/anchored184/field231·거부9,86712 plain1935/anchored84/field56·거부26입니다. MissingTextSite각1·나머지 UnsupportedFieldLabelRange이며 InvalidFieldLinks는0입니다. 두 도구는 여전히 exit1이고35개를 성공으로 세지 않습니다.

실제 라벨 저장 독립 검사는 첫 assay의 native snake_case/JS camelCase 혼동으로 InvalidInteger가 났고, 교정한 assay는 setter 실행 후 기존 엄격 oracle가 원본 비대상 orphan에서 Ambiguous field end로 중단됐습니다. 이 실패를 XML 저장 성공이나 native 파손으로 재분류하지 않았습니다. 엄격 oracle는 변경하지 않았으며 대상의 유일한 연결·비대상 누락 마커의 원문 유지·전체 XML/ZIP을 검증할 후속 검사가 필요합니다.

연결 전 합성 Session은 before=true/inside=false/continuation=false/sibling=false/after=false로 실패를 재현했습니다. 연결 후 sibling/after만true가 됐고 나머지 보호는 그대로입니다. 두 Session 집중 검사 각각1/1 exit0은 형제 셀/바깥 본문 입력·저장·두 번 undo 원문/redo 수정본 복원·목록 안 거부 후 저장 불변 및 루트 누락의 후속 목록/본문 보호를 확인했습니다. 정규 root에도 새 Session 검사를 등록했지만 이전 실행 중 전체 gate의 바이너리에는 이 정책 변경이 포함되지 않습니다. 별도492개 의존 회귀는 실행 중이며 아직 최종 결과가 없습니다.

새 field-scope-exterior 후보 SHA256 `30ec69f9d2c7b85af43106f92e5c4fc1edd54a29715ed4c6a9717656e229a154`는 ReleaseSafe build6/6 exit0입니다. 실제 두 원본 query-only 재검사에서80168은 plain3740/anchored184·거부240,86712는 plain1935/anchored84·거부82입니다. 기존 거부3982+1719=5701에서322로 줄었지만 두 도구는 여전히 exit1이며 전체 성공으로 바꾸지 않습니다. strict 필드 조회/편집과 빈 사이트의 잔여 원인은 추가 작업입니다.

원래 거부 위치 중 새로 canEdit가 허용된 실제189/399번을 각각 prefix 입력했습니다. 독립 전체 XML/ZIP normal/-O·잘못된 기대값 거부·undo 원문 byte-exact·redo 수정본·재열기/재저장·원본 파일 불변이 모두 확인됐습니다(`/tmp/hwpjs-field-scope-actual-edits.log`). 이는 두 문단 실제 편집이지 새5379경로 모두의 실제 편집 완료가 아닙니다. 원문 연결 마커를 보정하거나 누락 내용을 편집하지 않았습니다.

목록을 가로지르는 명시적 링크·교차 소유/중첩 필드·다문단 구조 편집·전체 할당 실패·최신 전체 native/public·실제 Worker/Canvas를 추가 검토해야 합니다. 기존 역할 후보 전체 실행을 이 이후 정책 변경의 전체 gate로 소급하지 않으며 코드 커밋/제품 반영도 보류했습니다.
