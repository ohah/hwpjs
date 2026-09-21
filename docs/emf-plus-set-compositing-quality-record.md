# EMF+ SetCompositingQuality record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_compositing_quality.zig`는 MS-EMFPLUS 2.3.6.3의 EmfPlusSetCompositingQuality record를 조립합니다. `emf_plus_compositing_quality.zig`는 MS-EMFPLUS 2.1.1.6의 CompositingQuality와 Windows 호환 해석을 소유하며 record parser는 값 범위를 복제하지 않습니다.

Type은 `0x4024`, Size는 정확히 12, DataSize와 실제 data slice는 0이어야 합니다. Flags low byte가 CompositingQuality이고 high byte는 reserved입니다. reserved bits는 MUST be ignored이므로 모두 승인하고 전체 Flags 원값을 보존합니다. 정의된 enum은 Default 1, HighSpeed 2, HighQuality 3, GammaCorrected 4, AssumeLinear 5입니다. 공식 3.2.32.2와 3.2.32.12 예제는 모두 Flags `0x0002`를 HighSpeed로 명시합니다.

명세의 제품 동작 주석 `<3>`은 Windows가 모든 invalid 값을 CompositingQualityDefault로 처리한다고 명시합니다. 이 구현은 invalid low byte를 버리거나 유효한 Default로 덮어쓰지 않습니다. `WireValue.invalid_windows_default`에 원값을 보존하고 `effective()`에서만 Default를 반환합니다. 따라서 wire 명세 위반 여부와 Windows 재생 호환 동작을 동시에 관찰할 수 있습니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser를 호출한 뒤 전체 record 수와 Windows fallback record 수를 따로 보고합니다. payload·두 집계의 오류는 comment 전체 상태를 원복하고 실제 EMF framing도 같은 경로를 사용합니다. invalid quality는 공식 Windows fallback이 있으므로 구조 오류로 거부하지 않되 문서 수준에서 편차를 잃지 않습니다.

Default/HighSpeed/HighQuality/GammaCorrected를 결과가 같다는 설명만으로 서로 정규화하지 않습니다. tracked stream은 정의값 또는 invalid 원값과 fallback을 [공용 property 상태](emf-plus-property-state.md)에 적용하고 Save/Container 수명주기와 report에 연결합니다. 실제 gamma correction, alpha compositing과 저장은 미구현입니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 한컴 렌더링과의 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 low byte 0–255 전체에서 다섯 정의값과 나머지 모든 invalid 원값·Windows Default 효과, 모든 reserved bits set, 공식 Flags `0x0002`, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·fallback·payload 오류·두 count overflow 원자성과 실제 EMF framing의 전체/fallback 분리 집계를 검사합니다.

20개 의미 변이(정의값 오매핑, invalid 원값 손실, fallback 효과 오해, 정의값 강제 Default, RecordType, Size/DataSize/slice, low-byte shift/high-byte 오독, Flags·raw quality 손실, reserved 거부, stream 오라우팅, parser 우회, 전체 report 오집계·overflow, fallback report 누락·오집계·overflow)를 Debug·ReleaseSafe·ReleaseFast에서 독립 실행했습니다. 최초 캠페인의 컴파일 진단 2종은 폐기하고 타입이 유효한 의미 결함으로 교체했으며, fallback 집계와 0–255 exhaustive 검사 추가 후 전체를 다시 실행했습니다. 최종 채택 결과는 총 60/60 테스트 의미 실패이며 생존·무효·컴파일 오류·panic·timeout은 각각 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-compositing-quality-mutants.LuvFXU`에 있습니다.

fallback 집계와 0–255 exhaustive 검사까지 반영한 최종 소스를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 `audit`를 순차 재실행했습니다. 각 모드는 40/40 단계와 1,751/1,751 테스트(공통 native 1,712, 별도 chart 31, WMF 8), HWP/WASM 8,905,827회 검사와 imports 0을 통과했습니다. CFB 12,000 변이도 traps 0입니다. 최종 로그는 `/tmp/hwpjs-emfplus-set-compositing-quality-v3-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
