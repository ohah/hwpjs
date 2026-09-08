# 넓은 gamma 목표의 정확한 역변환 표현

## 계약

`gamma_wide_inverse.invert(raw, target)`는 정규화 u512 목표를 받아 정확한 입력 좌표 표현을 반환합니다. 양의 gamma에 대해 y=x^(raw/256)는 [0,1]에서 연속·엄격 증가하므로 x=y^(256/raw)가 유일한 역상입니다. 비교 정밀도 때문에 undecided가 되는 계산을 수행하지 않으며 기호적 식을 그대로 보존합니다.

목표 유효성을 먼저 검사하고 gamma_parametric.curve의 기존 raw 0 거부와 정확한 16.16 지수 변환을 재사용합니다. 따라서 gamma 0은 목표가 0/1이어도 NonInvertibleIccGamma입니다. raw=256 또는 목표 0/1은 원래 u512 분자/분모의 rational 결과이며 약분하지 않습니다. 그 외에는 power로 원래 목표 분수와 역지수 65536/(raw×256)를 보존합니다. 일부 power가 수학적으로 유리수여도 모든 완전근을 판별·단순화하는 API는 아닙니다.

## SSOT와 경계

power_radical.Of(256/512)가 기존 기호적 근 필드·유효성 검사를 공유합니다. 기존 normalized_power_level.Radical은 Of(256)의 별칭으로 유지하고 기존 Root/solve의 입력 범위와 계산을 바꾸지 않습니다. gamma 전용 타입은 gamma_wide_inverse_types가 소유합니다. 반환 power의 negative는 false이며 양의 분자/분모와 기존 Reciprocal 검증 계약을 만족합니다.

raw×256의 최대값은 16,776,960으로 i32/u32에 들어갑니다. 목표의 거듭제곱을 실제 계산하거나 분수를 f64로 바꾸지 않으므로 매우 작은 목표의 역상도 0으로 언더플로시키지 않습니다. 기존 gamma_inverse.evaluate의 근사 API는 변경하지 않습니다. 비할당 값 타입입니다.

이번 경로는 정확한 gamma 역상 표현의 생성입니다. 일반적인 512비트 근 비교/수치 평가, 넓은 parametric 분기·TRC 조립·렌더링은 별도 범위이며 기존 u256 근 비교기에 임의 narrowing하지 않습니다.

## 검증 진행

신규 네이티브 4개와 기존 normalized power level 4개가 통과했습니다. 모든 양의 u16 gamma에 대한 양 끝점과 최대 폭 내부 목표, 항등의 원분수 보존, 작은 목표의 비반올림 표현, 제곱근 역지수, gamma 0과 잘못된 목표의 오류 순서, 공유 descriptor 검증을 포함합니다.

테스트 mode 220은 gamma u16와 목표 u512/u512의 big-endian 130바이트를 받습니다. 결과는 tag u32, negative u32, 분자/분모 u512, 역지수 i32/u32의 little-endian 144바이트입니다. rational은 tag/negative/역지수가 0이며 power는 tag=1입니다. 출력 전체를 초기화하고 정확한 길이와 limit를 검사합니다.

Debug WASM 직접 실행에서 rational 131,075·power 131,081·rejected 151(합계 262,307건)이 통과했습니다. raw 0~65535 전체와 목표 0/max, max/max, (max−1)/max, 1/max(max=u512 최대값)를 대조하고 잘못된 목표·여분 바이트·잘림·limit·오류 후 재사용도 검사했습니다. 기대값은 원래 목표 분수와 독립 역지수 공식으로 검증하며 반올림한 pow 결과를 기준으로 삼지 않습니다.

공유 근 표현을 사용하는 기존 normalized power level 및 TRC 역변환 검사도 통과했습니다. 분자/분모를 u128로 자르기, 결과 부호를 음수로 바꾸기, 역지수 분모에서 gamma 단위 변환 계수 256을 제거하기의 세 출력 변형은 각각 ERR_ASSERTION으로 검출했습니다.

임시 소스 복사본 `/tmp/hwpjs-gamma-wide-mutant.EpazIo/icc`에서 gamma 유효성 검사를 끝점 반환 뒤로 옮겼습니다. Debug·ReleaseSafe·ReleaseFast 모두 gamma 0 끝점 오류 검사가 TestExpectedError로 실패해 잘못된 성공 처리를 검출했습니다(3개 통과/1개 실패). 제품 원본은 변형하지 않았습니다.

추가 Debug WASM 수동 검사에서 macOS ACESCG Linear·AdobeRGB1998·Generic Gray Profile·Generic RGB Profile의 curv gamma 태그 10개 원값을 읽어 목표 5종(0/1, 최대 폭 내부 목표, 1/4)에 적용했습니다. 분수 보존과 역지수 비례식 p×raw=q×256을 확인한 50건이 일치했습니다. 파일은 읽기 전용으로 사용했고 정규 audit 수에 합산하지 않습니다. 전체 프로파일/픽셀 변환 검증은 아닙니다.

## 최종 확인과 남은 범위

전체 세 모드 audit가 `/tmp/hwpjs-gamma-wide-inverse-{Debug,ReleaseSafe,ReleaseFast}.log`에서 모두 종료 코드 0, 20/20 단계, 네이티브 622/622, WASM checks=6,916,540으로 완료됐습니다. 이전 6,654,233에 신규 262,307건이 추가됐습니다. ReleaseSafe·ReleaseFast 실제 audit 산출물의 직접 실행에서도 신규 rational 131,075/power 131,081/rejected 151과 기존 normalized power level·TRC 회귀가 일치했고 출력 변형 3종을 모두 검출했습니다.

최종 적대적 검토에서는 목표 선행 검증과 gamma 0의 끝점 우회 방지, 항등/끝점의 원분수 보존, 양의 유일 역상, gamma 단위 변환 재사용, 근 descriptor 검증 공유와 기존 256비트 계약 유지, 고정 wire 크기/limit와 전체 초기화를 확인했습니다. 추가 결함은 발견하지 못했습니다. Zig 포맷·변경 JS 문법·diff 공백과 관련 로컬 문서 링크 5개도 확인했습니다.

이번 완료 범위는 넓은 gamma 목표의 정확한 역상 표현입니다. 넓은 근의 일반 비교/수치 평가, parametric/TRC 모델 통합, 색상 왕복·렌더링 및 전체 HWP/HWPX 문서 검증은 아직 남아 있습니다.
