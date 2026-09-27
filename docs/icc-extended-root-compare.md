# ICC 1024비트 기호근 비교

## 계약

`normalized_power_root_compare.compareWide(precision, root, n, d)`는 [u512 목표값에서 생성한 근](icc-wide-power-level.md)의 u1024 radicand와 signed i1024/u1024 유리수 밑 좌표를 비교합니다. 결과는 증명된 lt/eq/gt 또는 정밀도 부족의 null입니다. null은 같음이나 근 부재가 아닙니다. precision은 기존과 같이 128/256/512/1024입니다.

[ICC.1:2022 §10.18 Table 68·Annex F.1](https://www.color.org/specification/ICC.1-2022-05.pdf)은 파라메트릭 곡선의 거듭제곱 분기와 1차원 역상 조건을 규정합니다. 1024비트 기호근·정확한 거듭제곱 등식·방향성 상하한은 이를 다루기 위한 이 프로젝트의 내부 계산 방법이며, 명세가 이 비트 폭이나 알고리즘을 요구하는 것은 아닙니다.

d=0은 InvalidIccRootCoordinate이며 비영 근의 잘못된 성분·역지수는 InvalidIccPowerRoot입니다. 유효성 검사는 부호 조기 반환보다 먼저 수행합니다. 영점은 n의 부호만으로 비교하되 d=0은 먼저 거부합니다. 음수 i1024 최솟값의 절댓값은 u1024로 보존합니다.

## 정확성·책임 분리

기존 [256비트 근 비교](icc-normalized-root-compare.md)와 compareFor를 공유합니다. 음의 역지수이면 radicand를 뒤집고 정확한 동등성을 먼저 확인합니다. 그 외에는 `(A/B)^65536`과 `(|n|/d)^q`의 방향성 상하한이 분리된 경우만 대소를 반환하고 음수 근에서는 순서를 뒤집습니다.

`integer_power.Of(1024)`와 `rational_power_equality.Of(1024)`는 기존 완전근·checked 거듭제곱·약분 알고리즘의 입력 폭만 확장합니다. 정수 탐색은 midpoint를 상한 이하의 거듭제곱으로 검사합니다. q가 정수 폭 이상이면 1 외의 양의 완전 q제곱은 입력에 들어갈 수 없습니다. 정확한 등식은 상하한 정밀도에 의존하지 않습니다.

`positive_bounds.Arithmetic(precision).fractionExtended`는 기존 ratio의 1024비트 어댑터입니다. 초기 나눗셈에는 precision+1024비트 정수를 사용하고 큰 비율에서는 분모를 이동하므로 음의 이동량을 unsigned로 변환하지 않습니다. 유효 정밀도만큼의 방향성 반올림은 하한/상한을 감싸는 연산이며, 원래 분수를 좁은 분수로 자르는 것과 다릅니다. 이후 곱셈은 기존 두 배 정밀도 정수와 checked i64 이진 지수를 사용합니다. 최대 입력 비트 길이와 q≤2^31에서도 이진 지수는 i64 범위 안입니다.

코어는 할당하지 않으며, 입력이나 기호근을 변경하지 않습니다. 기존 compare/at의 입력·오류 계약과 제품 JS API는 그대로입니다. 최초 비교기 구현에는 새 `at`/활성 구간 연결이 포함되지 않았습니다. 현재는 `Wide.at` 어댑터와 [활성 근 위치](icc-extended-locations.md)가 별도로 구현되어 있으며, 이 비교 함수가 구간 선택을 직접 소유하지는 않습니다.

## 독립 검증

테스트 전용 mode222는 기존 mode196 probe와 폭별 파싱 로직을 공유합니다. 입력 528바이트 BE는 precision u32, sign i32, radicand n/d u1024, p i32, q u32, 좌표 n i1024/d u1024 순서입니다. zero 태그의 radicand와 역지수는 전부 0이어야 합니다. 출력 i32 LE −1/0/1은 증명된 대소이고 2는 미확정입니다.

독립 JS 기준은 작은 기약 지수의 전체 BigInt 거듭제곱과 교차 곱을 직접 계산합니다. 제품의 완전근 탐색이나 방향성 상하한은 기대값에 사용하지 않습니다. 1024비트 성분 극값, 넓은 완전제곱, 역수·음수, i1024 최솟값, 고정 seed 128개 넓은 조합, 모든 528개 잘림 길이, 잘못된 필드·한도·오류 후 복구를 포함합니다. 128비트 정밀도에서 겹치는 Pell 유리수는 null, 512비트에서는 증명된 순서를 요구합니다.

Debug 직접 실행에서 comparisons=558, rejected=539, undecided=1로 통과했습니다. 기존 mode196도 comparisons=1,810, rejected=155, undecided=1로 통과했습니다. 미확정→등식, 등식→미확정, 음수 비등식 반전, radicand 상위 512비트 제거의 네 변형을 모두 ERR_ASSERTION으로 검출했습니다.

다섯 번째 변형은 임시 복사본 `/tmp/hwpjs-extended-root-mutant.WutXVj/icc`에서 정확한 동등성 검사를 건너뛰게 했습니다. Debug/Safe는 테스트의 필수 eq 결과가 null이 되어 실패했고 Fast도 등식 검사 실패로 검출했습니다. 제품에는 변형을 적용하지 않았습니다.

시스템 ICC 5개 프로파일의 실제 para 태그 15개(type0/type3, 양의 g)에서 u512 최대 분모의 내부 목표값 세 가지를 근으로 생성했습니다. 이 양의 근은 0보다 크고 1보다 작다는 독립 수학적 경계와 mode222의 90회 비교가 일치했습니다. 이는 읽기 전용 수동 검사이며 audit 횟수에 포함하지 않습니다. 프로파일 전체 변환이나 실제 화면 일치 검증은 아닙니다.

추가 수동 극값 검사는 radicand=(2^1024−1)/1, q=1 또는 2147483648, 역지수와 근의 양·음 부호, 네 정밀도를 조합했습니다. 단위 좌표 ±1과의 비교는 양의 지수에서 크기>1, 음의 지수에서 크기<1이라는 기준으로 32건 모두 일치했습니다. 큰 지수를 BigInt로 전개하거나 부동소수점으로 기대값을 만들지 않았습니다.

## 전체 회귀 결과

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 630/630, WASM checks=6,919,590으로 완료됐습니다. 이전 6,918,492에 신규 1,098회 호출이 추가됐습니다. Safe/Fast 실제 audit WASM의 직접 대조와 네 가지 입출력 변형 검사도 같은 결과로 통과했습니다. 로컬 로그는 `/tmp/hwpjs-extended-root-{Debug,ReleaseSafe,ReleaseFast}.log`이며 임시 산출물입니다. 변경 문서의 로컬 링크 9개와 Zig 포맷·JS 문법·diff 공백 검사도 확인했습니다.

위 수치와 변형 검사는 최초 구현 시점의 기록입니다. 인용된 `/tmp` 로그는 현재 존재하지 않으며, 아래 재검증에서 수행하지 않은 당시 검사를 현재 결과로 세지 않습니다.

## 미완료 경계

이 모듈은 밑 좌표와 근의 비교까지만 소유합니다. [활성 근 위치](icc-extended-locations.md)는 affine 어댑터와 구간 소유권을, [클리핑 역상](icc-extended-power-preimage.md)과 [파라메트릭 역상](icc-extended-parametric-preimage.md)은 분기 조립을, [파라메트릭 역변환](icc-extended-parametric-inverse.md)과 [TRC 역변환](icc-extended-trc-inverse.md)은 선택·조립을 각각 별도로 다룹니다. 이 비교가 넓은 x의 정확한 단일 좌표를 생성하거나 모든 역상·최근접 출력·렌더링 결과를 자체 보장하지는 않습니다. 제한 정밀도로 분리되지 않는 모든 입력을 판정한다고 주장하지 않습니다. 전체 ICC 및 HWP/HWPX 문서 검증은 미완료입니다.

## 2026-09-27 문서 재검증

현재 `compareWide`는 256비트 `compare`와 같은 `compareFor`를 사용합니다. 좌표 분모와 비영 근을 부호 조기 반환 전에 검증하고, 유효한 비영 근의 정확한 등식을 먼저 판정하며, 상하한이 겹치면 `null`을 반환합니다. `fractionExtended`는 1024비트 입력을 공통 `ratio`에 전달하고, 완전근·유리 거듭제곱 등식도 폭별 어댑터에서 알고리즘을 공유합니다. 현재 `Wide.at`/위치·역상 소비자와 이 비교기의 책임은 분리되어 있습니다.

Debug·ReleaseSafe·ReleaseFast의 `zig test src/root.zig --test-filter 'extended root'`는 각 모드 8/8(루트 1·이 비교기 4·인접 근 순서 3) 통과했습니다. 현재 ReleaseFast 테스트용 WASM의 mode222 독립 BigInt 대조는 comparisons=558·rejected=539·undecided=1로 일치했고, 별도로 최대 u1024 radicand·q=1/2³¹·양/음 역지수·양/음 근·네 정밀도의 32개 부호/단위 좌표 비교가 일치했습니다. 바로 앞 문서 검증에서 같은 제품 코드로 실행한 `zig build hwp5-audit -Doptimize=ReleaseFast --summary all`도 10/10 단계·WASM checks=8,905,855였습니다. 이는 mode222 전용 건수가 아닙니다.

후속 연결의 현행 존재와 기본 동작은 ReleaseFast의 활성 위치 3/3, 클리핑 역상 5/5, 전체 분기 역상 6/6, 전체 역변환 4/4 및 넓은 목표·좌표 2/2, TRC 4/4 집중 테스트로 확인했습니다. 각 수치는 root 포함이며, 이 테스트만으로 후속 모듈 문서 전체를 검증 완료로 세지 않습니다.

과거 Debug·ReleaseSafe 전체 감사·변형 주입·macOS 실프로파일 90건은 이번에 재실행하지 않았습니다. 단일 비교의 성공을 전체 프로파일 적합성·색상 변환·HWP/HWPX 표시 동치로 확대하지 않습니다.
