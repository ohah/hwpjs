# HWPX 차트의 명시 주 눈금선

## 원값과 표시 계약

`chart_axis_values.Axis.major_tick_mark`는 기존 축 owner에서 읽는 선택적 `Field(TickMark)`입니다. `cross`/`in`/`none`/`out`을 구분하며 직접 child·namespace·중복·정수 node·할당자 정리는 기존 공통 계층을 재사용합니다. 미지 enum은 명시 오류, 원소 부재는 null, val 없는 원소는 value=null입니다. 저장 모델과 편집 권한을 만들지 않습니다.

기준은 Microsoft의 [MajorTickMark](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.majortickmark?view=openxml-3.0.1)와 [TickMarkValues](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts.tickmarkvalues?view=openxml-3.0.1)입니다. schema 기본값을 raw 부재에 채우거나 미지 값을 none으로 바꾸지 않습니다. 외부 구현 코드를 도입하지 않았습니다.

기존 chart display wire의 axes 배열에 additive 필드가 포함됩니다. JS decoder는 구 Native의 필드 생략·null·val-null과 명시 값을 구분하고 전체 chart graph의 node alias를 검사합니다. 기존 응답 한도와 raw 원본 보존은 유지합니다. 새 export나 setter는 없습니다.

2D barChart의 기존 projection만 값을 Canvas에 전달합니다. 기하는 현재 preview 축의 아래/왼쪽 모서리에 원본 axPos b/l가 일치할 때만 추가합니다. 불확실/다른 위치는 `unsupported_position` 진단과 함께 추가 눈금선을 생략하고 기존 막대는 보존합니다. 3D·선·원형의 paint 경로를 확대하지 않습니다.

안쪽·바깥쪽 길이는 각4 CSS px이며 cross의 양쪽 합계는8px인 명시적 preview 스타일입니다. 원본 눈금 길이를 읽은 값이 아닙니다. 축 교차점·majorUnit/skip·글꼴·범례·데이터 레이블의 원본 조판은 여전히 미완료이며 exact=false를 유지합니다. [전체 지원 경계](hwpx-chart-layout-coverage.md)를 따릅니다.

## 비용

새 기하는 n=수치 눈금 수+항목 눈금 수에서 한 번씩 순회하며 최대 n개의 segment를 만듭니다. 64/128/256 입력에서 fraction 읽기·출력 각n을 확인했습니다. 측정과 코드상 순회 상한은 구분합니다. 기존 XML·snapshot·축 연결·데이터 정렬과 Set 기반 DTO 검증까지 전체 pipeline의 최악 O(n)을 증명한 것은 아닙니다. 임시 표시 축 보고서 바이트가 증가하고 기존 allocator·응답 예산에 청구됩니다. Session/history/checkpoint·문서 수명 cache는 추가하지 않습니다.

## 실제 검증과 배포 경계

격리 source9/19805218 기준 전용 Native는 실제6개 통과·건너뜀0입니다. 모델 회귀4+실fixture1+wrapper1이며 정규 root에는 모델4만 등록합니다. 할당 실패 회귀는 시험 안에 포함됐지만 failpoint 회차수를 별도로 계수하지 않았습니다. Native가 출력한 typed 축 DTO를 독립 Python XML 기대값 및 기존 d849 응답의 나머지 모든 축 필드와 비교하고 같은 DTO로 JS8을 통과했습니다. 정규 순수5와 중복되므로 합산하지 않습니다. 명령은 [개발·검증 명령](development-commands.md#chart-major-ticks)을 따릅니다.

실 `묶은세로막대형.hwpx`(SHA256 e8ffa2ef81e630b5ac7e0a230c101924b96bd4d61be958cf608161bfe9a7365a)에서 원본 out 두 개·수치 눈금5+항목 눈금4=segment9를 확인했습니다. Canvas 대역에서 막대12와 좌표는 그대로이고 lineTo는7→16입니다. 반전·음수 범위·한 점·0치수·숨김·미지/부재/legacy·node 충돌·오류/한도를 검사했습니다.

원본 저장 byte 동치는 기존 d849 editor의 읽기 전용 대조입니다. 새 Native Session 저장·새 전체 WASM/SDK/Worker·실 Canvas 픽셀·독립 변경 ZIP/XML oracle 결과가 아닙니다. source 추가만으로 운영/공개 데모 반영을 주장하지 않으며, 새 WASM과 source graph가 일치하는 공식 SDK 및 실브라우저 fixture 검증이 별도로 필요합니다. 첫 음수0 비교 실패와 수정 후 결과는 별도 보존했습니다.

공식 단독 검증은 고정 입력에서 root 5,036통과·1skip, 별도 text9 통과(합계 5,045통과·1skip), ReleaseSafe 6/6 단계로 종료했습니다. cached 참조 테스트는 이번 통과 수에 더하지 않았습니다. 새 WASM `0071ef3d5d47aa93fe9cf10f73ad376777c47534dc179a299db1602d0c785a2c`는 ABI 이름·서명 보존을 확인했으며, SDK·실제 Canvas·운영 반영은 별도입니다.
