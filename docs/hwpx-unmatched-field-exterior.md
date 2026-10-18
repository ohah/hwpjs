# 끝 없는 필드와 확정된 바깥 텍스트

현재 작업 트리의 단계적 지원 계약입니다. 전체 미해결 필드 편집 완료가 아니며 runtime은 최종 전체 검증 전입니다. 원본 사례·이전 실패는 [참조 읽기 감사](reference-reader-release-audit.md)를 따릅니다.

2026-10-11 최신 후보 `hwp5-explicit-general6/bin/hwpjs.wasm` SHA256 `06d4dbc1dab40d687a7a95e705b6b080bfecd742da353dc2d14f256893282260`에서 공개 바깥 편집 두 사례·실제 Worker 두 사례·수동 수식 Worker 세 사례를 함께 재검사했습니다. 7/7·exit0·skip0(73391.338792ms)이며 수동 수식 경계는 [해당 계약](hwpx-formula-result-override.md)이 소유합니다. 실제80168/86712의 앞쪽 문단 입력은 전체 XML/비대상 ZIP의 독립 Python 양 모드 대조, undo/redo·저장본 재열기·입력 메모리/디스크 불변을 확인했습니다. Worker 흐름 시간은 각각53918.674416/19313.6315ms이며 단일 입력 지연이 아닙니다. Canvas/DOM은 테스트 대역이므로 실제 브라우저나 조판 증거로 사용하지 않습니다. 최신 전체 native 검증·참조 편집 감사는 별도로 실행 중이고 runtime 커밋/기본 WASM 승격 및 미해결 시작 뒤 지원은 아직 남습니다.

## 단일 소유와 실패 경계

공통 marker linker의 Report가 시작/끝 연결 및 미해결 진단을 소유합니다. `field_text_ranges.build`의 strict 계약은 유지합니다. 새 `buildKnown`은 확정된 reciprocal link만 조립하고 끝 없는 begin을 원문 Report에 남깁니다. 중복 begin·해결 못한 end·non-LIFO·fieldid 불일치는 계속 거부하며, 실제 미해결 begin 수와 Report 집계가 다르면 거부합니다. 끝 마커를 합성하거나 미해결 필드의 의미적 끝을 추정하지 않습니다.

`source_field_analysis.buildForEditor`는 원본 마커·미해결 진단·확정된 링크를 한 번 소유합니다. Session open의 원본 분석에만 사용하고 현재 편집값이나 추정한 끝 위치를 저장하지 않습니다. 두 lease는 같은 source binding 검사기를 사용합니다. 일반 strict lease는 미해결 begin이 남으면 계속 InvalidFieldLinks를 반환하며, `leaseForExterior`는 원본 분석을 빌려 미해결 시작을 별도로 보호합니다. 캐시가 없는 경로는 일시적인 known-only 분석을 만들고 해제합니다. query가 cache나 텍스트 모델을 수정하지 않습니다. 아래 최초 단계의 임시 분석만 쓰던 기록은 이 후속 계약 전의 이력입니다.

원문 마커 뒤 텍스트는 필드 바깥임을 아직 증명하지 못하므로 `field_source_outside_positions`에서 ProtectedFieldRange로 보호합니다. 이는 끝을 정한 synthetic range가 아니라 미해결 시작의 불확실성 검사입니다. 확정된 앞쪽 문단의 일반 입력/저장은 허용하고 기존 linked field 보호와 공통 좌표/문자 경계 검사를 유지합니다. 미해결 마커 뒤의 안전한 범위를 더 세분화하는 정책·필드 본문 수정·구조 편집·서식/label/UI 진단은 여전히 구현 대상입니다. 이 임시 보호 범위를 최종 목표로 고정하지 않습니다.

## 실제 검증

### 일반 prefix 감사의 독립 거부 근거

고정44파일 감사의80168/86712는 일반 감사에서 `protected prefix without source field at zero`로 종료했습니다. 실제80168의187,86712의387을 재조회하면 canEdit/outside=false·라벨0개·splice=ProtectedFieldRange이며, 기존 독립 XML 소유 조사상 미해결 시작의 가장 가까운 subList 안에 있습니다. 라벨/FORMULA만 확인하던 감사의 근거 누락으로, 제품 보호를 해제하거나 미해결 끝을 합성하지 않습니다.

`tools/hwpx-unmatched-prefix-witness.py`는 기존 소유 진단과 UINT32 ID 비교를 재사용합니다. 미해결 시작부터 가장 가까운 목록 끝(루트 시작은 구역 끝)까지의 구조 범위 안에 직접 소유한 text/빈 run 사이트가 있는 문단만 보고합니다. 중첩 표·주석의 text를 바깥 문단의 근거로 쓰지 않습니다. 이는 현재 보수적 보호의 원문 근거이며 필드 의미적 종료·편집 허가가 아닙니다. 모호한 연결/중복 숫자 ID·외래 root·중복 ZIP·과대 section/DTD는 거부합니다. 일반 감사는 이 근거를 마지막 대조로 사용하되 accepted를 증가시키지 않고 거부 후 원문/이력 검사를 유지합니다.

게시3f7256e3에 이 감사 변경만 적용한 `/tmp/hwpjs-unmatched-witness-all.27Bjay`에서 Node24.20.0·명시적 f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77 후보로3/3·fail/cancel/skip0·exit0(8189ms)을 확인했습니다. 독립 witness normal/-O와 실제 CLI 여섯 범위를 검사합니다.80168의186–188과86712의386–398/403–405/1789–1796 총27문단은 ProtectedFieldRange로 분류하고 accepted/restored0입니다. 두 파일의 문단2는 각각 입력/undo 복원1·거부0입니다. 모든 범위는 completeFixture=false이며 전체6,265문단 완료로 해석하지 않습니다. 원래 고정 감사의 실패 기록·제품 native 코어·기본 WASM/외부 데모는 바꾸지 않았습니다.

### 미해결 필드의 목록 소유 조사

`tools/hwpx-unmatched-field-scope.py`는 제품 파서와 독립적인 XML 조상 순회로 가장 가까운 `hp:subList`와 그 안의 문단을 보고합니다. 마커 끝이나 편집 권한을 추론하지 않습니다. 실제80168의 미해결1개는 XML 문단186–188의 목록, 86712의 미해결4개는 각각386–398(2개),403–405,1789–1796의 목록에 속합니다. 이 좌표는 독립 XML 순서이며 public API 좌표로 그대로 쓰지 않습니다. 구역 전체 suffix 보호를 목록 단위로 좁힐 후보 근거지만 목록 밖 필드 종료 의미를 증명하지 않으므로 아직 제품 보호 정책을 변경하지 않았습니다.

진단의6개 회귀는 가장 가까운 중첩 목록, 명시적 다문단 종료, 모호한/앞선/없는 참조, 잘못된 namespace, 구역 소유/중복 종료 및 실제 두 파일을 검사합니다. 일반 Python과 `-O` 각각6/6·exit0·skip0입니다. 이 도구는 non-LIFO/fieldid 의미 검증이나 완전한 ZIP/문서 검증기가 아니며 native linker를 대체하지 않습니다.

후속 적대적 검증에서 진단 도구가 `0001`과 `1`을 문자열로 구별하는 반례를 재현했습니다(7검사 중1실패). 비교 키는 독립 UINT32 숫자값으로 수정하고 출력 원문 ID는 그대로 유지했습니다. 부호/ASCII 공백/음수0/UINT32 최대값/범위 초과/비ASCII 숫자/긴0 표기를 추가한 최종8검사는 일반 Python·`-O` 각각8/8·exit0·skip0입니다. 제품 linker는 이미 숫자값으로 비교하며 이번 수정은 진단 도구에만 적용됩니다.

고정 버전 한컴 [시작 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/fieldBegin.cpp)·[끝 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/fieldEnd.cpp)을 다시 확인했습니다. 명시적 ID 속성은 확인되지만 목록 끝이 누락 필드의 의미적 종료를 대신한다는 규칙은 이 코드에서 확인하지 못했습니다. RHWP의 목록 단위 orphan 종료 연결 코드 역시 이 두 문서의 목록 밖 편집 무손실 증명은 아닙니다. 현재 보호 정책은 유지하며 더 강한 의미/왕복 증거를 확보해야 합니다.

같은 후속 후보3d77c874의 Canvas controller→실제 Worker/WASM 회귀도 저장본 재열기와 호출자/디스크 원본 불변 검사를 추가한 뒤 2/2·exit0·skip0(54011.126375ms)였습니다. 파일별36120.663083/17753.357125ms는 입력·독립 XML/ZIP 양 Python 모드·undo/redo·재열기를 포함합니다. DOM과 Canvas는 테스트 대역이므로 실제 브라우저 E2E나 레이아웃 일치로 해석하지 않습니다. 이미 커밋된 권한 guard/수동 결과 UI의 기본 artifact 회귀7/7·exit0·skip0(551.17425ms)도 별도 통과했으며 후보 회귀와 합쳐 전체 편집 지원 수로 계산하지 않습니다.

2026-10-11 후속 후보 `full-gate-current/bin/hwpjs.wasm` SHA256 `3d77c87433cee8ee8256722756c23c06056b693a9ebb82af2388d6dc054e7252`로 공개 바깥 편집 회귀를 다시 실행했습니다. `tests/hwpx/unmatched-field-exterior-editor.test.mjs`의 실제80168/86712 두 문서는 2/2·exit0·skip0(5426.40325ms)였습니다. 전체 XML·비대상 ZIP payload의 양 Python 모드 대조, 잘못된 기대 문자열의 거부, undo/redo·보호 거부 뒤 이력 유지·재열기·원본 메모리/디스크 불변을 포함합니다. 이 결과는 후보의 두 앞쪽 문단에 대한 검증이며 기본 제품/전체 문단 편집/실제 브라우저/전체 native gate 완료를 증명하지 않습니다. runtime과 회귀 파일의 커밋은 전체 native 검증 후 진행합니다.

전체 gate 실행 경계: 원본 분석 소유 수정 전 소스로 시작한 ReleaseSafe 전체 native 실행은 소스가 바뀌어 최종 gate로 사용할 수 없으므로, 명령/cwd/부모·자식 PID를 확인한 소유 프로세스만 종료했습니다(exit143, 명시 취소). timeout이나 제품 실패/통과로 계수하지 않습니다. 최신 소스로 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`을 새로 실행했고 최종 결과는 아직 없습니다. 다른 저장소/사용자 프로세스는 종료하지 않았습니다.

원본 분석 소유 후속: 최초 private helper 이름 cached가 기존 테스트의 local constant를 가려 native/WASM 컴파일이 실패했습니다. cachedLease로 구분한 뒤 ReleaseSafe build6/6·exit0(57초), 후보 `unmatched-field-source-cache/bin/hwpjs.wasm` SHA256 `fd6fe25c63625c6661938aa7cb7893f9088d762e224aebc4fda4a92c88247879`를 확인했습니다. 최종 native13/13·exit0는 cold 분석의 전체 할당 실패, partial source를 소유하는 open의 전체 할당 실패/해제, fail_index0에서도 빌린 lease가 추가 할당을 하지 않음, strict 거부 유지 및 partial cache의 원본 binding 변경 거부를 포함합니다. 이후 추가 binding 반례는 test-only이며 runtime 변경이 아닙니다. fmt/diff check가 통과했습니다.

같은 후보의 공개 원문/바깥 편집/Worker·guard9/9·exit0·skip0(108512.901084ms)을 확인했습니다. 이전 실제 Worker 전체 흐름295769/132247ms에 대해 이번 묶음의 흐름은74013/34244ms였습니다. 파일별 source/cache와 실행 묶음이 다르고 시스템 부하를 고정한 벤치마크는 아니므로 관측 시간을 성능 보장으로 해석하지 않습니다.

실제 Canvas controller→Worker→WASM 회귀에 저장본의 전체 XML/비대상 payload oracle 양 Python 모드를 추가한 최종2/2·exit0·skip0(117030.930958ms)도 통과했습니다. 파일별 흐름84306.387166/32507.964209ms는 load/enable/입력/저장/독립 검사/undo/redo를 포함합니다. 이전 단계의 Worker 저장은 독립 XML 미검증이었으므로 아래 과거 기록을 이 강화된 검사로 소급하지 않습니다. 실제 브라우저·모든 미해결 필드/구조 편집·대형 문서 즉각 반응성 및 최신 전체 native gate는 남습니다. runtime 및 해당 공개 회귀 파일은 미커밋입니다.

Worker 조회의 실패 캐시 후속: 기존 request-local guard가 구역 전체에서 InvalidFieldLinks를 한 번 기억하면 native의 일반 텍스트 허용까지 호출하지 않았습니다. 실제80168의 문단6은 native에서 허용되지만 Worker plainEditable=false인 반례를 재현했습니다(1실패·exit1, 7988.010417ms). 라벨 실패 뒤 다른 조회를 성공시켜야 하는 제어기 반례도 실패했습니다. 실패 캐시는 구역과 조회 종류(plain/anchor/labels)로 분리했고, 원문 링크 진단은 유지하되 편집 가능 문단에 fieldReadOnlyReason을 붙이지 않습니다. false 권한 값 자체는 구역 실패로 캐시하지 않고 OOM 등 다른 오류도 계속 전파합니다.

최종 기본 제품 Worker/guard3/3·exit0·skip0(771.59425ms), 후보2271의 Worker/guard 및 두 실제 문서5/5·exit0·skip0(428241.562ms)을 확인했습니다. 두 실제 사례는 가상 DOM의 Canvas controller→실제 Worker/WASM으로 일반 문단 선택·beforeinput/값 변경/input→저장·undo 원문/redo 수정본 바이트를 검사합니다. 실제 브라우저 E2E나 이 Worker 저장본의 독립 XML 검사로 계수하지 않습니다. 독립 XML/비대상 payload 보존은 앞선 별도 native 공개 회귀가 소유합니다. 최초 큐 검사 실패는 beforeinput 뒤 실제 값 변경/input 이벤트를 생략한 harness 오류였으며 교정했습니다. 이후 확인한 문단6의 권한 오류와 구분합니다.

최종 실제 Worker 사례의 흐름 시간은80168에서295769.19875ms, 86712에서132247.403875ms입니다. 이는 load/enable/입력/여러 저장/undo/redo를 포함한 전체 흐름이며 단일 입력 지연으로 보고하지 않습니다. 반복 exterior 분석 비용을 줄이는 immutable source 진단/known-link 캐시가 다음 성능 검증 대상입니다. 이 통과를 대형 문서 반응성 완료로 승격하지 않습니다. 기존 strict source/필드 의미 계약과 미해결 마커 뒤 보호는 유지합니다.

ReleaseSafe build6/6·exit0(1분), 후보 `unmatched-field-exterior/bin/hwpjs.wasm` SHA256 `2271d0728f3559428cd6d9125073e6fa325341bd98a951449fa8910e8a406382`입니다. 이후 추가된 native 선언은 test-only이며 runtime 변경은 없습니다.

native 최종 집중13/13·exit0(root1+실제12선언)은 strict 거부 유지·known pair 보존·진단 집계 위조/중복 거부·앞쪽 허용/뒤쪽 보호·일시 분석과 query의 전체 할당 실패·source cache 불변·Unicode 저장/재열기·기존 field exterior 및 생성 표 회귀를 포함합니다. 앞선12통과와 합산하지 않습니다. fmt/diff check도 통과했습니다.

실제 issue1891의80168/86712 두 파일에서 첫20개 문단을 조회해 예기치 않은 InvalidFieldLinks 없이 앞쪽 편집 가능 목록을 확인했고 문단2 prefix 입력→저장→재열기 저장 바이트 일치를 확인했습니다. [공개 편집 회귀](../tests/hwpx/unmatched-field-exterior-editor.test.mjs)는 문단2의 전체 XML·비대상 ZIP payload를 기존 독립 oracle 양 Python 모드로 대조합니다. 잘못된 기대 텍스트의 전체 XML mismatch만 음성 통과로 인정합니다. undo 원문 복원·뒤쪽 입력 보호 거부/원문 보존·거부 뒤 redo 수정본 복원·재열기·입력 메모리/디스크 사본 불변도 확인했습니다. fixture가 없는 checkout에서는 명시적 skip입니다.

같은 후보의 공개 수동 결과13검사와 두 원문/두 바깥 편집 검사를 함께 실행한17/17·exit0·skip0(12430.178708ms)이 통과했습니다. source byte 보존만 확인한 이전 회귀를 편집 성공으로 소급하지 않습니다. 전체 두 문서의 모든 문단·필드 명령/구조/UI 및 최신 전체 native gate는 완료되지 않았습니다. 기본 WASM/외부 데모는 교체하지 않았습니다.
