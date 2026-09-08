# ICC 확장 목표의 최근접 출력·역변환 입력 연결

## 계약

`parametric_inverse.selectWide(precision,curve,target)`는 u512 목표에 대해 전체 곡선의 비상수·단조성을 검증한 뒤 최근접 출력과 그에 대응하는 입력을 구합니다. selected는 u512 유리수/기호적 출력과 u1024 유리수/기호근 입력입니다. unattained는 최근접 실제 출력 부재, ambiguous는 서로 다른 같은 거리 출력 두 개, undecided는 비교 정밀도 부족입니다. 출력 동률의 임의 우선순위는 추가하지 않습니다.

실제 출력은 있어도 규칙상 필요한 최대/최소 입력이 없으면 기존 UnattainedIccPreimageMaximum/Minimum 오류를 전파합니다. 이는 unattained 출력 상태와 다릅니다. ConstantIccCurve·NonMonotonicIccCurve·실수 정의역 오류도 기존처럼 거부합니다. [기존 전체 역변환 계약과 F.1 근거](icc-parametric-inverse.md)를 그대로 적용합니다.

## SSOT와 책임

parametric_inverse의 selectFor가 기존·확장 gate, [최근접 출력 선택](icc-extended-parametric-nearest.md), 입력 연결 순서를 공유합니다. parametric_inverse_types.Of는 폭별 출력/좌표 타입을 기존 타입에서 가져옵니다. parametric_inverse_choice의 resolveFor는 유리수 출력과 클리핑 0/1을 [도달 역상 선택](icc-extended-attained-inverse.md)에 전달합니다. 기존 u128 변환은 checked cast를 유지하고 확장 경로는 u512 목표를 줄이지 않습니다.

기호적 내부 출력의 witness 단축은 전체 단조성 gate와 factory가 보증한 choice에만 적용합니다. 비상수 상위 분기에서는 내부 출력의 역상이 유일하고, 상수 상위 분기에서는 factory가 보존한 시작점이 terminal plateau의 최소 입력입니다. 이 수학적 근거는 기존 연결 문서가 소유합니다. 임의 사용자 witness를 승인하는 검증 API는 아닙니다. 파일 접근·할당·실수 근사는 코어에 추가하지 않습니다.

## 독립 검증과 wire

mode235 입력은 precision+n/d u512의 132바이트 BE prefix와 para 태그입니다. status 0=unattained, 1=undecided는 4바이트, 4=ambiguous는 기존 확장 tie wire 216바이트입니다. 5=selected는 상태 뒤 입력 endpoint 284바이트와 선택 출력 wire 132/88바이트를 붙인 총 420/376바이트입니다. 기존 mode212와 probe를 공유하고 입력·출력 serializer도 재사용합니다. 임시 출력 버퍼는 defer로 해제합니다.

독립 JS는 두 클리핑 선형 분기의 단조성·출력 범위를 계산하고 최근접 출력의 각 분기 역상을 critical-cell 기준으로 열거해 F.1 입력을 선택합니다. 비정수 지수의 terminal 상수 및 유일 끝점 예제는 정확한 식·좌표를 별도 대조합니다. 최대 u512 목표의 이웃과 큰 입력 좌표, 열린 최대값·출력 부재·모호성·잘림·오류 후 복구를 포함합니다. 기존 직접 결과는 selected=3,595/unattained=26/ambiguous=88/rejected=4,118/undecided=1, 확장은 3,625/28/89/4,217/1입니다.

확장 네이티브 6개는 큰 목표·u1024 좌표, 시작/끝 클리핑 평탄부, 상위 상수·비상수 witness, 감소 곡선, 출력 부재·동률·입력 최대값 부재, 전체 상수·비단조 거부를 검사합니다. 결과 태그와 optional 비교 결과를 먼저 assert하여 ReleaseFast의 잘못된 분기 접근을 통과로 오인하지 않도록 합니다. 전체 네이티브는 682/682로 통과했습니다.

## 적대적 검사와 실제 ICC

witness 입력을 항상 1로 변경, ambiguous를 출력 부재로 변경, undecided를 출력 부재로 변경, 큰 입력 좌표 잘림의 네 변형을 ERR_ASSERTION으로 검출했습니다. 임시 소스에서 기호 출력 witness를 무조건 1로 바꾸자 세 모드 모두 6개 중 2개가 실패했습니다. 제품에는 변형을 남기지 않았습니다. 로그는 `/tmp/hwpjs-extended-inverse-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

시스템 para TRC 15개의 type0/type3·양의 g/a·a+b=65536과 type3의 양의 하위 기울기·내부 접점 출력을 확인했습니다. D=65536², N=a*d+b*65536, L=c*d, 기약 지수 p/q에 대해 독립 BigInt로 N^p*D^q와 D^p*L^q를 비교하여 점프 방향을 판정했습니다. u512 최대 분모 목표 0/1에서 단조인 18건은 정확한 출력·입력 0/1을 반환하고 하향 점프 12건은 NonMonotonicIccCurve로 거부했습니다. 수동 건수는 정규 audit에 합산하지 않으며 OS 색변환·HWP 렌더링 일치를 의미하지 않습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 audit는 모두 종료 코드 0, 20/20 단계, 네이티브 682/682, WASM checks=6,986,563으로 통과했습니다. 이전 6,978,603에 신규 7,960회 호출이 추가됐습니다. 로그는 `/tmp/hwpjs-extended-inverse-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. ReleaseSafe·ReleaseFast 산출물의 신규 직접 대조와 네 출력 변형 검출도 모두 통과했습니다.

변경 Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 6개를 확인했습니다. 최종 재검토에서는 전체 곡선 gate 선행, 원래 목표 폭과 checked 변환, factory 증거점의 제한된 사용, 유리수 출력의 공통 역상 선택, 출력 부재·모호성·미확정·입력 극값 부재 구분, 결과 태그 선행 확인, 기존 wire 계약·임시 버퍼 해제·전체 초기화를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 않았습니다. TRC/행렬 전체 역변환 연결·제품 JS API·전체 HWP/HWPX 문서 검증은 아직 완료되지 않았습니다.
