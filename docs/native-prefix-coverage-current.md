# 고정 native 바이너리 앞 구간 검증

후속 ab811f17과 같은 src의4,114개 전체 실행은 [현재 main native gate](native-current-main-gate.md)가 소유합니다. 아래 구형 구간을 새 실행의 통과로 합산하지 않습니다.

후속 HWP5 본문/셀 split·merge의 집중 대조는 [계산 필드 구조 거래 진단](native-hwp5-formula-structure-diagnostics.md)이 소유합니다.

2026-10-18 `/tmp/hwpjs-title-group-native.6U4qUw/native-safe`의 SHA256은 `51fabff6dc936cb200e48d9f4b6f25f69760f2b26f401a751389736a76ef2d1c`이고 inventory는4,111개입니다. 같은 디렉터리의 src2,634개 Git blob이 모두51012899와 같음을 다시 확인했습니다. 최신 main 바이너리가 아니며 후속 unknownObj 기능/테스트의 전체 native 검증으로 읽지 않습니다.

`native-prefix-guard.jsonl/.stderr`의 처음0..646은647개·status/log/leak0입니다. 이후 guardian stdout ENOSPC로 실패했으며 이 실행을 정상 종료로 바꾸지 않습니다. 같은 바이너리/seed/4,096MiB·batch1의 `native-prefix-resume-guard.jsonl/.stderr`는647..3349의2,703개를 fail/skip/log/leak0·exit0·guardStopped=false로 완료했습니다. 후자의 관측 peak는1,099,269,272바이트입니다. guardian84376 종료도 확인했습니다.

두 파일의 실제 test-result를 독립 순회해 인덱스·개수·오류·중복·동일 inventory 해시를 확인했습니다. 동일 바이너리의 결과0..3349는 빠짐없이3,350개입니다. 다른 바이너리의 집중 통과를 합산한 것이 아니지만 단일 장수명 프로세스나 전체4,111개 gate 통과도 아닙니다. JSONL의 range.fullInventoryCovered=false를 유지합니다.

2505 `HWPX underline batch allocation failures preserve original and prior redo`도 status0/log0/leak0입니다. stderr의 transaction allocations44,929와 후속 spread9점 완료를 확인했습니다. 오래 걸리는 동안 실제 PID/CPU와 실패 위치 진행 로그를 확인했으며 관측 시간 초과만으로 재시작하지 않았습니다. spread 검사는 exhaustive 검사를 대신하지 않습니다.

별도3475..4111 후속 범위는3475..3500의26개를 완료한 뒤3501 HWP5 `formula body structure split allocation failures preserve original and prior redo`에서 peak4,328,377,800바이트로 동일 한도를 넘어 exit1·guardStopped=true로 중단했습니다(`native-tail-after-split-session.jsonl/.stderr`). 이 결과를 앞 구간 완료나 최신 코드 전체 성공에 포함하지 않습니다. 최신 전체 gate와 남은 실패 주입 진단의 재검증은 별도입니다.
