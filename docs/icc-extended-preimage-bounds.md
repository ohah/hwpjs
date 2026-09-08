# ICC 확장 역상의 경계와 근 순서

## 계약과 미완료 경계

`parametric_preimage_bounds.solveWide(precision, curve, n, d)`는 u512 목표의 전체 도달 역상에서 하한·상한과 각각의 attained를 반환합니다. 좌표는 u1024 유리수 또는 u1024 기호근과 affine 계수입니다. attained=false인 상한은 실제 최댓값이 아닙니다. empty·undecided·bounds를 구분하며 어느 단계라도 미확정이면 부분 경계를 노출하지 않습니다.

전체 정의역·목표 검증과 역상 생성은 [확장 전체 역상](icc-extended-parametric-preimage.md)이 소유합니다. 이번 확장은 F.1 역함수 값 선택·최근접 출력 선택·전체 ICC 역변환 완료를 의미하지 않습니다. 제품 JS API도 바꾸지 않습니다.

`normalized_root_order.Wide.compare`는 동일하게 인코딩한 지수 p/q의 근을 정확 비교합니다. 두 u1024 비율의 교차 곱은 u2048로 계산합니다. 음의 근·역수 지수는 순서를 뒤집고 `inAffine`은 음의 기울기에 대해 다시 뒤집습니다. zero는 지수와 무관하게 비교할 수 있지만, 두 nonzero의 지수가 다르면 부호가 달라도 IncompatibleIccPowerRoots입니다. 유효성 검사는 부호 단축보다 먼저 하며 기울기 0은 NonIsolatedIccAffineRoot입니다. 서로 다른 지수의 일반 근 비교 API는 아닙니다.

## SSOT와 파일 책임

[확장 도달 목표 선택](icc-extended-attained-inverse.md)은 이 경계를 사용해 전체 곡선 검증 이후 F.1(a)의 입력을 선택합니다. 경계 수집과 선택 정책은 별개입니다.

- `normalized_root_order.zig`: 기존·확장 근의 검증, 부호, 역수, affine 순서를 공유합니다. 곱의 폭만 다릅니다.
- `power_level.zig`: 고정 클리핑 수준 근을 기존·확장 타입으로 올리는 검증을 공유합니다. 확장한다고 원래 좁은 입력의 허용 범위를 넓히지 않습니다.
- `power_preimage_bounds_impl.zig`: factory가 생성한 완전한 power Set의 경계 수집·비교·병합을 소유합니다. 동일 경계의 attained는 OR로 병합하고 정확히 같은 유리수 표현을 우선합니다. 임의로 조작된 Set의 검증기는 아닙니다.
- `power_preimage_bounds.zig`: 폭별 별칭만 제공합니다.
- `parametric_preimage_bounds_types.zig`: 폭별 좌표·결과 타입을 정의합니다.
- `parametric_preimage_bounds.zig`: 두 분기의 전체 경계를 조립합니다. 하위 분기 x가 상위 분기 x보다 작은 기존 분기 소유권을 사용하므로 큰 선형 좌표와 기호근을 새로 비교하지 않습니다.

할당·부동소수점 근사·파일 접근은 코어에 없습니다. [기존 경계 API](icc-preimage-bounds.md)도 같은 병합 구현을 사용합니다.

## 독립 검사와 테스트 wire

mode229는 두 268바이트 BE 기호근과 i32 기울기, 총 540바이트를 받고 순서 -1/0/1을 i32 LE로 반환합니다. JS는 독립 BigInt 교차 곱과 부호·기울기로 기대값을 구합니다. 최대 u1024, 등가 비율, 임의의 전체 폭 비율, 곱을 좁히면 순서가 반전되는 h/(h+1) 대 (h-1)/h, 극단 지수·기울기, 잘림·과잉·잘못된 근·오류 후 복구를 검사합니다. 직접 결과는 comparisons=6,635, rejected=557입니다.

mode230은 precision+n/d u512의 132바이트 BE prefix와 para 태그를 받습니다. empty=0, undecided=1은 4바이트, bounds=2는 572바이트입니다. 284바이트 경계 둘은 tag·attained u32 LE 뒤 유리수 n/d u1024와 20바이트 패딩 또는 268바이트 근과 a/b i32 LE를 담습니다. 폭별 probe·endpoint serializer와 JS 검사기를 기존 mode201과 공유합니다.

독립 이차식의 정의역 끝점과 ±sqrt(y) 후보 열거로 하한·상한을 대조합니다. 열린 상한·빈 틈·마지막 단일점·세 분리 해·음의 기울기·포함 정보 병합·전체 폭 선형 좌표·축약하지 않은 512비트 목표·미확정 전파를 포함합니다. 기존 직접 결과는 886/58/1, 확장은 888/154/1(comparisons/rejected/undecided)입니다. 네이티브 전체 테스트는 657/657로 통과했습니다.

## 적대적 검사와 실파일

Debug WASM 출력에 경계 교환, attained 제거, undecided를 empty로 변경, 큰 좌표 잘림, 열린 경계 강제 포함, 근 순서 반전의 여섯 변형을 적용했고 모두 ERR_ASSERTION으로 검출했습니다. 제품에 변형은 남기지 않았습니다.

시스템 ICC 프로파일의 para TRC 15개를 읽기 전용으로 검사했습니다. type0/type3, 양의 g/a, a+b=65536, type3의 양의 하위 기울기·분기 시작과 접점의 양의 상위 밑, 하위 끝 출력이 1 미만임을 독립 확인했습니다. 이 조건 아래 목표 0/1의 역상은 각각 단일점 0/1입니다. u512 최대 분모로 표현한 두 목표에서 30개 결과의 양 끝 좌표·attained가 일치했습니다. 이는 실제 HWP 렌더링이나 임의 ICC 프로파일 전체 지원의 증거는 아닙니다.

임시 소스 복사본에서 attained OR를 AND로 바꾸자 Debug·ReleaseSafe·ReleaseFast 모두 네이티브 6개 중 2개가 실패했습니다. 별도로 근 비교 교차 곱을 u2048에서 u1024로 줄이자 Debug·ReleaseSafe는 정수 오버플로를, ReleaseFast는 기대 gt 대신 lt를 검출했습니다. 로그는 `/tmp/hwpjs-extended-bounds-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`와 `/tmp/hwpjs-extended-order-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 실제 소스는 수정하지 않았습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 657/657, WASM checks=6,955,401로 통과했습니다. 이전 6,947,166에 확장 경계 1,043회와 근 순서 7,192회, 총 8,235회 호출이 추가됐습니다. 로그는 `/tmp/hwpjs-extended-bounds-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

ReleaseSafe·ReleaseFast 실제 산출물의 신규 직접 대조도 각각 같은 수치로 통과했고 열린 경계 강제 포함 변형을 검출했습니다. 변경 Zig 포맷·JS 문법·diff 공백과 문서 로컬 링크 8개를 확인했습니다.

최종 재검토는 입력 선행 검증, 미확정 시 부분 결과 비노출, 분기 순서 소유권, 음의 근·역수·affine 기울기, 같은 경계의 attained OR, 정확한 유리수 끝점 우선, 교차 곱의 전체 폭, 출력 초기화·할당 후 오류 경로 부재를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 않았습니다. 확장 F.1 선택·최근접 출력·전체 ICC 역변환 및 전체 HWP/HWPX 문서 검증은 여전히 미완료입니다.
