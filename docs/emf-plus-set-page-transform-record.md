# EMF+ SetPageTransform record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_page_transform.zig`는 MS-EMFPLUS 2.3.9.5의 EmfPlusSetPageTransform wire record를 소유합니다. Type `0x4030`, Size 16, DataSize와 실제 data 길이 4를 각각 검사하고 PageScale을 little-endian IEEE 754 binary32로 읽습니다.

Flags의 low byte는 공용 `UnitType` 0~6이며 high byte는 명세 도표의 0 고정값이므로 거부합니다. World와 Display는 SHOULD NOT 값이지만 파싱 가능한 값이므로 거부하지 않고 `discouraged_page_unit`과 stream 경고 계수로 구분합니다. PageScale의 NaN, 무한대와 signed zero를 정규화하지 않습니다.

## stream 연결과 지원 경계

반환값은 wire 명령만 표현하고 실제 상태 전이는 [page transform 재생 계층](emf-plus-page-transform.md)이 소유합니다. tracked stream은 Header의 축별 LogicalDpi로 page-to-device scale을 계산하고 Save/Container snapshot과 report에 연결합니다. [일반 point mapper](emf-plus-world-page-device.md)를 통해 [polyline](emf-plus-polyline-device-segments.md)과 [Bézier device segment](emf-plus-bezier-device-segments.md)가 이 scale을 적용하지만 다른 geometry, clipping과 렌더링은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

일곱 UnitType과 두 SHOULD NOT 경고값, high-byte 고정값, PageScale 원시 float bit, 모든 payload 잘림, RecordType과 세 size 축, stream의 두 checked count·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x4030`, Size 16, DataSize 4와 실제 payload 길이를 독립적으로 위반했습니다.
- Flags low byte의 일곱 UnitType, high byte의 0 고정값과 World/Display SHOULD NOT 경고를 서로 분리해 확인했습니다.
- little-endian PageScale과 signed zero·NaN payload bit가 보존되는지 확인했습니다.
- 전용 parser, 일반 count, 경고 분기와 경고 count를 각각 무력화해 stream·framing·rollback 테스트가 검출하는지 확인했습니다.
- wire parser와 page-state 재생의 책임이 분리되고 공용 단위 환산이 복제되지 않는지 대조했습니다.

Type, Size, DataSize, data slice, reserved high byte, UnitType 선택, SHOULD 경고 판정, PageScale bit, stream parser, 일반 count, 경고 분기와 경고 count의 고유 의미 변이 12개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 최초 경고 분기 변이는 같은 문구의 BeginContainer 분기를 잘못 바꿔 SetPage 테스트 범위 밖에 놓인 위치 편향이므로 결과에서 제외했고, SetPage 전용 counter 문맥을 포함한 치환으로 다시 실행했습니다. 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정한 최종 결과는 36/36 검출이며 생존·컴파일 오류·timeout은 0입니다. 변이별 복제본과 cache는 즉시 제거했고 36개 로그만 `/tmp/hwpjs-set-page-mutants-run`에 남겼습니다.

전체 `audit`는 세 모드에서 각각 40/40 단계와 1,816/1,816 테스트(native 1,777, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-page-transform-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
