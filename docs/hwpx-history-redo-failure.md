# HWPX 쪽 영역 이력의 redo 실패 검증

## 검증하는 계약

이력 이동 정책은 `model/history_stack.zig`가 소유합니다. 대상 스택의 용량을 먼저 확보하고 checkpoint 교환이 성공한 뒤에만 항목과 revision을 이동합니다. 이 문서는 정책을 재구현하지 않고 쪽 영역 병합의 구체적 실패 경로를 검사합니다.

`page_area_history_failure_tests.zig`의 원래 sweep은 정상 redo까지 실행하지만, undo 뒤 목적지 배열의 용량이 남으면 redo가 할당 없이 끝날 수 있습니다. 따라서 모든 할당 실패 지점을 순회했다는 사실만으로 redo의 OutOfMemory 경로를 통과했다고 주장하지 않습니다.

## 보강된 테스트

- 기존 입력·공개 병합·undo·전체 실패 주입을 유지합니다. undo 완료 뒤 목적지 undo 배열이 비었음을 확인하고 캐시 용량만 해제합니다. checkpoint나 redo 항목은 제거하지 않습니다.
- redo 재할당 실패 뒤 문단 수, undo0/redo1, revision/next_revision과 저장 ZIP 전체가 redo 시도 직전 값으로 유지되는지 확인합니다.
- redo OutOfMemory 관측 횟수를 세고 전체 sweep 종료 뒤 양수인지 단언합니다. 단순 catch 추가만으로 실행되지 않는 검사를 만들지 않습니다.
- 관측용 저장은 별도 안전/누수 검사 할당자를 사용하고, 실패 주입 대상 오류는 그대로 반환합니다. 실패 지점을 줄이거나 메모리 한도를 올리지 않습니다.

## 근거와 범위

별도 소스는 `/tmp/hwpjs-history-redo-atomic.38Yvie`입니다. ReleaseSafe077a15106b79dfd94258c6d53b01a3b0cb14c209c20e78782109d463f2b31611은2/2·fail/skip/log/leak0·exit0·guardStopped=false이며 관측 peak16,335,208바이트입니다(`redo-safe-guard.jsonl`). Debug35ad0bccf05cbd6f0f93c9f803e0b4d539d475b31caf21008b29e25ba267c63a도2/2·같은 오류/누수0·exit0·guardStopped=false·peak8,225,128바이트입니다(`redo-debug-guard.jsonl`). 각2개는 root 등록1개와 실제 assertion 테스트1개이며 서로 합산하지 않습니다.

별도 변이 모듈에서 캐시 해제 한 줄을 제거하면 TestUnexpectedResult로 실패했습니다(`redo-cached-mutation.log`,exit1). 정상 경로만 지나간 sweep을 coverage 단언이 잡는 음성 대조입니다. redo 실패 직후 문단 수를1 줄인 변이는 expected6/found5·TestExpectedEqual로 실패했습니다(`redo-corrupt-mutation.log`,exit1). 정상 제품 코드를 변이하거나 이 실패들을 제품 결함으로 집계하지 않았습니다.

이 검사는 해당 쪽 영역 병합 이력의 실패 원자성에 대한 증거입니다. 모든 History 명령·UI·레이아웃·전체 native 완료를 뜻하지 않습니다. 진단 메모리 경계와 이전 바이너리의 후속 자원 중단은 [별도 기록](native-page-area-current-diagnostics.md)을 따릅니다.
