# ICC 512비트 목표값의 활성 근 위치

## 계약과 범위

[ICC.1:2022 §10.18 Table 68·Annex F.1](https://www.color.org/specification/ICC.1-2022-05.pdf)은 파라메트릭 곡선의 분기식과 1차원 역상 선택 조건을 규정합니다. 아래의 512비트 목표·1024비트 기호근 위치는 프로젝트 내부 표현이며, 활성 근 위치만으로 전체 곡선의 역변환 조건이 충족되었다는 뜻은 아닙니다.

`normalized_root_location.Wide.locate(precision, root, a, b, interval)`는 u1024 radicand를 가진 근이 `(a*x+b)/65536`을 통해 주어진 u64 유리수 구간의 어디에 놓이는지 판정합니다. [1024비트 근 비교](icc-extended-root-compare.md)를 사용하며 기존 absent/start/interior/end/singleton/entire/undecided를 반환합니다. x의 근삿값을 만들거나 근을 좁히지 않습니다.

`normalized_level_locations.inspectWide(precision, curve, n, d)`는 u512 정규화 목표값을 검증하고 전체 곡선의 정의역을 확인한 뒤 활성 상위 거듭제곱 분기의 근과 위치를 수집합니다. 반환값은 inactive/entire/roots이고 최대 두 근을 보존합니다. inactive에서도 d=0 또는 n>d를 거부합니다. 근 배열 순서는 생성기의 양수·음수 순서이며 x 오름차순이 아닙니다.

g=0의 all_nonzero를 entire로 바꾸는 것은 전체 정의역 검사 후에만 가능합니다. 밑 0에서 정의되지 않는 곡선은 이 변환으로 통과하지 않습니다. 상수 밑이 근과 같으면 entire이고, 기울기가 있는 닫힌 단일점은 singleton입니다. 열린 단일점은 EmptyIccInterval입니다. 한 끝점이 미확정이어도 다른 끝점에서 부재가 증명되면 absent가 가능하며, 나머지 미확정은 undecided로 남습니다.

## SSOT

끝점 포함·기울기 방향·상수·단일점·미확정 정책은 기존 affine_root_location.With가 소유합니다. 새 경로는 comparator 어댑터만 주입합니다. affine_value는 정확한 밑 좌표 구성을 계속 소유하며 기존 i128/u128 결과를 i1024/u1024로 손실 없이 승격합니다.

normalized_level_locations의 inspectFor가 기존/새 목표 폭의 검증과 분기 조립을 공유하고, power_location_set.Of가 absent 제외·undecided 보존·entire 승격을 공유합니다. 파라미터별 정의역/활성 시작은 parametric_segments, 목표 유효성은 fraction, 근 생성은 normalized_power_level이 소유합니다. 전체 곡선의 단조성이나 역변환 가능성은 위치 판정 성공으로 대체하지 않습니다.

## 테스트 인터페이스

테스트 mode223은 188바이트 BE입니다: precision u32, g/offset i32, n/d u512, root index u32, a/b i32, 끝점 flags u32, start/end 각각 n/d u64. 출력은 Location u32 LE입니다. all_nonzero를 단일 근으로 선택하면 NonIsolatedIccPowerRoot입니다.

mode224는 precision u32+n/d u512의 132바이트 뒤 para 태그를 받습니다. 출력은 기존 mode198과 같은 kind/count 및 항목당 location/sign 8바이트입니다. 두 모드는 기존 probe의 폭별 공통 파싱·정밀도 dispatch·출력 코드를 사용합니다. 기존 mode197/198 wire와 공개 제품 JS API는 유지합니다.

## 독립 검증과 발견된 테스트 누락

JS 기준은 BigInt 목표 차이와 정확한 정수 거듭제곱 교차 곱으로 끝점 대소를 계산합니다. 제품 위치 판정/상하한 함수를 기대값에 사용하지 않습니다. 최대 u512 분모의 0·1/max·중간·(max−1)/max·1 목표, 음의 기울기·상수·열린 단일점, 다섯 곡선 유형, 비활성 분기의 잘못된 목표, 두 근·g=0 정확한 값의 ±1 이웃, Pell 미확정과 높은 정밀도 분리, 잘림·한도·오류 후 복구를 확인합니다.

Debug 직접 대조는 locations=1,743, curves=734, rejected=2,389, undecided=1로 통과했습니다. 기존 경로도 locations=10,300, curves=1,745, rejected=5,684, undecided=1로 통과했습니다. 미확정→absent, 두 번째 근 제거와 count/길이 축소, 열린 끝점 강제 포함, entire→singleton의 네 변형을 모두 ERR_ASSERTION으로 검출했습니다.

다섯 번째 소스 변형은 임시 복사본 `/tmp/hwpjs-extended-locations-mutant.f0103F/icc`에서 음의 기울기의 대소 반전을 제거했습니다. 최초 신규 네이티브 테스트는 음의 기울기의 정확한 시작점만 확인했기 때문에 이 변형을 놓쳤습니다. 부호 반전에 민감한 내부 근 사례를 추가했습니다. 이는 제품 로직의 발견된 오류가 아니라 네이티브 테스트의 위치 편향 보완입니다. 보강 전 Debug audit는 최종 검증 근거로 사용하지 않습니다.

보강 후 임시 변형은 Debug/ReleaseSafe/ReleaseFast 모두 `.interior` 대신 `.absent`를 반환하여 4개 중 1개 테스트가 실패했습니다. 같은 보강 테스트의 정상 제품 소스는 세 모드 모두 4/4 통과했습니다. 임시 변형은 제품에 적용하지 않았습니다.

시스템 ICC 5개 프로파일의 실제 para 태그 15개에서 넓은 목표 0/1에 대응하는 밑 근 z=0/1을 사용했습니다. 정확한 x=(65536*z−b)/a와 활성 시작/끝을 독립 정수 교차 곱으로 비교한 30건에서 mode224의 근 존재·위치·부호·길이가 일치했습니다. 읽기 전용 수동 검사이며 정규 audit 횟수에 포함하지 않습니다.

## 최종 회귀 결과

보강된 테스트를 포함한 Debug 최종 감사와 ReleaseSafe/ReleaseFast 감사가 모두 종료 코드 0, 20/20 단계, 네이티브 634/634, WASM checks=6,924,457로 완료됐습니다. 이전 6,919,590에 신규 4,867회 호출이 추가됐습니다. 최종 Debug 로그는 `/tmp/hwpjs-extended-locations-Debug-final.log`, Safe/Fast는 `/tmp/hwpjs-extended-locations-{ReleaseSafe,ReleaseFast}.log`입니다. 임시 로컬 로그이며 보강 전 Debug 로그와 구분합니다.

최종 Debug 및 Safe/Fast 실제 audit WASM의 직접 대조와 입출력 변형 4종도 동일하게 통과했습니다. 소스 변형은 보강된 네이티브 테스트로 세 모드 모두 검출했습니다. 주제 문서 로컬 링크 7개, Zig 포맷, 변경 JS 문법과 diff 공백을 확인했습니다. 구간 규칙·근 수집·분기 조립을 공유하며 테스트 기대값은 독립 BigInt 계산을 유지합니다.

위의 세 모드 전체 감사·변형 실험·시스템 프로파일 대조는 최초 구현 시점의 기록입니다. 인용된 `/tmp` 최종 로그와 임시 변형 소스는 현재 존재하지 않으며 아래의 재검증 결과와 구분합니다.

## 남은 구현

이 계층은 클리핑 전 상위 거듭제곱 분기의 근 위치만 소유합니다. 출력 0/1의 평탄 구간은 [넓은 클리핑 역상](icc-extended-power-preimage.md), 하위 선형 분기와의 합집합은 [넓은 전체 역상](icc-extended-parametric-preimage.md), 최근접 출력과 F.1 선택은 [넓은 최근접 출력](icc-extended-parametric-nearest.md)·[넓은 파라메트릭 역변환](icc-extended-parametric-inverse.md), TRC 조립은 [확장 TRC 역변환](icc-extended-trc-inverse.md)이 각각 별도로 다룹니다. 당시 후속 범위였다는 기록과 현재 다른 계층의 구현을 구분합니다. 이 위치 결과만으로 렌더링·전체 ICC/HWP/HWPX 검증이 완료되지는 않습니다.

## 2026-09-27 문서 재검증

현재 `normalized_root_location.Wide`는 공유 `affine_root_location.With`에 1024비트 비교기의 `Wide.at`을 주입합니다. `normalized_level_locations.inspectWide`는 `inspectFor`를 통해 목표 선검증·전체 curve 조립·활성 거듭제곱 분기 선택을 공유하고, `power_location_set.Of`가 부재 제외·미확정 보존·전체 해 승격을 소유합니다. 정확한 밑 좌표는 `affine_value.at`에서 i128/u128로 만든 뒤 넓은 비교 입력으로 손실 없이 승격합니다. 이 계층이 넓은 x의 단일 정확 좌표를 생성하지는 않습니다.

Debug·ReleaseSafe·ReleaseFast의 `extended locations`·`extended active levels`·`extended constant branch` 집중 필터는 각 모드 root 포함 3/3·2/2·2/2 통과했습니다. 현재 ReleaseFast 테스트용 WASM의 mode223/224 독립 BigInt 대조는 locations=1,743·curves=734·rejected=2,389·undecided=1로 일치했습니다. 같은 제품 코드로 앞 문서 검증에서 실행한 전체 `zig build hwp5-audit -Doptimize=ReleaseFast --summary all`은 10/10 단계·WASM checks=8,905,855였으며 이 두 모드만의 건수가 아닙니다.

후속 계층의 현행 연결은 ReleaseFast에서 클리핑 역상 5/5, 전체 분기 역상 6/6, 최근접 출력 6/6, 전체 역변환 4/4, TRC 4/4 집중 테스트로 확인했습니다. 이 확인만으로 후속 문서 전체를 승인하지 않습니다. 과거 Debug·ReleaseSafe 전체 감사·변형 주입·시스템 프로파일 30건은 이번에 재실행하지 않았고, 실제 색상 변환·표시 동치도 증명하지 않습니다.
