# HWP5 계산 필드 구조 거래 실패 주입 진단

## 원래 바이너리의 중단

고정 전체 바이너리51fabff6dc936cb200e48d9f4b6f25f69760f2b26f401a751389736a76ef2d1c의3501 본문 split 중단은 [앞 구간 기록](native-prefix-coverage-current.md)을 따릅니다. 별도3502..4111 실행도 첫 본문 merge에서 peak4,351,987,264바이트가4,096MiB 한도를 넘어 exit1·guardStopped=true로 종료됐습니다(`/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-hwp5-formula-split.jsonl/.stderr`). 이 범위의 완료 테스트는0개이며 child68774 종료를 확인했습니다.

같은 테스트 파일의 나머지 cell 두 건을 구형 바이너리에서 반복하지 않고, 아래 새 집중 바이너리에서 본문/셀·split/merge 네 모드를 모두 검사했습니다. 구형3503/3504의 통과로 바꾸거나 전체 native 성공으로 합산하지 않습니다.

## 범위와 대조

작업 트리에 있던 `formula_structure_transaction_tests.zig`의 바깥 `sweep` 할당자 분리만 채택했습니다. 공통 checked_allocator.run이 별도 수명의 안전/누수 검사 할당자로 sweepChecked를 호출합니다.50000 상한·실패 인덱스 순회·성공 종료 조건·chart 원본·모든 편집/저장/원본/이력 단언은 바꾸지 않았습니다. 제품 분할·병합·수식 코드는 수정하지 않았습니다.

`e3f19dbd` 기반 `/tmp/hwpjs-hwp5-formula-structure.O3RxeS`의 다른 src2,634개 Git blob이 모두 같고, 대상도 바깥 wrapper 치환 결과와 정확히 같음을 확인했습니다. 포맷/diff 검사를 통과했습니다.

ReleaseSafe SHA25612c67ecd23712ee3e705299912a7ce4315cdb099cf03f37981bd8cdd30d87520은 root 포함5/5·fail/skip/log/leak0·exit0·guardStopped=false·peak6,111,616바이트입니다(`formula-safe-build.log`, `formula-safe-guard.jsonl/.stderr`). Debug cef4d91cfb8028b9417b450678f403c53eaa58f9d36ae89ad4b206449d2ffba5도5/5·동일 오류0·exit0·guardStopped=false·peak4,702,592바이트입니다(`formula-debug-build.log`, `formula-debug-guard.jsonl/.stderr`). stderr의 본문split1401/merge1421·셀split1427/merge1492 완료 지점이 두 모드에서 같으며 stderr의 이 진단 출력은 제품 오류 로그가 아닙니다.

재현 필터는 `zig test src/root.zig -O ReleaseSafe --test-filter 'formula body structure' --test-filter 'formula cell structure'`이며 Debug도 같습니다. 동일4,096MiB guardian과 실제 네 이름/등록 개수를 확인했습니다. 원본 상태의 prior redo와 split 상태의 prior redo를 모두 검사했습니다. 이 대조는 진단 할당 비용의 개선이며 제품 편집 메모리 최적화·전체 native/fixture/UI 완료를 뜻하지 않습니다.

별도3505..4111 후속 구형 검사는3505 한 건을 완료한 다음3506 공개 수식 session의 apply/save 실패 주입에서 peak4,412,329,464바이트로 같은 한도를 넘었습니다(`native-tail-after-hwp5-formula-family.jsonl/.stderr`). 이 진단의 대상과 다른 파일이며 이5/5로 해결됐다고 주장하지 않습니다.
