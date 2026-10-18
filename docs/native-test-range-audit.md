# Native 검사 범위 재개

## 계약

`tools/zig-native-batch-audit.mjs`는 기존 Zig 표준 runner 프로토콜을 사용한다. `native-test-range.mjs`가 인자·반열린 인덱스 범위·inventory 상한의 단일 판정을 소유한다. 기본 범위는 전체이며 명시한 구간 밖을 자동 검사하거나 잘못된 끝 값을 조용히 줄이지 않는다.

`--start-index`·`--end-index`는 선택 사항이다. 전체 inventory를 실행한 경우에만 `kind:"complete"`와 `range.fullInventoryCovered:true`를 출력한다. 부분 범위는 모든 선택 검사가 통과해도 `kind:"range-complete"`이며 `fullInventoryCovered:false`다. 부분 성공들을 아무 검증 없이 전체 성공으로 합산하지 않는다. 결과의 `completed`는 선택 범위의 완료 수이고 `tests`는 전체 inventory 수다.

`--expected-sha256`은 선택 사항이지만 중단 뒤 재개할 때는 원래 실행의 소문자 64자리 바이너리 SHA256을 지정한다. 다르면 native 프로세스를 시작하지 않는다. 각 batch 사이와 마지막에도 바이너리 해시를 검사하고 모든 프로세스에서 inventory 이름·순서를 대조한다. 종료 시 로그 오류·누수·skip을 성공으로 바꾸지 않는다. 같은 바이너리의 다른 범위 검사라도 장수명 단일 프로세스 gate·fuzz 검사가 되는 것은 아니다.

## 2026-10-18 검증

순수 인자/범위 검사 3/3·실패/skip 0이다. 미지·중복 인자, 비정규/음수/과대 숫자, 빈/역방향 범위, inventory 밖 인덱스, 잘못된 SHA256을 거부한다. 실제 4,077개 바이너리의 0..1 실행은 root 한 개만 통과하고 `range-complete`/false로 끝났다. 잘못된 기대 SHA256 및 inventory 시작/끝 초과는 각각 exit1·test-start 0개로 거부했다. 별도 4개 native 바이너리의 기본 전체 실행은 4/4·로그/누수/skip 0이고 `complete`/true다. 이 4개를 4,077개 전체 통과로 세지 않는다.

실제 전체 감시 바이너리 `4b2cab406eba17fb26841e89ed1c038c885177b74b43e27b3949ca3395c08ac9`는 인덱스 0..2531의 2,531개를 완료한 뒤 2531에서 물리 메모리 감시로 중단됐다. 재개 범위는 해당 중단을 지우지 않는다. 수정한 테스트의 다른 바이너리에서 얻은 증거는 별도로 표시해야 한다.

실행 명령은 [개발·검증 명령](development-commands.md)이 소유한다. macOS 물리 메모리 guardian은 별도 로컬 도구이며 이 문서의 범위 기능 자체는 OS별 메모리 한도나 제품 메모리 상한을 보장하지 않는다.

후속4,087개 바이너리의3,314개 완료/자원 중단과 집중 대조는 [쪽 영역 현재 XML 진단 할당 범위](native-page-area-current-diagnostics.md)가 소유한다. 서로 다른 바이너리의 부분 결과를 전체 성공으로 합산하지 않는다.
