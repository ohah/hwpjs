# ICC 512비트 목표값의 거듭제곱 기호근

## 범위와 계약

`normalized_power_level.solveWide(g, offset, n, d)`는 u512 정규화 목표값에 대해 `z^(g/65536)+offset/65536=n/d`의 밑 변수 z의 실근을 반환합니다. 기존 [u128 목표값 경로](icc-normalized-power-level.md)와 부호·해 개수·역지수 규칙을 공유합니다. 넓은 [gamma 역상](icc-gamma-wide-inverse.md)에 이어 일반 parametric 역변환을 준비하는 기반이며, 아직 전체 곡선 역변환은 아닙니다.

`n>d` 또는 `d=0`은 공통 Normalized 검증에서 `InvalidIccCurveCoordinate`입니다. 이후 `N=65536*n-offset*d`, `D=65536*d`를 i1024/u1024로 계산합니다. i32 offset과 u512 입력에서 |N|<2^544, D<2^528이므로 중간 계산까지 손실 없이 들어갑니다. 목표 입력 폭인 512비트로 중간 결과를 자르지 않습니다.

`Wide.Solutions`는 `all_nonzero` 또는 최대 두 근의 `finite`입니다. 비영 근은 부호와 `(|N|/D)^(p/q)`를 보존하며 p는 ±65536, q는 abs(g)입니다. g의 i32 최솟값도 q=2147483648로 보존합니다. 두 근이면 양수·음수 순서이며 x 좌표순이 아닙니다. 영점은 별도 태그이고 count 밖 슬롯은 읽지 않습니다. g=0에서 N/D=1이면 모든 비영 실수 밑이 해이고, 이것은 모든 x가 해라는 뜻이 아닙니다.

비정수 지수에서 음수 밑을 제외하는 기존 실수 거듭제곱 도메인 정책을 유지합니다. 기호식 생성에는 실제 거듭제곱 계산, 부동소수점 근사, 약분이나 양자화를 사용하지 않습니다. radicand와 근 자체는 [0,1]을 벗어날 수 있습니다.

## 책임 분리

- `normalized_power_level_types.Of`는 목표 폭별 중간 정수·Radical·결과 타입을 소유합니다.
- `normalized_power_level.solveFor`는 두 공개 진입점의 검증·정확한 offset 이동·결과 조립을 공유합니다.
- `power_level_shape`는 두 폭에서 같은 내부 분기로 해의 부호·개수·역지수를 판정합니다.
- `power_radical.Of(1024)`는 기존 공통 Reciprocal 검증을 사용합니다. descriptor 검증은 특정 곡선의 해임을 증명하지 않습니다.

기존 solve/Root 별칭과 76바이트 테스트 wire는 유지합니다. 테스트 serializer는 폭만 매개변수화하고 JS 기준은 제품 serializer나 shape를 가져오지 않습니다. 코어는 할당하거나 입력을 변경하지 않습니다.

## 검증 인터페이스와 실측

테스트 전용 mode221은 g/offset i32 BE와 n/d u512 BE의 136바이트를 받습니다. 출력은 all_nonzero u32 LE·count u32 LE의 8바이트 헤더 다음 근당 268바이트입니다. 각 근은 sign i32, n/d u1024, p i32, q u32 순서이며 zero 슬롯은 전체 0입니다. 최대 출력은 544바이트입니다. 제품 JS API에는 노출하지 않습니다.

독립 JS BigInt 기준은 유리수 목표 차이와 지수 홀짝으로 해 집합을 계산하고 결과의 비율·부호·역지수를 대조합니다. i32 계수 극값, u512 최대 분모, g=0의 정확한 값과 ±1 이웃, 고정 seed 1,024개 넓은 목표값, 모든 입력 잘림 길이·과잉 바이트·한도·오류 후 복구를 포함합니다.

Debug 직접 실행은 comparisons=1,812, rejected=140으로 통과했습니다. 기존 normalized 경로도 comparisons=1,412, rejected=45, roots=1,198, bridges=350으로 통과했습니다. 출력에서 음의 근을 제거하면서 길이/count까지 맞추는 변형, radicand 상위 비트 잘림, all_nonzero를 빈 해로 바꾸는 변형, 역지수 분모 손상은 모두 ERR_ASSERTION으로 검출했습니다.

다섯 번째 오류 주입은 임시 소스 복사본 `/tmp/hwpjs-wide-power-mutant.GuDAkX/icc`에서 목표 차이의 offset 빼기를 더하기로 바꿨습니다. Debug/ReleaseSafe/ReleaseFast 모두 신규 네이티브 검사 4개 중 3개가 실패해 검출됐습니다. 제품에는 변형을 적용하지 않았습니다.

시스템 ColorSync의 DCI(P3) RGB·Display P3·ITU-2020·ITU-709·ROMM RGB 프로파일에서 실제 para TRC 태그 15개의 g/offset을 읽었습니다. 각 태그에 u512 최대 분모의 목표값 0, 1/max, floor(max/2)/max, (max−1)/max, 1을 적용한 75건의 해 집합·radicand 비율·역지수가 독립 기준과 일치했습니다. 읽기 전용 수동 검사이며 정규 audit 횟수에는 합산하지 않습니다. 프로파일 전체 역변환·활성 분기 포함·픽셀 또는 한글 렌더링 일치 검증은 아닙니다.

## 전체 회귀 검증 결과

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 626/626, WASM checks=6,918,492로 통과했습니다. 기존 6,916,540에 신규 1,952회 호출이 추가됐습니다. 로그는 `/tmp/hwpjs-wide-power-level-{Debug,ReleaseSafe,ReleaseFast}.log`이며 임시 로컬 산출물입니다. Safe/Fast의 실제 audit WASM을 직접 실행한 신규·기존 normalized 검사와 출력 오류 주입 4종도 같은 결과였습니다.

## 남은 구현

이 모듈은 밑 변수의 해 생성만 담당합니다. 유리수 밑 좌표와의 비교는 [1024비트 기호근 비교](icc-extended-root-compare.md)에 연결할 수 있습니다. 수치 평가, affine x 역변환, 활성 분기 포함 검사, 출력 클리핑, 최근접 출력 선택, 넓은 parametric/TRC 모델 조립은 후속 범위입니다. 기존 u256 근 비교기에 좁혀 전달하지 않습니다. 전체 ICC 렌더링이나 HWP/HWPX 문서 검증 완료를 뜻하지 않습니다.
