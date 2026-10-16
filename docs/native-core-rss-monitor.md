# 기본 코어 실행의 RSS 감시

`tools/process-tree-rss.mjs`는 ps snapshot에서 지정 root와 자손만 고르고, 관측값/조회 오류 상태를 분리합니다. 중복 PID·잘못된 숫자·순환 소유 관계를 거부하며 다른 root의 메모리를 더하지 않습니다. 관측 한도를 실제로 초과한 값과 ETIMEDOUT 같은 조회 실패는 같은 종료 사유가 아닙니다. 오류의 code/status/signal과 길이를 제한한 진단은 기존 native-guard-error를 재사용합니다.

이번 기본 코어 재실행용 scratch guard는 실패 조회를 기록하고 재시도합니다. 조회20초·단일 비동기 관측·다음 관측까지2초이며 요청을 겹쳐 쌓지 않습니다. 실제10GiB RSS 합계 초과나 외부 종료 요청만 검증 전용 프로세스 그룹을 TERM합니다. 이 측정은 공유 페이지를 중복하는 RSS 합계이고 물리 footprint·하드 OS cap이 아닙니다. 기존 physical-footprint guard의 정책은 변경하지 않았습니다.

최종 결과에는 nativeSuccess와 관측 실패 누계/연속 실패·firstError/lastError를 따로 남깁니다. scratch 결과의 resourceObservationComplete는 표본이 있고 마지막 미해결 조회 오류가 없다는 의미이며 과거 조회 누락이 없었다는 뜻은 아닙니다. 조회 누락이 있으면 진단과 함께 보고해야 하며 native 테스트 성공을 자원 측정의 완전성으로 확대하지 않습니다.

2026-10-16 strict2파일7/7·fail/skip/cancel0·exit0(5456.335125ms)입니다. PID 순서가 섞인 자손 집계·관계없는 큰 RSS 제외·중복/잘못된 숫자/순환 거부, 조회 오류 기록/회복·한도 경계, 기존 물리 메모리 지표 파싱을 검사했습니다. 실제로 분리한 테스트 프로세스 그룹에 조회 오류를 모사해 살아 있음을 확인하고, 한도 초과 값을 주입했을 때 해당 그룹만 TERM되고 관계없는 그룹이 유지되는 것도 확인했습니다. 테스트 자식은 cleanup과60초 자체 종료를 가지며 실제10GiB 할당이나 원래 ps timeout errno의 재현을 주장하지 않습니다.

이전 core-default 실행은 감시기 중단·SIGTERM·incomplete입니다. 종료 오류 원문이 결과에 남지 않은 문제와 조회 실패 종료 정책을 재실행 감시기에서 보완했습니다. 고정 private index의 tree가 f8cc173e7b97eb9ae4710aa9a13b1ac46c6fddb5이고 전체 추적 파일의 frozen 작업 트리 diff가 비어 있음을 확인했습니다. 같은 기본 진단·무필터 명령으로 test zero부터 재실행을 시작했습니다. 새 root는25455, scope/events/log/result는 `/tmp/hwpjs-oracle-retry.IyxnDv/core-default-retry-1.*`, scratch 코드는 `/tmp/hwpjs-rich-history.QbM6eO/guard-clean-core-retry.mjs`입니다. 기존 결과를 덮어쓰거나 부분 통과를 합산하지 않습니다. 이 f8 실행은 후속 차트 등 현재 혼합 소스 전체의 gate가 아니며 아직 종료/통과 미확인입니다.
