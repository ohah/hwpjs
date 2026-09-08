# ICC parametric 최근접 출력과 역변환 입력 연결

## 공식 규칙과 결과 계약

[ICC.1:2022 Annex F.1, PDF 115쪽](https://www.color.org/specifications/ICC.1-2022-05.pdf#page=115)을 다시 확인했습니다. 전체 곡선은 비상수·단조여야 하며, 평탄 역상의 끝이 전체 정의역 끝이면 최소 입력을, 그렇지 않으면 최대 입력을 선택합니다. 목표에 역상이 없으면 가장 가까운 실제 출력에 대응하는 입력을 찾습니다. 이 절에는 서로 다른 최근접 출력의 동률 우선순위가 지정되어 있지 않으므로 임의로 한쪽을 선택하지 않습니다.

`parametric_inverse.select(precision,curve,target)`는 정규화 u128 목표에 대해 이 연결을 수행합니다. 제품 JS API는 추가하지 않습니다.

- selected: 선택된 정확한 출력 표현과 입력 coordinate입니다. coordinate는 기존 rational/power_root 표현을 유지합니다.
- unattained: 가장 가까운 실제 출력 자체가 없습니다.
- ambiguous: 서로 다른 가장 가까운 출력 두 개입니다. 분기별 출력 정보를 보존하며 임의 tie-break를 하지 않습니다.
- undecided: 요청 정밀도로 필요한 비교를 확정하지 못했습니다.

ConstantIccCurve·NonMonotonicIccCurve·실수 정의역 오류를 먼저 거부합니다. 실제 출력은 있지만 F.1(a)가 요구하는 최대/최소 입력이 없는 경우 기존 UnattainedIccPreimageMaximum/Minimum 오류를 전파합니다. 이 오류는 unattained 출력 상태와 다릅니다.

## 책임 분리와 SSOT

[u512 목표 전체 역변환](icc-extended-parametric-inverse.md)은 기존 gate·최근접 출력·입력 선택 흐름을 공유하며 목표를 좁히지 않습니다.

parametric_inverse_gate가 기존 parametric_trend의 비상수·단조 전제를 검사합니다. 기존 도달 목표용 parametric_attained_inverse도 이 gate를 재사용합니다. 전체 역변환 조립기는 gate 뒤 [전체 최근접 출력](icc-parametric-nearest.md)을 호출하고, parametric_inverse_choice가 출력에서 입력을 선택합니다. 타입은 parametric_inverse_types에 둡니다.

유리수 출력과 클리핑된 0/1은 기존 parametric_attained_inverse에 전달하여 역상 전체 범위와 F.1(a) 평탄 구간 규칙을 재사용합니다. 현재 factory의 선형 출력 분모는 최대 80비트, 분자는 그 이하이며 원래 목표는 u128입니다. u256 표현을 u128로 넘길 때에도 checked cast를 사용합니다. factory가 증명한 실제 출력에 역상이 없다는 결과가 나오면 불변식 오류로 보고하고 임의 좌표로 대체하지 않습니다.

## 내부 거듭제곱 출력 증거점을 사용할 수 있는 근거

다음은 명세의 직접 문장이 아니라 현재 곡선 형식과 factory에 대한 수학적 검토입니다. 이 경로는 공개 select가 gate를 통과하고 parametric_nearest에서 받은 choice에만 적용합니다. 임의 사용자 증거점을 역변환으로 승인하는 API가 아닙니다.

power 표현은 출력이 엄격히 (0,1)임을 factory가 증명하므로 해당 값에는 0/1 클리핑 평탄부가 없습니다. a와 g가 모두 0이 아닌 비상수 거듭제곱 식은 내부 출력에서 구간 전체가 평탄할 수 없습니다. 전체 단조 조건 아래 같은 내부 출력이 서로 다른 두 입력에 있으면 그 사이가 모두 평탄해야 하므로 모순입니다. 따라서 상위 분기 내부 역상은 유일합니다.

a=0 또는 g=0이면 상위 분기 전체가 상수이며 그 구간은 1까지 이어집니다. range factory는 동률에서 증거점을 갱신하지 않으므로 시작점을 보존합니다. F.1(a)가 이 평탄부에 요구하는 최소 입력과 같습니다. 상위가 마지막 단일점인 경우도 같습니다.

하위 선형 분기까지 같은 내부 출력이 이어지는 경우, 상위가 비상수이면 하위 평탄부의 마지막점인 상위 시작점이 최대 입력입니다. 상위까지 상수이고 하위도 그 내부 값으로 평탄하면 전체 상수이므로 gate에서 이미 거부됩니다. 비상수 선형 부분이 같은 값을 더 이른 입력에서 낸 뒤 단조성을 유지하며 상위 상수 값으로 돌아올 수도 없습니다. 감소 곡선에서도 입력의 최대/최소 규칙을 뒤집지 않습니다.

이 전제 덕분에 selected power 표현의 factory 증거점을 정확한 rational 입력으로 유지할 수 있습니다. rational 0/1이나 임의로 만들어진 power 표현에는 이 단축을 적용하지 않습니다.

## 검증 진행

신규 네이티브 5개와 기존 도달 목표 선택 테스트 4개가 통과했습니다. 도달 목표 1/3, 시작/종료 클리핑 평탄부, 상위 a=0·g=0 상수 평탄부, 감소 곡선의 종료 평탄부, 내부 값의 단일 끝점과 영점 도함수 사례, 출력 부재·동률 모호성·최대 입력 부재, 상수·비단조 거부를 검사합니다.

테스트 mode212는 기존 precision u32 BE·목표 n/d u128 BE·para 입력입니다. 0=unattained(4바이트), 1=undecided(4), 4=ambiguous(152바이트, 기존 tie wire), 5=selected입니다. selected는 4바이트 상태 뒤 공통 입력 endpoint92와 기존 선택 출력 wire68/88을 붙여 총 164/184바이트입니다. icc-parametric-nearest-output을 추출해 mode211과 공유하며 입력 좌표의 wire는 기존 icc-preimage-endpoint-wire를 재사용합니다.

독립 JS 주 격자는 g=1의 두 클리핑 선형 분기를 사용합니다. 별도 단조성 기준을 확인하고, 독립 출력 구간 oracle로 최근접 값을 찾은 뒤 각 분기의 역상을 critical point/open cell 열거로 계산하여 F.1 입력을 정합니다. 제품 gate나 증거점 선택을 기대값으로 쓰지 않습니다. 비정수 지수의 상수/단조 예제는 정확한 식과 입력을 별도로 확인합니다.

직접 Debug WASM은 selected=3595/unattained=26/ambiguous=88/rejected=4118/undecided=1, 총 7,828건이 통과했습니다. 기존 attained inverse 1,413건과 전체 최근접 13,082건도 동일하게 통과했습니다. 내부 출력의 입력을 무조건 1로 바꾸기·모호성을 출력 부재로 바꾸기·미확정을 출력 부재로 바꾸기를 각각 ERR_ASSERTION으로 검출했습니다. 제품에 변형을 남기지 않았습니다.

전체 세 모드 audit 결과는 아래 최종 확인 절을 기준으로 합니다.

별도 `/tmp` 소스 복사본에서 gate의 비단조 곡선 거부를 허용으로 바꿨습니다. Debug·ReleaseSafe·ReleaseFast 모두 TestExpectedError로 실패하여 비단조 곡선의 실제 입력 좌표가 반환되는 잘못된 경로를 검출했습니다. 원본에는 변형을 적용하지 않았습니다.

## 실제 프로파일 대조

DCI(P3) RGB·Display P3·ITU-2020·ITU-709·ROMM RGB의 RGB TRC 15개에서 목표 0/1과 type3 하위 좌극한을 대조했습니다. 양의 지수·기울기, 내부 분기점, a+b=65536, 상위 시작 밑과 하위 좌극한이 (0,1)임을 먼저 확인했습니다. g/65536=p/q, D=65536², N=a*d+b*65536, L=c*d로 놓고 `N^p*D^q`와 `L^q*D^p`를 BigInt로 비교해 분기 점프의 방향을 독립 판정했습니다.

DCI(P3)·Display P3·ITU-2020의 18개 끝점 목표는 정확한 출력과 입력 0/1을 반환했습니다. ITU-709·ROMM RGB의 끝점 및 좌극한 목표 18개는 NonMonotonicIccCurve로 거부했습니다. Display P3·ITU-2020의 열린 하위 좌극한 목표 6개는 unattained였습니다. 총 42건이 기대와 일치했습니다. 수동 확인으로 정규 audit 호출 수에 합산하지 않으며 OS 색상 엔진의 보정·렌더링 대조를 의미하지 않습니다.

## 최종 확인

Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 종료 코드 0, 20/20 단계, 네이티브 598/598, WASM checks=6,614,870으로 통과했습니다. 신규 7,828건이 이전 6,607,042건에 추가됐습니다. 신규 결과는 세 모드 모두 selected=3595/unattained=26/ambiguous=88/rejected=4118/undecided=1입니다. 로그는 `/tmp/hwpjs-icc-parametric-inverse-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

ReleaseSafe·ReleaseFast의 실제 감사 산출물 직접 실행에서도 같은 신규 수치를 확인하고 내부 출력의 입력을 무조건 1로 바꾸는 변형을 각각 ERR_ASSERTION으로 검출했습니다. 변경 Zig 포맷·JS 문법·diff 공백과 관련 문서 로컬 링크 5개도 확인했습니다.

최종 재검토에서는 목표 선행 검증, 공유 비상수·단조 gate, 유리수 역상 전체 범위의 기존 F.1(a) 규칙, 내부 출력 증거점 단축의 factory/단조 전제, a=0·g=0·감소 평탄부·마지막 단일점, 미도달 출력과 최대 입력 부재의 구분, 동률 모호성·미확정 보존을 확인했습니다. 임시 출력 버퍼는 defer로 해제하고 결과 할당 이후 오류 가능한 작업이 없으며 모든 바이트를 초기화합니다. 이번 범위에서 추가 결함은 발견하지 않았습니다.

## 남은 범위

동률·최대/최소 입력 부재에 대한 임의 보정 정책은 제공하지 않습니다. 표준이 지정하지 않은 정책과 정확한 실패/모호성 보고를 구분합니다. 상위 연결은 [TRC 공통 역변환](icc-trc-inverse.md)에서 관리합니다. 실제 색상 변환 경로의 왕복·렌더링 검증, HWP/HWPX 전체 문서 검증은 아직 미완료입니다.
