# 넓은 선형 RGB 목표의 범위 제한

## 계약과 SSOT

`linear_rgb_target.Of(bits)`는 128·512비트의 signed 분자/unsigned 분모를 받아 기존 F.3 범위 제한 규칙을 공유합니다. 기존 Target/Result/normalize는 Of(128)의 별칭으로 유지합니다. Wide는 Of(512)이며 넓은 역행렬 출력의 정밀도를 줄이지 않습니다.

분모 0은 부호와 무관하게 InvalidIccMatrixCoordinate입니다. 음수 입력은 0/1과 below, 분자가 분모보다 크면 1/1과 above입니다. 나머지는 none이며 원래 분자·분모를 보존합니다. 정확히 0 또는 1인 입력도 약분하지 않고 원래 분모를 유지합니다. 분모를 signed로 캐스팅하거나 최솟값 분자에 절댓값을 적용하지 않습니다.

fraction.Normalized는 512비트를 추가 지원합니다. 비교는 u1024 교차 곱으로 수행하므로 두 u512 곱의 전체 비트를 보존합니다. 128/256 경로의 반환 타입·비교 폭은 유지하며, 기존 명시적 toFloat 외에 부동소수점 변환을 새 경로에서 호출하지 않습니다.

이는 선형 좌표의 정규화 경계이며 [분수 역행렬](icc-fraction-matrix-inverse.md)의 결과를 u128 TRC 목표에 임의 narrowing하지 않습니다. 넓은 목표를 소비하는 sampled/gamma/parametric 역변환과 [분수 Matrix/TRC 연결](icc-fraction-matrix-trc-inverse.md)은 별도 현재 구현·문서가 소유합니다.

## 2026-09-27 현재 재검증

[ICC.1:2022 Annex F.3 식 F.8~F.16](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 선형 RGB 채널별 0·1 경계 제한과 현재 `linear_rgb_target.Of(128/512)`의 공통 분기, `fraction.Normalized(512)`의 u1024 교차 곱을 대조했습니다. 분모 0 선거부, 음수와 초과값의 진단, 정확한 0·1의 원분수 보존을 코드·테스트에서 다시 확인했습니다.

Debug·ReleaseSafe·ReleaseFast에서 `wide linear targets` 집중 필터는 각각 root 포함 3/3, `512 bit fractions compare`와 `wide and existing linear target`은 각각 2/2씩 통과했습니다. 기존 로컬 WASM mode 217/218의 독립 BigInt 대조는 정규화 4,128건·비교 1,540건·거부 399건이 일치했습니다. 추가로 mode 216의 넓은 역행렬 출력을 mode 217에 직접 전달한 128개 합성 행렬·384개 채널을 독립 가우스 소거/범위 제한 기대값과 대조했습니다. 이번 입력에서 범위 안의 189개 채널은 u128보다 큰 분모를 그대로 보존했습니다. 아래 당시 수동 검사의 183개와는 입력 생성이 다르므로 같은 표본 수치가 아닙니다. 이번에 WASM을 재빌드하거나 과거 전체 감사·출력/소스 변형 검사를 재실행하지 않았고 `/tmp` 감사 로그도 현재 없습니다.

## 당시 검증 진행

최초 컴파일에서 generic 내부와 기존 외부 별칭의 Target/Result 이름이 모호하다는 오류가 발생했습니다. 내부 타입을 명시적으로 지정해 수정했고 신규 네이티브 4개 및 기존 Matrix/TRC 역변환 4개가 통과했습니다. 이 초기 컴파일 실패는 검증 통과로 계산하지 않습니다.

신규 테스트는 i512 최솟값, u512 최대 분모, 0/1 경계 보존, 0 분모 오류 우선순위, 최대 폭 인접 분수의 비교, 잘못된 정규화 분수 거부, 기존 128비트 경로와 원값 일치를 포함합니다.

테스트 WASM mode 217은 i512/u512 big-endian 128바이트를 받아 clipping u32와 u512 분자/분모의 little-endian 132바이트를 반환합니다. mode 218은 u512 분자/분모 두 쌍 256바이트를 받아 비교 -1/0/1의 i32 little-endian 4바이트를 반환합니다. 공통 테스트용 readWide는 기본 32바이트를 유지하며 명시적으로 64바이트 읽기도 지원합니다.

Debug WASM 직접 대조는 normalized 4,128·compared 1,540·rejected 399(합계 6,067건)으로 통과했습니다. 512개 비트 위치마다 경계 양옆을 검사하고 무작위 전체 폭 1,024조합, 최대 비트의 인접 분수, 잘림·초과·limit·오류 후 복구를 포함합니다. 독립 JS BigInt 기대값과 원래 분자/분모를 대조하며 기존 Matrix/TRC 3,331 비교/1,099 거부도 통과했습니다.

출력 변형 검사에서는 clipping 표시를 none으로 바꾸기, 분모 상위 384비트를 지워 u128로 좁히기, 모든 비교를 동률로 바꾸기를 각각 ERR_ASSERTION으로 검출했습니다.

추가 변형에서는 비교의 두 교차 곱을 512비트 하위 부분만 남기는 값으로 바꿨습니다. 비트 경계 순회 중 257번째 비교에서 ERR_ASSERTION이 발생해 u1024 대신 u512를 쓰는 정밀도 손실을 검출했습니다. 임시 소스 복사본 `/tmp/hwpjs-wide-linear-mutant.mqw4Ul/icc`에서 범위 초과 조건을 `>` 대신 `>=`로 바꾼 경우도 Debug·ReleaseSafe·ReleaseFast 모두 네이티브 4개 중 경계 보존 검사 1개가 TestExpectedEqual로 실패했습니다. 제품 원본은 변형하지 않았습니다.

Debug WASM의 넓은 역행렬 mode 216 출력을 mode 217에 직접 연결한 수동 검사에서 무작위 i32 행렬 128개/채널 384개를 독립 가우스 소거 및 범위 제한 기대값과 비교했습니다. 모든 채널이 일치했고 내부값 183개 채널은 u128 최대값을 넘는 분모가 원래 그대로 보존됐습니다. 이 수동 검사 수는 정규 audit에 합산하지 않습니다.

## 당시 최종 확인과 현재 범위

전체 세 모드 audit가 `/tmp/hwpjs-wide-linear-target-{Debug,ReleaseSafe,ReleaseFast}.log`에서 모두 종료 코드 0, 20/20 단계, 네이티브 614/614, WASM checks=6,646,514로 완료됐습니다. 이전 6,640,447에 신규 6,067건이 추가됐습니다. ReleaseSafe·ReleaseFast 실제 audit 산출물의 직접 실행에서도 신규 6,067건과 기존 모델 4,430건이 일치했으며 출력/정밀도 변형 4종을 모두 검출했습니다.

최종 적대적 검토에서는 0 분모의 선행 거부, 최소 signed 분자의 직접 부호 분기, unsigned 분모 전체 폭 비교, 정확한 경계의 원분수 보존, 기존 타입 별칭과 128비트 경로 유지, u1024 교차 곱, 명시적 길이·limit 및 출력 전체 초기화를 확인했습니다. 추가 결함은 발견하지 못했습니다. Zig 포맷·변경 JS 문법·diff 공백과 관련 로컬 문서 링크 3개도 확인했습니다.

이 문서의 완료 범위는 넓은 선형 RGB의 정규화와 정확한 분수 비교입니다. 넓은 목표를 소비하는 TRC 역변환 및 모델 연결은 별도 구현·문서에 있으며, 전체 색상 왕복·렌더링과 HWP/HWPX 문서 검증은 여기서 입증하지 않습니다.

sampled 경로의 세부 계약은 [512비트 sampled 역변환](icc-sampled-wide-inverse.md)에서 관리합니다.
