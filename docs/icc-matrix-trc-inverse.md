# Matrix/TRC 역방향 연결

## 공식 순서와 현재 입력 범위

[ICC.1:2022 Annex F.3 식 F.7~F.16, PDF 116쪽](https://www.color.org/specifications/ICC.1-2022-05.pdf#page=116)을 확인했습니다. 먼저 상대 XYZ에 역행렬을 적용하고, 각 선형 RGB 값을 0~1로 제한한 뒤 해당 채널 TRC 역함수에 전달합니다. XYZ 자체를 먼저 제한하거나 최종 장치값을 무조건 0/1로 대체하지 않습니다. 평탄 TRC의 0/1 역상은 장치 좌표 0/1과 다를 수 있습니다.

`matrix_trc_inverse.evaluateFixed(precision, model, xyz)`는 signed 16.16 실제 XYZ 입력을 받습니다. unsigned 16비트 PCSXYZ 인코딩과 다른 계약이며, 그 인코딩을 그대로 전달하면 안 됩니다. 기존 고정소수점 행렬 역변환을 조립한 진입점입니다. 임의 분수 XYZ·부동소수점 입력 및 순방향의 i256/u256 결과를 직접 받는 경로는 아직 구현하지 않았고, 전체 정밀도 왕복 완료를 주장하지 않습니다.

## 책임과 소유권

- `matrix3_transform.inverse`가 기존 행렬식 계산과 정확한 signed i128/u128 결과를 소유합니다. 특이행렬 오류를 그대로 전파합니다.
- `linear_rgb_target.normalize`가 선형 분수의 범위 제한과 below/none/above 진단을 소유합니다. 분모 0은 부호 검사 전에 거부하며, 최대 u128 분모를 signed로 변환하지 않습니다. 내부 값과 정확한 경계 0/1은 원래 분수를 보존합니다.
- `matrix_trc_inverse`는 RGB 순서대로 [공통 TRC 역변환](icc-trc-inverse.md)을 호출합니다. 역행렬 계산이나 감마·평탄부 규칙을 복제하지 않습니다.
- `matrix_trc_inverse_types`가 잘라내기 전 선형 값, 채널별 clipping과 역변환 결과, 의미/우선순위 보류 플래그를 소유합니다.

selected·ambiguous·unattained·undecided를 채널별로 유지합니다. 앞 채널의 모호성 때문에 뒤 채널 검증을 생략하지 않으며, 계산 오류는 평가 전체의 오류로 전파합니다. 결과는 값 타입이고 별도 할당하지 않습니다. sampled 원본은 기존 Model처럼 호출 중 유효한 프로파일 바이트를 빌립니다. 계산 성공으로 프로파일 의미나 LUT 우선순위 검증을 해소하지 않습니다.

## 검증 진행

신규 네이티브 4개가 통과했습니다. 최대 u128 분모·최소 i128 분자, 분모 0, 정확한 경계, 비대칭 행렬의 혼합 후 clipping, 원래 signed 선형값 보존, 음수 행렬식, 채널별 sampled/gamma/identity, 양 끝 plateau, 모호성과 미도달 동시 보존, 뒤 채널 오류 및 특이행렬 거부를 확인했습니다.

전체 네이티브 회귀는 5/5 단계, 606/606 테스트로 통과했습니다. Zig 포맷·diff 공백과 관련 문서 로컬 링크 5개도 확인했습니다.

## WASM 연결과 독립 대조

테스트 mode 215는 precision u32와 XYZ i32 3개의 big-endian 16바이트 접두사 뒤 실제 ICC 프로파일을 받습니다. 기존 tag_table.parse와 matrix_trc_model.assemble을 거치므로 태그 저장 순서와 RGB 순서는 별개입니다. 결과의 처음 96바이트는 보류 플래그 8, 원래 선형값 i128×3/u128 64, clipping u32×3 12, 채널 payload 길이 u32×3 12바이트입니다. 뒤에 RGB payload를 순서대로 붙입니다.

TRC 결과 serializer를 테스트 전용 icc-trc-inverse-output으로 분리하고 기존 mode 213/214도 재사용합니다. 기존 wire를 바꾸지 않으며 selected는 상태 5와 92바이트 좌표, 나머지는 기존 최근접 출력 serializer를 사용합니다. 중간 payload 할당 실패 시 이미 성공한 payload만 해제하고 table도 defer로 해제합니다. 최종 버퍼는 할당 뒤 모든 바이트를 씁니다.

Debug WASM 직접 실행에서 정상 비교 3,331건·오류 거부 1,099건이 통과했습니다. 네 정밀도·채널별 identity/sampled/gamma/parametric 64조합, 비대칭·음수 행렬식·큰 곱 상쇄 행렬, 무작위 i32 행렬 256개, signed 극값 XYZ, 특이행렬, 프로파일 잘림·입력 제한·잘못된 정밀도와 오류 후 복구를 포함합니다. 독립 기대값은 유리수 가우스 소거로 구하며 제품의 Cramer 계산을 재사용하지 않습니다. sampled는 독립 선분 교차 oracle로, 제곱 곡선은 정확한 기호적 sqrt 표현으로 대조합니다.

한 결과의 RGB에 ambiguous/unattained/selected가 동시에 있는 경우를 확인하고, 모호성 payload의 두 출력 0/1과 상위 증거점 1/2도 대조합니다. 앞 채널 모호성과 별개로 뒤 채널의 gamma 0 오류가 전파되는 것도 검사합니다. serializer 분리 뒤 기존 TRC 검사 765건이 그대로 통과했습니다.

clipping 진단 삭제·signed 선형값 0 대체·첫 두 채널 payload 교환·의미 보류 플래그 삭제의 네 가지 출력 변형을 각각 ERR_ASSERTION으로 검출했습니다. 임시 소스 복사본 `/tmp/hwpjs-model-inverse-mutant.5JhHSy/icc`에서 XYZ를 역행렬 계산 전에 0~1로 제한하도록 변형했습니다. Debug·ReleaseSafe·ReleaseFast 모두 네이티브 테스트 4개 중 2개가 TestExpectedEqual로 실패하여 잘못된 처리 순서를 검출했습니다. 제품 원본은 변형하지 않았습니다.

전체 세 빌드 모드 audit 결과와 남은 범위는 아래 최종 확인에서 구분합니다. 제품 JS API·픽셀 렌더링·전체 HWP/HWPX 문서 검증 완료를 의미하지 않습니다.

추가 Debug WASM 수동 검사에서는 XYZ/TRC 태그 6개의 저장 순서 720개 순열을 모두 적용했습니다. 항등 행렬과 서로 다른 identity/sampled/gamma 채널의 선형값 및 역상을 각각 독립 기대 분수와 비교해 전부 일치했습니다. 정규 audit 수에 합산하지 않습니다.

## 실제 ICC 프로파일 대조

macOS ACESCG Linear·DCI(P3) RGB·Display P3·ITU-2020·ITU-709·ROMM RGB 원본 프로파일을 읽기 전용으로 mode 215에 전달했습니다. XYZ 입력은 영벡터·단위벡터·서로 다른 중간값·음수/범위 초과·i32 극값의 5종입니다. 행렬은 태그 서명별로 독립 조립하고 가우스 소거 결과와 linear/clipping을 대조했습니다. 반환 좌표는 끝점/항등의 정확 분수, 하위 선형 방정식, 상위 기호적 거듭제곱 근의 분수·지수·affine 계수로 검사했습니다.

type3 곡선의 분기 양옆 순서는 부동소수점이 아닌 BigInt로 판정했습니다. D=65536², N=a×d+b×65536, L=c×d, g/65536=p/q(약분)일 때 N^p×D^q와 L^q×D^p를 비교했습니다. 이 6개 프로파일은 양의 분기 기울기·지수 조건을 별도로 확인했으며 ITU-709/ROMM RGB는 아래로 점프하여 전체 비단조입니다. 이 두 프로파일의 10건은 NonMonotonicIccCurve로 거부됐고 나머지 20건은 정확한 결과와 일치했습니다. 이 수동 30건은 정규 audit에 합산하지 않으며 OS 색상 엔진의 보정·렌더링 일치를 뜻하지 않습니다.

## 최종 확인과 남은 범위

Debug·ReleaseSafe·ReleaseFast 전체 audit는 `/tmp/hwpjs-model-inverse-{Debug,ReleaseSafe,ReleaseFast}.log`에서 모두 종료 코드 0, 20/20 단계, 네이티브 606/606, WASM checks=6,620,065로 통과했습니다. 기존 6,615,635에 신규 4,430건이 추가됐습니다. ReleaseSafe·ReleaseFast 실제 audit 산출물을 직접 실행한 결과도 신규 비교 3,331/거부 1,099, 기존 TRC 765건이 일치했고 네 가지 출력 변형을 모두 검출했습니다.

최종 적대적 검토에서는 역행렬 이후에만 범위 제한 적용, 정확한 0/1과 범위 밖 진단 구분, clipping 뒤에도 평탄 TRC 역변환 호출, 양수 분모와 i128/u128 변환 경계, RGB별 결과 보존 및 후속 오류 전파, borrowed profile 수명, 중간 할당 실패 시 해제, 채널 길이 합과 출력 전체 초기화를 확인했습니다. 추가 결함은 발견하지 못했습니다. Zig 포맷·변경 JS 문법·diff 공백 및 관련 로컬 문서 링크 5개도 확인했습니다.

현재 완료 범위는 signed 16.16 XYZ 입력의 모델 역방향 연결입니다. 임의 정밀도 분수 입력과 순방향의 넓은 분수 결과를 직접 받아 수행하는 왕복, PCSXYZ wire 변환, LUT 우선순위·전체 프로파일 의미 검증, 픽셀 렌더링 및 전체 HWP/HWPX 문서 검증은 아직 남아 있습니다.
