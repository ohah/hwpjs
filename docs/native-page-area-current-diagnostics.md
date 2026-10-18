# 쪽 영역 현재 XML 테스트의 진단 할당 범위

## 재현과 변경 범위

이전 개체 번호 보존 스냅샷의 전체 native 바이너리 `3e781bafcb0668d5111122ccf47ae55e8ce8c06e3d7e5a3d00de8ecd66950d74`는4,087개 중 인덱스0..3313의3,314개를 완료했습니다. 완료 결과의 실패·오류 로그·누수는0입니다. 다음 인덱스3314 `page area current XML saves real owner relocation with nested prior edits`에서 물리 footprint4,313,533,872바이트로4,096MiB 감시 기준을 넘어 guardian이 소유 프로세스를 종료했습니다. 최종 exit1·guardStopped=true이며 전체 native 통과가 아닙니다. 해당 native 및 guardian/batch 프로세스의 종료도 확인했습니다.

테스트는 실제 `headerfooter.hwpx`를 열어 본문과 머리말/꼬리말의 선행 편집을 적용하고, 쪽 영역의 위치2/4·저장 XML·독립 재파싱·잘못된 순서 거부·모든 쓰기 할당 실패를 검사합니다. `page_area_current_xml.zig`의 제품 함수는 변경하지 않습니다. 테스트 바깥 수명은 기존 `testing/checked_allocator.run`, 실패 주입은 기존 `testing/allocation_failures.check`로 분리합니다. 두 공통 도우미가 안전 검사·누수 검사를 계속 담당하며 테스트별 allocator 정책을 새로 만들지 않습니다. 기존 실패 주입 callback·인자·전체 실패 인덱스·단언·fixture는 유지합니다. 한도 상향이나 테스트 제외가 아닙니다.

## 대조 근거

`7f02026c` 기반 별도 스냅샷에서 위 테스트의 진단 범위만 바꿔 컴파일했습니다. ReleaseSafe 집중 바이너리 SHA256은 `5b7f6fe8c7bf49f4841af783884837ad7bbb585a00164d99eeb062c95356a9fa`입니다. 같은4,096MiB 관측 기준에서 root 선언 포함2/2·fail/skip/log/leak0·exit0·guardStopped=false, 관측 peak7,487,824바이트로 끝났습니다. 로그는 `guard-safe-retry.jsonl`입니다. 최초 실행은 분리 스냅샷에 로컬 guardian 파일이 없어 native 시작 전 실패했고, 실제 workspace guardian의 절대 경로를 지정해 재실행했습니다. 최초 실패를 테스트 통과로 계산하지 않습니다.

Debug 집중 바이너리 `179ccd4aa22e180ad4ac1522575fadc9221baa63a1f0986572c41b834dfb701c`도 같은 기준에서2/2·fail/skip/log/leak0·exit0·guardStopped=false, 관측 peak4,309,328바이트로 끝났습니다(`guard-debug.jsonl`).

별도 제품 ReleaseSafe 빌드도5/5·exit0입니다. 소스 대조는 test 선언 앞의 제품 함수 원문이 byte-exact 동일함을 확인하고, allocator 수명 래퍼/실패 주입 호출만 정규화하면 테스트 본문 전체가 이전 버전과 동일함을 확인했습니다. 원문 보존·재파싱·순서·실패 주입 단언을 줄이지 않았습니다.

원래 전체 바이너리와 수정한 집중 바이너리는 다르므로 이2개를 기존3,314개와 합쳐 전체 통과로 집계하지 않습니다. 관측 수치는 샘플링된 테스트 진단 비용이며 제품 편집의 메모리 상한·단일 장수명 native 프로세스 gate 완료를 뜻하지 않습니다. 최신 전체 native 재검증은 별도입니다.

최신 전체 소스의 native 바이너리 `2e3ae5ac4a18bc4b094261d72870dfa13fd5032073d2e566fc0bf9b2f942f5c3`는4,090개입니다. 최초 시작은 분리 스냅샷의 참조 fixture 경로가 빠져 실제 문서 테스트가 실패/skip했고 설정 오류를 확인한 뒤 guardian을 명시적으로 중단했습니다(`full-guard.jsonl`,ExternalSIGTERM·exit1). 이 중단은 제품 자원 초과나 전체 통과가 아닙니다. 참조/legacy fixture 경로를 workspace의 실제 입력으로 연결하고 같은 바이너리·4,096MiB 기준으로 `full-guard-corrected.jsonl`에서 인덱스0부터 다시 실행합니다. 해당 전체 검사는 아직 진행 중이며 이전 부분 결과와 합산하지 않습니다.
