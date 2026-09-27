# ICC 넓은 양수 분수 상하한

## 범위와 공통 책임

`positive_bounds.Arithmetic(bits)`의 `fraction`은 양의 u256 분자·분모를, 현재 별도 `fractionWide`·`fractionExtended`는 각각 u512·u1024 분자·분모를 받아 128/256/512/1024비트 유효숫자의 하한·상한으로 감쌉니다. 영 분자·분모는 InvalidIccPositiveFraction입니다. 기존 u128 입력 호출자는 `fraction`으로 승격하며, 세 입력 폭은 같은 `ratio`와 곱·거듭제곱·구간 분리 판정 알고리즘을 공유합니다.

이는 [정규화 거듭제곱 근](icc-normalized-power-level.md)의 넓은 radicand를 다루기 위한 공통 기반입니다. [넓은 근 비교](icc-normalized-root-compare.md)와 이를 통한 [활성 구간 위치](icc-normalized-root-locations.md)가 이 계층을 사용합니다. 상하한이 겹치면 같음이 아니라 미확정이라는 기존 계약을 유지합니다.

## 연산 폭과 방향성

분자·분모 비트 길이를 L(n), L(d)라고 하면 s=bits−1+L(d)−L(n)입니다. s가 음수가 아니면 분자를 s비트 왼쪽 이동하고, 음수이면 분모를 −s비트 왼쪽 이동합니다. 두 경우 모두 정확한 스케일 비율의 floor 몫과 나머지를 사용하며 결과의 이진 지수는 −s입니다. 나머지가 있을 때 상한의 몫만 1 올립니다.

입력 폭을 width라 하면 초기 나눗셈은 bits+width비트 정수에서 수행합니다. 이동된 분자의 비트 길이는 최대 bits+width−1, 분모 또는 이동된 분모도 이 폭 안에 있으며, 몫의 비트 길이는 bits 이하입니다. 몫과 올림 값은 기존 두 배 폭 정규화 함수로 전달합니다. 128비트 정밀도에서 입력 폭의 최댓값/1 같은 큰 비율은 s<0이므로 분자를 unsigned shift로 이동시키거나 입력을 더 좁은 폭으로 자르지 않습니다.

## 2026-09-27 현재 재검증

[ICC.1:2022 Annex F.1](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 곡선 역변환 계산에 쓰이는 상하한은 명세의 별도 wire 규칙이 아닌 이 구현의 내부 정밀도 계약입니다. 현재 `positive_bounds`의 세 입력 폭이 동일한 `ratio`를 사용하고, 유효숫자 반올림이 하한에서는 아래쪽·상한에서는 위쪽을 향하는지 소스와 독립 교차 곱으로 확인했습니다.

새 u512/u1024 극값 회귀는 네 유효숫자 정밀도마다 매우 작거나 큰 비율·최대값 인접·중간 경계 양옆의 분수와 그 제곱을 u4096 정확 정수식으로 감싸는지 검사합니다. 각 입력 폭의 영 분자·분모 거부도 포함합니다. Debug·ReleaseSafe·ReleaseFast에서 이 신규 테스트와 기존 u256 집중 필터는 각각 root 포함 3/3, 작은 분수의 거듭제곱 필터는 각각 2/2 통과했습니다. 현재 `zig build test --summary all`은 종료 코드 0, 5/5 단계·2,656/2,656 테스트로 통과했고 ReleaseSafe 빌드·Zig 포맷 검사도 통과했습니다. 이 전체 테스트는 당시 별도 WASM audit의 20/20 단계·checks 수를 다시 실행한 것은 아닙니다. 아래 임시 WASM·오류 주입도 이번에 재실행하지 않았고 `/tmp` 감사 로그도 현재 없습니다. 새 입력 폭을 제품 JS API나 정규 WASM mode로 노출한 것은 아닙니다.

## 당시 검증 범위

네이티브 테스트는 1, 2, 3, 127/128/255비트 경계 및 u256 최댓값 이웃의 9×9 분수에 대해 네 정밀도와 지수 0..3을 검사합니다. 총 1,296개 구간의 양 끝점을 독립적인 u4096 정확한 정수 거듭제곱·교차 곱과 비교합니다. 양·음 shift, 올림 carry, 작은 분수, 최대 분수, 영 입력 거부를 포함합니다. 기존 작은 분수 거듭제곱 검사도 유지합니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 20/20 단계, 네이티브 531/531, WASM checks=6,519,806으로 통과했습니다. 로컬 로그는 `/tmp/hwpjs-icc-wide-positive-bounds-{Debug,ReleaseSafe,ReleaseFast}.log`이며 영구 산출물은 아닙니다. 기존 공개 API·WASM wire는 바꾸지 않았고 정규 WASM 검사 수는 이전과 같습니다. 신규 넓은 입력 검증은 아래 네이티브 회귀 및 별도 WASM 직접 대조로 구분합니다.

## 당시 적대적 오류 주입

제품 파일과 별개인 `/tmp` 복사본에서 다음 세 변형을 각각 적용하고 ReleaseFast의 신규 u256 테스트 한 개를 실행했습니다. 세 경우 모두 컴파일 성공 후 TestUnexpectedResult로 실패했습니다: 상한의 나머지 올림 삭제, 하한에도 나머지 올림 적용, 음수 s에서 분모 이동 누락. 출력 구간이 참값을 감싸는 방향과 큰 비율의 음수 shift 경로를 테스트가 실제로 검출합니다. 변형을 제품에 적용하지 않았습니다.

변형 없는 두 positive_bounds 테스트는 ReleaseSafe·ReleaseFast 각각 2/2 통과했고, 전체 Debug 네이티브는 531/531 통과했습니다. 전체 WASM 회귀 감사는 별도이며 이 단독 실행을 전체 감사 완료로 세지 않습니다.

## 당시 넓은 입력의 WASM 직접 대조

변형 없는 positive_bounds를 임시 독립 probe로 컴파일한 ReleaseFast WASM에서도 u256 분자·분모를 직접 전달했습니다. probe는 초기 분수의 두 끝점을 1024비트 significand와 signed 64비트 exponent로 반환하고, JS BigInt 교차 곱으로 하한≤n/d≤상한 및 significand 정규화 범위를 검사했습니다. 네 정밀도에서 경계 81쌍과 고정 seed 0x82b38ab1의 xorshift(13,7,17) u256 난수 1,000쌍, 총 4,324개 구간이 통과했습니다. 매 좌측 shift 후 256비트 mask를 적용하고 영 난수는 1로 치환했습니다.

이 수치는 전체 audit의 checks에 합산하지 않는 수동 검사입니다. 정규 회귀 테스트의 넓은 입력/거듭제곱 검사는 positive_bounds_tests.zig가 소유합니다. 제품 JS API나 정규 probe mode는 추가하지 않았습니다.
