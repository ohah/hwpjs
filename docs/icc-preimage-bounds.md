# ICC 전체 역상의 경계와 도달 여부

## 계약

`parametric_preimage_bounds.solve(precision, curve, n, d)`는 전체 clip(f(x))=n/d 역상의 하한(infimum)과 상한(supremum)을 구합니다. 각 경계의 attained가 참일 때만 실제 최솟값·최댓값입니다. empty, undecided, bounds를 구분하며 원래 집합이나 경계 비교가 미확정이면 부분 경계를 반환하지 않습니다.

정확한 좌표는 u256 분수 또는 기호근과 affine 계수 a/b로 보존합니다. 기호근은 밑 z를 나타내며 x=(65536*z−b)/a입니다. 수치 근사로 바꾸지 않습니다. 전체 정의역·목표 입력 검증은 기존 전체 역상 solver가 먼저 수행합니다. 비단조 곡선도 해 집합의 경계는 구할 수 있으므로 단조성 제한을 추가하지 않습니다.

결과는 F.1 역함수 선택이나 역변환 적격성 판정이 아닙니다. 빈 역상을 최근접 출력으로 채우지 않으며, 최근접 출력의 존재 여부도 판정하지 않습니다. 예를 들어 하위가 0, 상위가 1인 점프 곡선의 0 역상 [0,1/2)는 upper=1/2, attained=false입니다. 이를 최댓값 1/2로 반환하거나 최솟값 0을 대안으로 선택하지 않습니다.

## SSOT와 파일 책임

[u512 목표의 확장 경계](icc-extended-preimage-bounds.md)는 기존 경로와 폭별 타입·경계 병합 구현을 공유합니다. 내부 병합 소유자는 `power_preimage_bounds_impl.zig`이며 `power_preimage_bounds.zig`는 폭별 별칭을 제공합니다.

후속 [도달 목표의 F.1(a) 선택](icc-parametric-attained-inverse.md)은 전체 곡선 검증과 경계 선택을 연결합니다. 최근접 출력 처리는 별도 미완료 범위입니다.

- `parametric_preimage_bounds_types.zig`: 외부 결과 타입과 좌표 표현.
- `parametric_preimage_bounds.zig`: 기존 전체 역상 호출과 두 분기의 경계 조립. 하위 분기의 모든 x가 상위 분기의 모든 x보다 작은 성질은 parametric_segments의 기존 분기 소유권을 사용합니다. 큰 선형 좌표를 u128로 줄이거나 기호근과 불필요하게 비교하지 않습니다.
- `power_preimage_bounds.zig`: factory가 생성한 완전한 power Set의 내부 경계 수집. 임의로 조작한 Set의 검증 API는 아닙니다. rational/root 비교는 기존 정확 비교 모듈을 재사용합니다. 같은 경계는 attained를 OR로 합치며, 구간에서 빠진 끝점을 equality point가 포함하는 경우를 보존합니다. start/end/singleton 위치 증거가 있는 근은 원본 유리수 끝점으로 표현합니다.

두 내부 모듈은 할당·파일 접근·부동소수점 계산을 하지 않습니다. 파라미터 검증·역상 생성·근 비교 규칙을 이 계층에 복제하지 않습니다. 테스트용 mode201은 제품 JS 공개 API가 아닙니다.

## 검증 진행

신규 네이티브 검사는 열린 상한과 빈 출력 틈, terminal 단일점, 세 분리 해, 음의 기울기의 두 근 순서, 클리핑 경계의 포함 정보 병합, 미확정 전파, 전체 정의역 오류, u128을 넘는 선형 좌표를 포함합니다. 독립 이차식 기준은 양·음 기울기 8개 × offset 9개 × 목표 3개, 총 216개 조합에서 원본 도메인 끝점과 ±sqrt(y) 해를 정확한 유리수로 열거해 경계를 대조합니다.

mode201 입력은 기존 목표/정밀도 36바이트와 para 태그입니다. 출력 status u32 LE는 0=empty, 1=undecided, 2=bounds입니다. 앞의 두 결과는 정확히 4바이트, bounds는 188바이트입니다. 각 경계는 92바이트로 tag u32, attained u32, payload 순서입니다. rational payload는 n/d u256 LE와 20바이트 0 패딩입니다. root payload는 공통 76바이트 근 wire와 a/b i32 LE입니다. 결과 버퍼를 할당한 이후 실패 가능한 작업은 없으며 모든 바이트를 초기화합니다.

JS는 정확한 BigInt 이차식 후보 열거와 독립 근 등식 비교를 사용합니다. 네 정밀도 128/256/512/1024에서 조합을 반복하며 열린 상한·빈 틈·terminal·분리 해·포함 정보 병합, 잘림·과잉·한도·잘못된 정밀도/목표/정의역·오류 후 복구를 확인합니다. 최초 직접 WASM 검사는 comparisons=885/rejected=58/undecided=1로 통과했고, 이후 큰 선형 좌표 검사 한 건을 추가했습니다. 최종 감사 수치로 이 초기 수치를 대체해야 합니다.

직접 WASM 출력에 열린 상한을 강제로 포함, 하한/상한 교환, undecided를 empty로 변경하는 세 변형을 적용했고 각각 ERR_ASSERTION으로 검출했습니다. 제품에는 변형을 남기지 않았습니다. 전체 세 모드 감사는 진행 중이며 아직 완료로 간주하지 않습니다.

큰 선형 좌표를 추가한 직접 Debug WASM 검사는 comparisons=886/rejected=58/undecided=1로 통과했습니다. 추가 WASM 호출은 총 945건입니다.

임시 소스 복사본에서 동일 경계의 attained OR 병합을 AND로 바꾸어 신규 네이티브 테스트를 실행했습니다. 6개 중 포함 정보 병합과 독립 이차식 대조 2개가 실패했고 종료 코드 1로 검출됐습니다. 제품 소스는 변형하지 않았습니다. 로그는 `/tmp/hwpjs-preimage-bounds-mutation-tie.log`입니다.

## 실제 ICC 태그 대조

시스템 DCI(P3) RGB·Display P3·ITU-2020·ITU-709·ROMM RGB의 RGB TRC para 태그 15개를 읽기 전용으로 검사했습니다. type0/type3, 양의 g/a, 단위 범위 내 분기 시작, type3 하위 기울기 0<c≤65536을 확인한 뒤 목표 0/1에서 상위의 정확한 근 x=(65536*y−b)/a 및 하위 원점을 독립적으로 구성했습니다. 30개 해 집합의 빈 여부·양 끝 좌표·도달 여부가 일치했습니다. 실제 HWP 문서 렌더링이나 전체 ICC 변환을 검증한 것은 아니며 이 수동 건수는 정규 audit 호출 수에 합산하지 않습니다.

## 최종 감사와 재검토

Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 종료 코드 0, 20/20 단계, 네이티브 558/558, WASM checks=6,558,415로 통과했습니다. 신규 945건이 이전 6,557,470건에 추가됐습니다. 각 신규 결과는 comparisons=886/rejected=58/undecided=1입니다. 로그는 `/tmp/hwpjs-icc-preimage-bounds-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 앞의 진행 중·초기 수치는 이력이며 최종 결과는 이 절을 기준으로 합니다.

ReleaseSafe·ReleaseFast 산출물 직접 실행도 같은 신규 수치로 통과했고 열린 상한을 강제로 포함시키는 변형을 각각 검출했습니다. 변경 Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 4개를 확인했습니다.

최종 적대적 재검토에서는 전체 입력/정의역 선행 검증, 미확정 시 부분 결과 비노출, 분기 순서 재사용, 음의 affine 기울기, 동일 경계의 포함 정보 OR 병합, terminal 좌표의 유리수 보존, u256 선형 좌표 유지, 결과 버퍼의 전체 초기화와 할당 후 오류 경로 부재를 확인했습니다. 이 범위에서 추가 결함은 발견하지 않았습니다. F.1 최종 선택·역변환 적격성·최근접 출력 존재 여부와 전체 HWP/HWPX 문서 검증은 여전히 미완료입니다.
