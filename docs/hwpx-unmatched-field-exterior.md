# 끝 없는 필드와 확정된 바깥 텍스트

현재 작업 트리의 단계적 지원 계약입니다. 전체 미해결 필드 편집 완료가 아니며 runtime은 최종 전체 검증 전입니다. 원본 사례·이전 실패는 [참조 읽기 감사](reference-reader-release-audit.md)를 따릅니다.

## 단일 소유와 실패 경계

공통 marker linker의 Report가 시작/끝 연결 및 미해결 진단을 소유합니다. `field_text_ranges.build`의 strict 계약은 유지합니다. 새 `buildKnown`은 확정된 reciprocal link만 조립하고 끝 없는 begin을 원문 Report에 남깁니다. 중복 begin·해결 못한 end·non-LIFO·fieldid 불일치는 계속 거부하며, 실제 미해결 begin 수와 Report 집계가 다르면 거부합니다. 끝 마커를 합성하거나 미해결 필드의 의미적 끝을 추정하지 않습니다.

`source_field_analysis.leaseForExterior`는 strict cache가 있으면 기존 lease의 source binding 검사를 재사용합니다. 없는 경우에만 일시적인 known-only 분석을 만들고 해제합니다. 이를 live cache에 게시하지 않으며 일반 필드 API의 strict lease를 대체하지 않습니다. 해당 query가 캐시나 텍스트 모델을 수정하지 않습니다.

원문 마커 뒤 텍스트는 필드 바깥임을 아직 증명하지 못하므로 `field_source_outside_positions`에서 ProtectedFieldRange로 보호합니다. 이는 끝을 정한 synthetic range가 아니라 미해결 시작의 불확실성 검사입니다. 확정된 앞쪽 문단의 일반 입력/저장은 허용하고 기존 linked field 보호와 공통 좌표/문자 경계 검사를 유지합니다. 미해결 마커 뒤의 안전한 범위를 더 세분화하는 정책·필드 본문 수정·구조 편집·서식/label/UI 진단은 여전히 구현 대상입니다. 이 임시 보호 범위를 최종 목표로 고정하지 않습니다.

## 실제 검증

Worker 조회의 실패 캐시 후속: 기존 request-local guard가 구역 전체에서 InvalidFieldLinks를 한 번 기억하면 native의 일반 텍스트 허용까지 호출하지 않았습니다. 실제80168의 문단6은 native에서 허용되지만 Worker plainEditable=false인 반례를 재현했습니다(1실패·exit1, 7988.010417ms). 라벨 실패 뒤 다른 조회를 성공시켜야 하는 제어기 반례도 실패했습니다. 실패 캐시는 구역과 조회 종류(plain/anchor/labels)로 분리했고, 원문 링크 진단은 유지하되 편집 가능 문단에 fieldReadOnlyReason을 붙이지 않습니다. false 권한 값 자체는 구역 실패로 캐시하지 않고 OOM 등 다른 오류도 계속 전파합니다.

최종 기본 제품 Worker/guard3/3·exit0·skip0(771.59425ms), 후보2271의 Worker/guard 및 두 실제 문서5/5·exit0·skip0(428241.562ms)을 확인했습니다. 두 실제 사례는 가상 DOM의 Canvas controller→실제 Worker/WASM으로 일반 문단 선택·beforeinput/값 변경/input→저장·undo 원문/redo 수정본 바이트를 검사합니다. 실제 브라우저 E2E나 이 Worker 저장본의 독립 XML 검사로 계수하지 않습니다. 독립 XML/비대상 payload 보존은 앞선 별도 native 공개 회귀가 소유합니다. 최초 큐 검사 실패는 beforeinput 뒤 실제 값 변경/input 이벤트를 생략한 harness 오류였으며 교정했습니다. 이후 확인한 문단6의 권한 오류와 구분합니다.

최종 실제 Worker 사례의 흐름 시간은80168에서295769.19875ms, 86712에서132247.403875ms입니다. 이는 load/enable/입력/여러 저장/undo/redo를 포함한 전체 흐름이며 단일 입력 지연으로 보고하지 않습니다. 반복 exterior 분석 비용을 줄이는 immutable source 진단/known-link 캐시가 다음 성능 검증 대상입니다. 이 통과를 대형 문서 반응성 완료로 승격하지 않습니다. 기존 strict source/필드 의미 계약과 미해결 마커 뒤 보호는 유지합니다.

ReleaseSafe build6/6·exit0(1분), 후보 `unmatched-field-exterior/bin/hwpjs.wasm` SHA256 `2271d0728f3559428cd6d9125073e6fa325341bd98a951449fa8910e8a406382`입니다. 이후 추가된 native 선언은 test-only이며 runtime 변경은 없습니다.

native 최종 집중13/13·exit0(root1+실제12선언)은 strict 거부 유지·known pair 보존·진단 집계 위조/중복 거부·앞쪽 허용/뒤쪽 보호·일시 분석과 query의 전체 할당 실패·source cache 불변·Unicode 저장/재열기·기존 field exterior 및 생성 표 회귀를 포함합니다. 앞선12통과와 합산하지 않습니다. fmt/diff check도 통과했습니다.

실제 issue1891의80168/86712 두 파일에서 첫20개 문단을 조회해 예기치 않은 InvalidFieldLinks 없이 앞쪽 편집 가능 목록을 확인했고 문단2 prefix 입력→저장→재열기 저장 바이트 일치를 확인했습니다. [공개 편집 회귀](../tests/hwpx/unmatched-field-exterior-editor.test.mjs)는 문단2의 전체 XML·비대상 ZIP payload를 기존 독립 oracle 양 Python 모드로 대조합니다. 잘못된 기대 텍스트의 전체 XML mismatch만 음성 통과로 인정합니다. undo 원문 복원·뒤쪽 입력 보호 거부/원문 보존·거부 뒤 redo 수정본 복원·재열기·입력 메모리/디스크 사본 불변도 확인했습니다. fixture가 없는 checkout에서는 명시적 skip입니다.

같은 후보의 공개 수동 결과13검사와 두 원문/두 바깥 편집 검사를 함께 실행한17/17·exit0·skip0(12430.178708ms)이 통과했습니다. source byte 보존만 확인한 이전 회귀를 편집 성공으로 소급하지 않습니다. 전체 두 문서의 모든 문단·필드 명령/구조/UI 및 최신 전체 native gate는 완료되지 않았습니다. 기본 WASM/외부 데모는 교체하지 않았습니다.
