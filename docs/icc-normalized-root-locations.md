# ICC 정규화 목표값의 활성 거듭제곱 근 위치

u512 목표값의 inspectWide와 u1024 근 위치 어댑터는 [넓은 활성 근 위치](icc-extended-locations.md)에서 관리합니다. 아래 기존 u128 경로와 구간 소유권·분기 조립 규칙을 공유합니다.

## 범위

[클리핑 후 거듭제곱 역상](icc-power-preimage.md)은 이 위치 결과와 클리핑 평탄 구간을 함께 보존합니다. 본 계층 자체는 원시 등식 근의 위치만 소유합니다.

[ICC.1:2022 §10.18 Table 68·Annex F.1](https://www.color.org/specification/ICC.1-2022-05.pdf)은 파라메트릭 곡선의 분기식과 1차원 역상 선택 조건을 규정합니다. 아래의 기호근 위치·끝점 열거형은 이를 다루는 프로젝트 내부 표현이며, 위치 판정만으로 Annex F.1의 전체 역변환 조건을 충족했다는 뜻은 아닙니다.

`normalized_root_location.locate(precision, root, a, b, interval)`는 [넓은 밑 근 비교](icc-normalized-root-compare.md)를 사용해 `(a*x+b)/65536=root`의 x 위치를 판정합니다. 입력 구간은 비어 있지 않은 u64 유리수 구간이며 기존 Location 열거형 absent/start/interior/end/singleton/entire/undecided를 공유합니다.

구간을 먼저 검증하고 시작 좌표를 비교합니다. a=0이면 상수 밑의 등식 여부로 entire/absent/undecided를 반환합니다. a≠0의 닫힌 단일점은 singleton 또는 absent이며, 일반 구간은 기울기 방향과 열린 끝점을 적용합니다. 한 끝점이 미확정이어도 다른 끝점이 범위 밖임을 증명하면 absent를 반환할 수 있습니다. 그렇지 않은 미확정은 그대로 남깁니다. x를 근사값으로 생성하지 않습니다.

`normalized_level_locations.inspect(precision, curve, n, d)`는 정규화 u128 목표 n/d를 먼저 검사한 뒤 전체 곡선 정의역 검사와 활성 거듭제곱 분기 조립을 수행합니다. 분기가 없으면 inactive, 분기 전체가 해이면 entire, 그 외에는 최대 두 기호근과 위치를 반환합니다. inactive에서도 잘못된 목표는 InvalidIccCurveCoordinate입니다. 근의 순서는 생성기의 양수·음수 순서이며 x 오름차순이 아닙니다.

이는 클리핑 전 상위 거듭제곱 분기만 검사합니다. 하위 선형 분기, 출력 0/1 클리핑 평탄 구간, 전체 역상 합집합·F.1 선택·가장 가까운 출력값 선택은 **이 모듈의 결과에 포함하지 않습니다**. 해당 책임은 [클리핑 역상](icc-power-preimage.md), [전체 분기 역상](icc-parametric-preimage.md), [최근접 출력](icc-parametric-nearest.md), [파라메트릭 역변환](icc-parametric-inverse.md)에 각각 분리되어 있습니다. 위치 결과는 전체 곡선의 역변환 가능성 증명이 아닙니다.

## SSOT와 책임

affine_root_location.With가 끝점 소유권·상수/단일점·기울기 방향·미확정 규칙을 한 번만 구현합니다. 기존 locate는 좁은 근 비교를, normalized_root_location은 넓은 근 비교를 주입합니다. 좁은 Root의 기존 검증 계약은 어댑터가 유지합니다.

power_location_set.Of는 결과 타입과 근 수집을 공유합니다. absent는 제외하고 undecided는 보존하며 entire를 발견하면 분기 전체 해로 승격합니다. all_nonzero→entire의 전제는 호출자의 전체 곡선 정의역 검사입니다. g=0의 밑 0이 포함된 곡선을 이 변환으로 통과시키지 않습니다. curve 정책은 parametric_segments/domain, 목표 검증은 fraction, 근 생성은 normalized_power_level이 소유합니다.

## 검증 진행

신규 네이티브 검사는 열린 시작/끝의 네 조합·기울기 반전, singleton과 상수 entire의 구분, 열린 단일점 거부, Pell 구간의 128비트 미확정/512비트 내부 판정, 넓은 radicand, 목표 1/3의 두 활성 근, 비활성 분기에서도 목표 검증, g=0 전체 해와 잘못된 정의역을 포함합니다. WASM 독립 대조·전체 감사·적대적 검증 결과는 아래에 구분합니다.

## WASM 계약과 독립 검증

테스트 mode197은 92바이트 BE 입력입니다: precision u32, g/offset i32, 목표 n/d u128, root index u32, a/b i32, 끝점 포함 flags u32, start/end n/d u64 순서입니다. flags는 bit0 시작·bit1 끝 포함이며 나머지를 거부합니다. 정확한 길이·한도·precision·근 index를 검증하고, 출력 u32 LE는 Location 값입니다. all_nonzero를 단일 근으로 선택하면 NonIsolatedIccPowerRoot입니다.

mode198은 precision u32 + 목표 n/d u128의 36바이트 뒤에 para 태그를 받습니다. 출력은 kind u32 LE(0 inactive, 1 entire, 2 roots), count u32 LE, 항목당 location u32·근 sign i32의 8바이트 요약입니다. 기호근 크기 wire 검증은 mode195가 소유하며 이 요약에 중복 직렬화하지 않습니다. 제품 JS API에는 노출하지 않습니다.

독립 JS는 목표 차이의 정확한 BigInt 분수와 기약 정수 거듭제곱 교차 곱으로 끝점 순서를 계산하고, 양 끝 포함 조건을 결합해 위치를 대조합니다. curve 정의역은 기존 독립 기준을 공유합니다. 제품의 상하한·완전근·위치 판정 함수를 기대값으로 사용하지 않습니다. 0/1/1/3 및 최대 u128 분모의 목표, 기울기 방향·상수·열린 단일점, 다섯 curve 유형의 활성/비활성 분기, 두 부호 근, Pell 미확정, 잘림·과잉·한도·precision·잘못된 목표·오류 후 복구를 포함합니다.

신규 Debug WASM 직접 검사는 locations=10300, curves=1745, rejected=5684, undecided=1로 통과했습니다. 네이티브는 540/540 통과했습니다. 최초 네이티브 실행에서 잘못 적은 예상 오류명 InvalidIccInverseTarget을 기존 공통 계약 InvalidIccCurveCoordinate로 수정했으며 제품 오류 정책은 바꾸지 않았습니다.

전체 Debug 예비 감사를 시작한 뒤 mode198 잘림·오류 입력과 상수 단일점 검사를 보강했습니다. 따라서 `/tmp/hwpjs-icc-normalized-locations-Debug.log`는 최종 검사 수의 근거로 사용하지 않으며, 최종 테스트 버전의 전체 모드 감사는 별도로 실행합니다.

오류 주입에서는 미확정 위치를 absent로 변경, 두 근 중 두 번째 항목을 제거하면서 count·길이도 축소, 열린 끝점을 모두 닫힌 끝점으로 변경하는 세 변형을 각각 ERR_ASSERTION으로 검출했습니다. 입력·출력 복사본에만 적용했으며 제품에는 변형을 남기지 않았습니다.

## 실제 프로파일 위치 대조

`/System/Library/ColorSync/Profiles`의 DCI(P3) RGB, Display P3, ITU-2020, ITU-709, ROMM RGB에서 type0/type3 para TRC 태그 15개를 읽기 전용으로 검사했습니다. 양의 g·양의 a·[0,1] 내 활성 시작값을 확인하고, 상위 출력 오프셋이 0인 두 유형에서 목표 y=0/1의 밑 근 z=0/1을 이용했습니다. 정확한 x=(65536*z−b)/a를 정수 교차 곱으로 활성 시작/끝과 비교해, mode198의 근 존재·위치·부호·출력 길이 30건이 일치함을 확인했습니다.

이 수동 검사는 전체 audit checks에 합산하지 않습니다. 실제 프로파일의 모든 목표값·클리핑 역상·전체 역변환이나 색상 렌더링 품질을 검증했다는 뜻은 아닙니다.

## 최종 감사와 재검토

Debug·ReleaseSafe·ReleaseFast 최종 audit가 각각 20/20 단계, 네이티브 540/540, WASM checks=6,539,502로 통과했습니다. 신규 locations=10300, curves=1745, rejected=5684, undecided=1의 합계 17,730건이 이전 6,521,772건에 추가됐습니다. 로컬 최종 로그는 `/tmp/hwpjs-icc-normalized-locations-{Debug,ReleaseSafe,ReleaseFast}-final.log`이며 임시 파일입니다. 보강 전 예비 Debug의 6,539,442건을 최종 수치로 사용하지 않습니다.

ReleaseSafe·ReleaseFast 산출물의 직접 검사도 동일한 신규 수치로 통과했고, 각 산출물에서 미확정을 absent로 바꾸는 변형을 검출했습니다. 변경 문서의 로컬 링크 14개, Zig 포맷·JS 문법·diff 공백 검사가 통과했습니다.

당시 최종 코드 재검토에서는 선행 구간/목표/정의역 검증, 상수 밑과 닫힌 단일점의 구분, 음의 기울기 순서 반전, 열린 끝점 소유권, 미확정 보존, count 내 초기화된 항목만 접근하는 수집기, 기존 좁은 근 계약의 보존을 확인했습니다. 당시 범위에서 추가 결함을 발견하지 않았습니다. 당시 미완료였던 클리핑 후 전체 역상과 역변환 선택은 현재 위의 별도 모듈에서 다루므로 이 기록을 현 지원 범위로 읽지 않습니다. 위의 전체 감사 수치와 `/tmp` 경로는 최초 구현 시점의 기록이며 현재 로그는 존재하지 않습니다.

## 2026-09-27 문서 재검증

현재 `normalized_root_location.locate`는 `affine_root_location.With`에 넓은 비교기를 주입합니다. 공유 위치기는 구간을 먼저 검증하고, 상수 밑·닫힌 단일점·기울기 방향·열린 끝점·미확정 전파를 구분합니다. `normalized_level_locations.inspect`는 목표를 먼저 검증한 뒤 전체 curve 조립을 거쳐 활성 거듭제곱 분기의 근만 `power_location_set.Of`로 수집합니다. `absent`를 제외하고 `undecided`는 보존하며, 분기 전체가 해인 경우만 `entire`로 승격합니다. 이는 Table 68/F.1의 전체 선택 알고리즘을 이 모듈 하나가 구현한다는 주장이 아닙니다.

Debug·ReleaseSafe·ReleaseFast에서 `zig test src/root.zig --test-filter 'normalized locations'`는 각 모드 3/3, `--test-filter 'normalized active levels'`는 각 모드 2/2 통과했습니다. 현재 ReleaseFast 테스트용 WASM의 mode197/198 독립 BigInt 대조는 locations=10,300·curves=1,745·rejected=5,684·undecided=1로 일치했습니다. 같은 제품 코드로 앞 문서 검증에서 실행한 전체 `zig build hwp5-audit -Doptimize=ReleaseFast --summary all`은 10/10 단계·WASM checks=8,905,855였으며, 이는 이 두 모드만의 호출 수가 아닙니다.

후속 계층의 기본 연결은 ReleaseFast에서 클리핑 역상 5/5, 전체 분기 역상 11/11(좁은 경로 5·확장 경로 5·root 1), 최근접 출력 10/10, 전체 역변환 7/7의 집중 테스트로 확인했습니다. 이 확인만으로 후속 문서 전체를 검증 완료로 세지 않습니다. 과거 Debug·ReleaseSafe 전체 감사·변형 주입·시스템 프로파일 30건은 이번에 재실행하지 않았으며, 모든 실제 ICC 프로파일과 HWP/HWPX 표시 동치도 증명하지 않습니다.
