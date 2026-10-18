# 원본 소속 조회 인덱스

## 계약과 책임

`body/paragraph_flows.Flows`가 같은 Tree/Groups의 문단별 LIST_HEADER 소속을 소유합니다. 조회용 `table_list_index.Index`는 같은 변경되지 않은 Tree를 빌리고 기존 `table_lists.Iterator`로 방문한 표의 직접 리스트를 한 번만 수집합니다. 표/리스트 ID·TABLE 표식·캡션/셀 구분은 기존 형제 순회기가 계속 판정합니다. 요청하지 않은 빈 표를 미리 검사해 기존 거부 범위를 넓히지 않습니다. 다른 표의 리스트를 조회하면 `InvalidTableOwner`이며 표식 누락/중복 오류를 유지합니다.

이 인덱스는 각 native 조회 안에서 생성·해제합니다. Session·편집값·Worker 사이에 남는 원본 캐시가 아닙니다. 생성 문단은 계속 명시적 source/header-template와 parent 검증을 거치며 화면 순번으로 원본 식별자를 대체하지 않습니다.

`table_display_bindings`와 `paragraph_flow_snapshot`이 기존 Flows와 요청별 표 인덱스를 사용합니다. `columnSources`는 기존 문단 흐름 경로를 재사용하므로 같은 개선을 받습니다. 셀 payload/레이아웃·직사각형 범위 검증은 `formula_cell.fromEntry` 한 곳이 소유하며 기존 단일 셀 `locate`와 인덱스 경로가 공유합니다. 저장·편집·수식 거래의 기존 단일 셀 탐색을 별도 추정 알고리즘으로 바꾸지 않았습니다.

## 실측

분리 native 후보는 `/tmp/hwpjs-native-ownership-index.xyApv9/source`이며 WASM SHA256은 `7571f3da6db889f2309f25b29ba65341cefc9a62bd70d59bff525bd1448fa3b7`입니다. ReleaseSafe 빌드는5/5·exit0입니다. 구간 JS는 별도 `/tmp/hwpjs-window-integrated.oHnTVI/source`를 사용하고 native 산출물을 명시적으로 주입했습니다.

53,448문단 원본의 offset50000/count1을 같은 JS·입력으로 준비한 프로파일러 없는 단일 대조는39,302.74ms에서1,964.61ms로 줄었습니다. 표 소속 조회 두 번은14,844.00→62.39ms, 단 정의 조회 두 번은13,461.67→47.68ms, 문단 흐름 한 번은9,016.63→73.61ms입니다. 프로파일은 `formula_cell.locate`, `table_lists.Iterator.init` 및 문단 흐름의 반복 원본 탐색을 병목으로 확인했습니다. 프로파일러 실행의46,360.04ms를 위 baseline 실측과 섞지 않습니다.

이는 한 원본의 해당 구간 준비 비용이며 전체 문서 편집/OS/조판 성능 개선율이 아닙니다. 남은 field-span 조회는 같은 실행에서1,256.99ms이며 이 부분까지 해결했다고 주장하지 않습니다.

후속 전체 구간 응답 대조(`full-window-parity.log`)도 성공했습니다. 표시 문단56개를 포함한 전체 응답이 deep-equal이고 응답 JSON SHA256은 `64733cad4c8148dfb49c7bf15dc7e3373f19fef7674737c655b1aa4d84443a3b`입니다. 두 산출물의 조회 후 저장값은 원본과 같으며 선택 텍스트를 변이한 응답의 음성 대조는 실패해야 합니다. 이 별도 실행의 준비 시간은42,235.17→2,053.64ms이며 앞선 단일 실측과 합산해 평균/최고 성능을 만들지 않습니다.

위 대조 대상은 `queryHwp5WindowContent`의 전체 준비 결과입니다. 최종 Worker envelope의 권한 메타데이터까지 포함한 대조로 확대하지 않습니다. 조회 분기의 최종 정책 표시는 [구간 원본 정책](hwp5-window-source-policy.md)이 소유합니다.

## 실제 검증

진단의 `cells` 합계723/54,009는 고유 셀 개수가 아니라 문단별 셀 소속 binding 행 수입니다. 여러 문단을 가진 셀을 한 개로 세는 통계와 혼용하지 않습니다.

인덱스를 채우던 할당 실패 뒤 같은 요청 범위에서 재시도하면 정상 결과를 얻고, 완성된 소속 조회는 추가 할당 없이 동작해야 한다는 반례도 추가했습니다. `index-native-retry-safe.log`와 `index-native-retry-debug.log`는 각각3/3·exit0입니다. 실패한 범위를 loaded로 게시하지 않으며 임시 map은 모든 종료 경로에서 해제합니다.

별도 `hwp5-ownership-query-parity` 빌드 게이트는2/2·실패/취소/건너뜀0·7/7단계·exit0입니다(`ownership-parity-gate.log`). 설치 산출물 해시는 위7571f3da와 일치합니다.975파일 리더 전체 JSON 대조도944개 동치·5개 동일 거부·26개 HWP3 제외로 종료됐습니다. export 비교는332대332·누락/종류 변경/추가0입니다. 이 결과를 원본 전체 편집 지원이나 조판 동치로 확대하지 않습니다.

새 표 인덱스·기존 문단 흐름·표 binding 필터는 ReleaseSafe/Debug에서 각각3/3·exit0입니다. root 선언과 binding 필터에 함께 선택되는 기존 HWPX 검사를 포함한 필터별 결과이며 중복 root를 서로 다른 제품 검사로 합산하지 않습니다. 실제 중첩 표/캡션의 기존 소속, 외부 표 리스트, 잘못된 노드, TABLE 표식 누락/중복 및 전체 할당 실패를 확인했습니다. 기존 문단 분할/생성 provenance·셀 범위·모든 할당 실패 단언을 유지합니다.

정확한4파일의 `parity-editor-strict-refusals.log`는14/14·실패/취소/건너뜀0·exit0입니다. 추적 HWP fixture48개 중45개 열기/47구역/141조회 전체 배열 동치·723셀 독립 대조, 명시한 암호/배포 정책 거부3개, 대형/혼합 필드 참조3원본의3구역/9조회 전체 배열 동치·54,009셀 독립 대조를 포함합니다. 전체 Section에서 얻은 독립 셀 소속의 행 값을 변이시키면 대조가 실패해야 합니다. 성공 조회 대신 양쪽 오류만 일치시키는 우회를 허용하지 않습니다. 원본/입력 바이트와 조회 후 저장값도 유지합니다. 별도 실제 단 정의의 독립 원본 필드·소유권·분할/입력/undo/redo/재열기와 구조 편집 회귀를 포함합니다.

선택 runner가 누락된 집중 테스트 경로를 시작 전에 거부한 로그와 혼합 workspace 경로의 실행은 분리 후보의 근거로 사용하지 않습니다. 필요한 테스트를 포함한 뒤 분리 경로를 확인한 실행과 strict-refusal 실행만 위 결과에 사용합니다.

`market-browser.log`는 같은 대형 원본의 문단50000에서 실제 Chromium의 신뢰된 입력·undo/redo·다운로드·독립 전체 Section/스트림/CFB 메타데이터·native 재열기·브라우저 재업로드를 통과했습니다. 저장본 SHA256은 이전 후보와 같은 `14c72b64b65241d78a51902b21ae1d3f1300b6fd85197d1887ad25105f7b7901`입니다. 최종 success=true와 전용 세션 active=false/pid=null·서버 종료를 확인했습니다. 캡처에서도 지정 문단에 입력된 내용을 확인했습니다.

기본 WASM/외부 데모 승격, 이 변경을 포함한 정규 전체 회귀·전체 native gate와 모든 원본 한글 조판 동치는 아직 별도입니다. 진행 중인4,090개 native 실행은 이 인덱스를 넣기 전 진단 수정 스냅샷이므로 이 후보의 전체 gate로 사용하지 않습니다. 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

## 게시된 구간 UI 위의 통합 검증

`e1431dc9`에서 이 변경만 합친 `/tmp/hwpjs-ownership-publication.5GCsgf/source`의 native 소스는 위 프로토타입과 byte-exact 동일합니다. 별도 ReleaseSafe 빌드는5/5·exit0, 새 WASM은 `02392a100fd6598bdb93d3291fabc8013e83be185cb2304231682c1f364a223b`입니다. 이 산출물의 정규 편집 회귀는453/453·fail/cancel/skip0·7/7단계·exit0,697,162.61ms로 종료했습니다(`editor-full.log`).

같은 통합 산출물의 전용 소속 대조는2/2·7/7단계·exit0,975파일 리더 대조는944동치/5동일거부/26HWP3제외, export 비교는332대332·누락/종류 변경/추가0입니다. HWPX 구간 집중은5파일·10/10·fail/cancel/skip0·exit0입니다. 실제 Chromium의 입력/이력/독립 저장/재업로드도 success=true·전용 세션 및 서버 종료로 끝났고 저장 SHA256도 위14c72b64와 같습니다. 이453개는 후속 조회 정책 전달 수정 전의 스냅샷이며 다른 소스의 전체 gate로 합산하지 않습니다. 기본 데모 승격과 전체 native/원본 조판 완료는 여전히 별도입니다.
