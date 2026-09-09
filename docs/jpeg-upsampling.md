# 성분 평면 업샘플링

## 좌표 계약과 명세 경계

[ITU-T T.871](https://www.itu.int/rec/T-REC-T.871-201105-I/en) 9절의 공식 PDF를 확인했습니다. 이 절의 첫 샘플 중심 offset은 실제 reference/source 치수 비율의 절반에서 0.5를 뺀 값입니다. `sample_axis.Axis.fromDimensions`는 이 정의의 역변환으로 reference 좌표의 source 위치를 정수 분수로 계산합니다. 이미지 치수는 JPEG의 nonzero u16 범위이며 source가 reference보다 크면 거부합니다.

이름 그대로 **실제 치수 비율**을 사용하는 진입점입니다. T.81 프레임의 Hi/Hmax·Vi/Vmax를 숨은 대체값으로 쓰지 않습니다. 예를 들어 reference=5/source=3에서 x=1은 source 위치 0.4이지만, 2:1 샘플링 인자 기반 중심 좌표는 0.25입니다. 홀수 치수의 두 관례를 동일하다고 주장하지 않습니다. 샘플링 인자 기반 별도 재구성 정책이나 한글/libjpeg 출력 일치 정책을 이 진입점의 성공으로 인증하지 않습니다.

명세가 샘플 위치를 정하는 것과 재구성 필터를 선택하는 것은 별개입니다. 이번 구현은 경계에서 가장 가까운 샘플을 반복하는 정책을 사용하며, `Sampler.fromDimensions` 호출자는 `nearest` 또는 `bilinear`를 명시적으로 선택해야 합니다. 이를 명세의 유일한 보간 알고리즘으로 주장하지 않습니다.

## 책임·소유권·정수 범위

- `sample_axis.zig`: 축 좌표, lower/upper 인덱스, upper 가중치/분모 및 nearest half tie의 높은 인덱스 선택을 소유합니다. reference 밖 u32 좌표에는 null을 반환합니다. 끝 샘플 중심 밖은 경계 복제로 처리합니다.
- `sample_interpolation.zig`: 네 u16 샘플의 bilinear 합을 계산하고 두 축 합성 뒤 한 번만 half-up 반올림합니다. 중간 행을 먼저 정수로 반올림하지 않습니다. 유효한 축 가중치에서 분모는 최대 131070이고 두 축·샘플 곱의 합은 u64 안입니다.
- `upsampling.zig`: 불변 u16 성분 평면을 빌리는 Sampler입니다. 정확한 width×height 길이를 요구하고 축과 보간기를 조립합니다. 파일 압축·색 변환·픽셀 배열 할당은 하지 않습니다.

공개 구조체는 생성자가 만든 유효한 상태와 입력 수명을 유지해야 합니다. 조작한 가중치나 해제된 입력은 지원 계약이 아닙니다. u16 샘플의 비트 깊이 의미와 JPEG 성분의 원래 샘플링 인자 보존은 기존 성분 평면 계층이 소유합니다. 이 모듈은 입력을 임의로 8비트로 잘라내지 않습니다.

## 검증 기록

네이티브는 모든 u16 reference 치수의 identity/single-source·최대 u32 좌표, reference 1~128의 모든 source/좌표, 홀수 비율, 한 번 반올림, 최대 분모와 모든 u16 상수 샘플, 코너/축/보간 방법·입력 차용·길이·downsampling 거부를 검사합니다. 적대적 검토에서 네이티브의 정사각형 편향을 발견하여 3×2와 2×3의 비균일 평면 identity를 두 방법 모두 추가했습니다. 기존 WASM에는 이미 비정사각형 조합이 있었지만 네이티브 행 간격 오류도 직접 검출하도록 보강했습니다.

테스트용 mode 269는 reference/source/u32 좌표의 8바이트 행을 받아 5개 u32(lower/upper/weight/denominator/nearest)를 반환합니다. mode 270은 source/reference 치수·방법·u16 샘플을 받고 reference 격자의 u16 샘플을 반환합니다. 제품 JS API가 아닙니다.

`tests/hwp5/jpeg-upsampling.mjs`는 공식 중심 좌표를 직접 역산해 축을 대조하고, bilinear는 네 모서리의 BigInt 가중합을 한꺼번에 계산합니다. 제품의 두 행 중간 합 계산과 별개입니다. Debug에서 비교 2,307건·거부 287건·축 좌표 5,821,821개가 통과했습니다. reference 1~256의 모든 source/좌표, 모든 u16 reference의 경계/중앙 좌표, 1~8의 source 가로/세로와 여러 reference 크기, 비정사각형·65535 경계·잘림·방법 바이트·출력 한도를 포함합니다. 출력 200바이트 개별 XOR 1 변조도 검출했습니다.

실제 HWP의 순차 JPEG 참조 7건에서 기존 독립 평면 검증을 먼저 통과시킨 후 새 샘플러를 두 방법으로 대조했습니다. 방법별 reference 샘플 수는 borderfill 450000, noori 순차 17145, sample-5017-pics 두 참조 각 450000, sample-5017 450000, shapecontainer-2 104160, shapepict-scaled 450000입니다. Progressive 참조 1건의 픽셀 복호화는 보류합니다. 참조 수는 고유 이미지 수가 아니며, 결과는 개별 성분이고 RGB 렌더링 또는 한글 출력 일치 검증이 아닙니다.

직사각형 보강 후 JPEG 네이티브 105/105개가 다시 통과했습니다. ReleaseSafe와 ReleaseFast WASM에서도 각각 비교 2,307건·거부 287건·축 좌표 5,821,821개, 출력 200바이트 개별 변조 검출 및 위 실 HWP 성분 대조가 통과했습니다.

`/tmp/hwpjs-upsampling-mutants.OfISLU/`의 별도 소스 복사본에서 좌표 중심의 +1 누락, nearest의 >=를 >로 변경, 행 간격에 높이 사용, 가로 보간 뒤 중간 반올림을 각각 주입했습니다. 모든 변형은 세 모드 모두 컴파일 후 테스트 실패로 검출했습니다. JPEG 105개 중 각각 4/2/1/1개가 실패했습니다. 행 간격 변형의 검출에는 보강한 비정사각형 네이티브 사례가 직접 기여했습니다.

직사각형 테스트 보강 후 전체 회귀를 Debug → ReleaseSafe → ReleaseFast 순서로 다시 완료했습니다. 각 모드 모두 20/20 단계, 네이티브 821/821개, checks 7,659,485건이 통과했습니다. 로그는 `/tmp/hwpjs-upsampling-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 중단한 보강 전 실행은 성공 근거에 포함하지 않습니다.

SSOT 검토에서는 좌표·가중치가 `sample_axis.zig`, bilinear 반올림이 `sample_interpolation.zig`, 평면 길이와 인덱싱이 `upsampling.zig`에 분리되어 있고, 테스트 bridge가 좌표나 보간 공식을 복제하지 않는 것을 확인했습니다. 검사 수는 전체 포맷 지원률이나 한글과의 픽셀 일치 증명이 아닙니다. 이후의 명시적 JFIF 파일 연결은 [RGB 샘플 조립](jpeg-rgb.md)이 소유하며 일반 메타데이터 자동 선택·색 관리는 별도입니다.
