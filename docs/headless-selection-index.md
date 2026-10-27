# 소유 관측의 문단 선택 인덱스

선택 검증은 내부에서 깊게 소유한 불변 문단 배열에만 조회 인덱스를 재사용합니다. owner·token·좌표·편집 권한의 권위는 기존 선택 validator와 Native에 그대로 있으며, 인덱스가 새 권한이나 참조를 발급하지 않습니다. 실행 명령은 [개발·검증 명령](development-commands.md#소유-관측-문단-선택-인덱스-검증)에만 둡니다.

## 소유권과 수명

`state/owned.ts`의 기존 `immutableObservations` WeakSet membership만 내부 조회 함수로 읽습니다. 외부 `Object.isFrozen`을 신뢰하지 않으며 공개 index/API·DTO에는 새 export를 추가하지 않습니다. 공유 lookup의 WeakMap 키는 소유 문단 배열이고, 값은 section→paragraph의 중첩 Map입니다. 문자열 연결 키를 사용하지 않고 동일 좌표 중복은 sentinel로 기록해 기존 거부를 유지합니다.

같은 배열이면 인덱스를 재사용하고 새 배열이면 재구성합니다. 이전 배열을 강하게 보관하는 전역 목록이나 명시적 문서별 registry를 추가하지 않습니다. WeakMap의 회수 가능성과 실제 GC 회수 시점은 구분하며, GC 시점을 실측했다는 주장은 하지 않습니다.

비브랜드 DTO·외부 mutable 배열·외부 동결 배열은 기존 filter를 매번 사용합니다. 희소 배열, 부적합 행·좌표 또는 좌표 accessor가 있는 소유 배열도 fallback합니다. 브랜드 검사를 먼저 해 외부 revoked Proxy에 불필요한 Array 검사를 하지 않습니다. 원래 token→coordinate→position→owner/clipped→editable→text→surrogate 검사 순서는 바꾸지 않습니다.

## 비용과 주장 범위

P는 문단 배열의 행 수, Q는 같은 배열에서의 조회 횟수입니다. 적합한 배열은 최초 구축 O(P), 같은 immutable snapshot의 후속 조회는 Map의 평균 O(1)입니다. Q회 총 기대 작업은 O(P+Q)이며 최악 시간 상한을 새로 보장하지 않습니다. fallback 조회는 O(P)이고 Q회 반복이면 O(PQ)입니다. 부적합 소유 배열의 최초 판정에는 원래 filter 외에 선행 shape 검사도 추가될 수 있습니다.

이는 유일 행 조회의 비용 범위입니다. 다른 owner 검색·참조 검증·입력 큐·Native·전체 snapshot·조판·렌더러·전체 typing의 복잡도나 지연을 증명하지 않습니다.

## 검증과 미검증

2026-10-27 격리 source 세대의 명시 실행은 다음과 같습니다. 원본 파일·실패 세대·각 guard와 후해시 기록을 보존했습니다.

- 전용 정규 테스트 20개 통과: 내부 브랜드/외부 동결 거부, mutable fallback, 중복·부재·숫자 키, 희소·NaN·accessor·revoked Proxy, 오류 순서·서로게이트, 배열 교체와 canonical validator의 행 identity를 확인했습니다.
- 같은 알고리즘의 계측 lookup에서 P=32/64/128을 정순·역순으로 각각 총 64/128/256회 조회했습니다. 인덱스 builder 행 방문은 32/64/128, fallback 방문과 역순 조회의 추가 행 방문은 0이었습니다. production 공유 lookup에는 계측 tap이 없습니다. 이 숫자는 전체 입력 경로의 방문 횟수가 아닙니다.
- 기존 selection 연속성 17개와 별도 단일 소유 브랜드 통합 1개를 같은 물리 module graph에서 통과했습니다. 초기 readonly 링크 시도는 실제 root의 17개가 실행되고 후보 브랜드 통합 1개가 실패했으므로 후보 성공으로 계상하지 않았습니다. 정확한 최소 ancestor 17개, 96,129바이트만 실체화한 새 세대에서 재검증했습니다.
- 선택 source 3개와 전용 test 1개의 formatter/lint는 통과했고, production source 3개의 strict ES2022 noDOM 타입 검사는 통과했습니다. 테스트 전체의 별도 strict 타입 검사 성공으로 확대하지 않습니다.

정규 실행 명령은 전용 20개+기존 17개를 실행합니다. 위 추가 브랜드 통합 1개는 격리 검증 증거이며 정규 CLI의 자동 포함 항목이 아닙니다. 이 검증에는 실제 WASM·Worker·브라우저·공식 core producer 실행이 없으며, 공식 패키지/브라우저 통합은 별도 후속 gate입니다.
