# TRC 공통 역변환

u512 목표를 받는 공통 진입점의 계약과 후속 검증은 [확장 TRC 역변환](icc-extended-trc-inverse.md)에서 관리합니다. 아래 수치는 기존 경로 구현 당시의 검증 기록입니다.

## 범위와 책임

`src/image/icc/trc_inverse.zig`는 이미 파싱한 TRC를 받아 정규화 u128 목표의 역변환 좌표를 반환합니다. identity는 원래 분수를 u256으로 보존하고, sampled는 기존 [sampled 역변환](icc-sampled-inverse.md)을 호출합니다. gamma는 `gamma_parametric.zig`에서 u8.8 원값을 256배 하여 정확한 s15.16 지수로 변환합니다. gamma와 parametric은 기존 [파라메트릭 역변환](icc-parametric-inverse.md)을 재사용합니다. raw gamma 0은 NonInvertibleIccGamma로 거부합니다.

타입은 trc_inverse_types가 소유합니다. selected는 유리수 또는 기호적 거듭제곱 근 좌표이며, f64 근사로 대체하지 않습니다. unattained·ambiguous·undecided를 구분하고 기존 오류를 전파합니다. 목표 유효성을 분기 선택 전에 검사합니다. 전역 단조 검사와 평탄부 입력 선택 규칙을 여기서 재구현하지 않습니다.

TRC 태그 파싱·edition 허용 여부는 [trc_tag](icc-trc-tags.md), 전체 프로파일 모델과 색상 변환 정책은 상위 계층의 책임입니다. 성공해도 Parsed.semantics_deferred를 해소하지 않습니다. 기존 근사 gamma_inverse API는 변경하지 않습니다. 제품 JS 공개 API와 실제 픽셀 변환 연결은 추가하지 않았습니다.

## 검증 진행

네이티브 테스트 4개가 통과했습니다. u128 identity 보존, 시작/끝 plateau, gamma 정확 변환과 극값, 출력 부재·동률, 잘못된 목표 및 전체 sampled 비단조 거부를 포함합니다.

테스트 전용 WASM mode 213(v2)/214(v4)는 precision·목표·채널 서명·원시 태그를 받아 실제 trc_tag.parse부터 실행합니다. 결과는 채널/semantics_deferred 8바이트와 기존 상태 wire입니다. selected만 상태 5와 기존 92바이트 좌표를 사용합니다. 나머지는 기존 최근접 출력 serializer를 공유합니다. 임시 payload는 defer로 해제합니다.

Debug WASM 직접 실행에서 765건(selected 530, rejected 232, unattained 1, ambiguous 1, undecided 1)이 통과했습니다. 네 채널·두 edition·네 정밀도, 정확한 감마 역상, 증가/감소 sampled 양끝 평탄부와 범위 밖 목표, v2 para 거부, 잘림·여분 바이트·입력 제한·오류 후 재사용을 검사합니다. 기대 좌표는 독립적인 분수·거듭제곱 비교기로 검증합니다.

채널 변조, 의미 보류 플래그 삭제, undecided를 unattained로 변경, 선택 유리수 좌표를 0으로 변조하는 네 가지 출력 변형은 모두 ERR_ASSERTION으로 검출했습니다. 이는 출력 검증 민감도 증거이며 모든 구현 결함을 검출한다는 뜻은 아닙니다.

전체 네이티브 회귀는 5/5 단계, 602/602 테스트로 통과했습니다. Zig 포맷·변경 JS 문법·diff 공백 검사도 통과했습니다.

추가 Debug WASM 수동 검증에서 양의 u16 gamma 65,535개 각각의 목표 0/1을 정확한 끝점과 대조하여 131,070건이 통과했습니다. 목표 1/2에 대해서는 반환된 기호적 근이 정확히 (1/2)^(65536/(raw×256))이며 affine 계수가 항등인지 65,535건 확인했습니다. 반올림한 실수값을 비교하지 않았고 전체 목표 정의역 전수 검증을 의미하지 않습니다. step 곡선의 ambiguous payload도 하위 출력 0, 상위 출력 1, 상위 증거점 1/2인지 별도로 확인했습니다. 합계 196,606건은 정규 audit 검사 수에 포함하지 않습니다.

임시 소스 복사본 `/tmp/hwpjs-trc-gamma-mutant.SAt5qn/icc`에서 지수 변환 배율을 256 대신 255로 변형했습니다. Debug·ReleaseSafe·ReleaseFast 모두 4개 중 gamma 역상 테스트 1개가 TestExpectedEqual로 실패하여 잘못된 단위 변환을 검출했습니다. 원본 소스는 변경하지 않았습니다.

실제 macOS ACESCG Linear·AdobeRGB1998·Generic Gray Profile·Generic RGB Profile의 gamma TRC 10개 원시 태그를 ReleaseSafe WASM에 전달했습니다. 목표 0/1의 정확한 좌표와 1/2의 기호적 근 지수를 대조한 30건이 통과했습니다. 파일을 수정하지 않았고 공유 태그를 포함한 채널별 검사 수입니다. 실제 색상 엔진의 렌더링 대조는 아닙니다.

## 최종 audit와 남은 범위

전체 세 빌드 모드 audit가 `/tmp/hwpjs-trc-inverse-{Debug,ReleaseSafe,ReleaseFast}.log`에서 순차 실행되어 모두 종료 코드 0으로 완료됐습니다. 각 모드 20/20 단계, 602/602 네이티브 테스트, WASM checks=6,615,635로 통과했습니다. 기존 검사 수 6,614,870에 신규 765건이 추가됐습니다. ReleaseSafe·ReleaseFast 실제 audit 산출물 직접 실행에서도 신규 765건과 네 가지 출력 변조 검출이 일치했습니다.

최종 적대적 검토에서는 목표 선행 검증, 감마 단위 변환의 i32 범위, 전체 sampled 단조 검사 재사용, 동률/미확정 보존, 태그 판본 정책 분리, borrowed 입력 수명과 임시 출력 버퍼 해제를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 못했습니다. 관련 문서 로컬 링크 8개도 확인했습니다.

모델 수준의 역행렬·정규화·TRC 연결, 실제 색상 변환 왕복·렌더링 검증, HWP/HWPX 전체 문서 검증은 아직 남아 있습니다. 이번 결과는 전체 문서 검증, 편집·저장·렌더링 완료를 의미하지 않습니다.

모델 계층의 후속 구현과 검증 상태는 [Matrix/TRC 역방향 연결](icc-matrix-trc-inverse.md)에서 관리합니다.
