# 추적 HWPX 문단 입력·이력 검증

## 2026-10-15 수식 복구 후보

후보 WASM `5caf33a6e133da14621537288036076a36525c732a5716ef4b1a6d0cf5a1c944`로 기존 `tools/hwpx-edit-corpus-audit.mjs`의 Git 추적 전체46파일·모든 문단 prefix·history 경로를 실행했습니다. 임시 IPC wrapper `/tmp/hwpjs-note-geometry-publication.Wkoeip/tracked-edit-guard-worker.mjs`는 기존 JSON 출력의 전달/최종 집계 확인만 담당하고 편집·선택·검증 동작을 바꾸지 않습니다. 기존 공통 guardedNodeWorker로 RSS 관측1024MiB/시간120초 한도를 적용했습니다. 완료 결과는 result1개+실제 정상 exit0·signal없음·stderr/stdout0바이트이며 관측 peak399,589,376바이트입니다. OS 하드 상한 검사는 아닙니다.

암호화1파일은 명시적으로 거부했고 열린45파일 전체1,444문단을 검사했습니다. 일반 경로의 prefix 입력1,231건은 저장 reader projection·undo 원문 bytes·redo 편집 bytes·재취소와 revision 검사를 통과했습니다. 거부된 명령 뒤 기존 redo 보존도189회 확인했습니다. 입력 버퍼 identity도 검사했습니다. 이 plain 경로 자체는 독립 XML/ZIP oracle 또는 실제 브라우저 검사가 아닙니다.

거부는 UnsupportedParagraphControl146건, InvalidFormulaNumber48건, ProtectedFieldRange19건입니다. 숫자 셀의 의도적 비숫자 prefix 거부48건과 결과 내부 보호를 일반 편집 미구현과 구분해야 합니다. 다른 전용 경로의 현재 후보 검증 없이146/19건을 지원 성공으로 합산하지 않습니다. 각 파일의 일부 문단만 선택한 smoke 검사가 아니라 이 추적 inventory의 모든 문단 시도이며, 전체 RHWP 참조436파일 편집·모든 위치/명령·Canvas/IME·원본 조판 동치를 입증하지 않습니다.

최초 wrapper는 원래 start 출력의 kind가 IPC progress 종류를 덮어 InvalidWorkerMessage로 중단됐습니다. IPC 종류와 reportKind를 분리한 뒤 위 전체 실행을 다시 완료했습니다. 최초 인프라 중단을 제품 실패나 통과로 계수하지 않습니다. wrapper/guard 자식은 종료됐고 반복 실행이나 브라우저는 남기지 않았습니다.

이 실행으로 결과 직접 수정·전체 문서 모델·편집 UI 완료를 주장하지 않습니다. 전용 경로의 후속 대조는 아래 기록을 따릅니다.

## 전용 입력 경로의 후속 검증

같은5caf33 후보로 기존 `tools/hwpx-specialized-input-audit.mjs`를 전체46파일에 실행했습니다. 임시 전달 wrapper는 `specialized-edit-guard-worker.mjs`이며 RSS 관측1024MiB/시간180초 한도에서 result1개+exit0·signal없음·stderr/stdout0바이트로 완료했습니다. 관측 peak270,221,312바이트입니다. 모든 열린 문단을 순회하고 일반/필드 외부 경로가 적격이면 건너뛰는 기존 선택 규칙을 바꾸지 않았습니다.

전용 시도165개 중152개를 검증했고 모두 독립 전체 XML/ZIP 일반 Python·`-O` 대조를 거쳤습니다. 이 중 이름 필드 경로는6개이며 저장 재열기·undo/redo·거부 후 기존 redo 보존을 함께 검사했습니다. 남은13개는 chart.hwpx의 계산 결과 내부이며 UnsupportedFieldLabelRange로 거부됐습니다. 일반 경로의 제어 포함146곳과 보호 필드19곳에 대응하는 전용 시도165곳이며, 그중13거부를 성공으로 계산하지 않습니다. 숫자 셀의 비숫자 prefix 거부48건은 이 전용 목록에서 제외됩니다.

따라서 이 두 prefix 실행의 성공은1,231+152=1,383문단이고, 나머지는 숫자 입력48문단과 결과 내부13문단입니다. 숫자 유효 입력의 별도 전체 회귀는 공개 numeric-input/numeric-exact corpus와 해당 수식 계약이 소유하며 다른 payload 검사를 같은 prefix 성공으로 합산하지 않습니다. 결과 직접 편집은 아직 이 후보에서 지원하지 않습니다. 전체 RHWP 참조 편집·Canvas/IME·원본 한글 조판·모든 명령 완료라는 주장은 하지 않습니다.

후속으로 동일5caf33 후보에서 numeric-input-corpus/numeric-exact-corpus2파일을 명시적으로 재실행해2/2·fail/skip0·exit0(26628.081583ms)을 확인했습니다. 실제48숫자 입력을 수정·저장/재열기/이력 복원하고13수식의 독립 재계산 및 정확한 표시 문자열을 검사합니다. 한 검사의1e-5 상대오차 대조와 다른 검사의 정확 문자열 대조를 구분합니다. 이는 의도적 비숫자 prefix 거부48건과 별도 유효 값 입력의 양성 대조이며 같은 prefix 성공 수로 합산하지 않습니다.
