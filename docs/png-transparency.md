# PNG tRNS 투명도 검증

## 범위

`transparency.zig`는 [PNG Third Edition §11.3.1.1](https://www.w3.org/TR/png-3/#11tRNS)의 tRNS payload를 해석합니다. `metadata.zig`는 [§5.6 청크 순서](https://www.w3.org/TR/png-3/#5ChunkOrdering)의 단일성·PLTE 이후/IDAT 이전 조건을 검사합니다. 기존 pixels.decode/inspect에 연결하며, 독립 structure.inspect는 계속 ancillary의 경계·CRC만 검사합니다.

- grayscale: 정확히 2바이트의 big-endian sample.
- truecolor: 정확히 6바이트의 big-endian RGB sample.
- indexed-color: PLTE 항목 수 이하의 alpha 바이트. 생략된 항목은 255로 보완합니다.
- 이미 alpha 채널이 있는 color type 4/6에는 tRNS를 허용하지 않습니다.

16-bit 미만 sample은 Third Edition의 decoder 규칙에 따라 유효 bit depth로 마스킹합니다. 원래 u16 raw와 마스킹한 value를 함께 보존합니다. 16-bit sample은 전체 값이 유지되며, 이 계층에서 8-bit 축소나 투명도 비교를 수행하지 않습니다.

indexed tRNS 길이 0은 빈 alpha 표로 받아들여 전부 opaque로 해석합니다. 이는 명세의 일반 청크 길이 0 허용 및 생략한 alpha 항목의 255 규칙을 결합한 해석입니다. tRNS 항목의 최소 개수가 별도 명시되어 있지 않으므로 명시적인 최소 길이 요구라고 주장하지 않습니다. 이 경우도 청크가 존재한 것으로 기록해 부재(null)와 구분하고 중복을 거부합니다.

## 책임·수명·미검사 통계

`transparency.parse`는 Header.validate/validatePaletteCount와 공통 sample.zig를 재사용하고 payload 길이·타입·palette 한도를 검사합니다. 반환 Value는 grayscale Sample, truecolor Sample 3개, 또는 alpha[256]+명시된 count의 union입니다. 입력 slice를 빌리지 않고 배열 값을 복사하므로 원문 수정·해제와 독립적입니다. palette 보완 배열의 유효 참조 범위는 PLTE 항목 수이며 임의의 추가 palette를 생성하는 기능이 아닙니다.

`metadata.State.consume`는 이미 critical envelope가 검증된 청크를 받습니다. 실패 시 상태를 바꾸지 않습니다. 아직 PLTE가 오지 않은 indexed tRNS, IDAT 이후 tRNS, 중복 tRNS, tRNS 뒤에 나오는 선택적 truecolor PLTE를 거부합니다. 같은 상태 계층의 [bKGD/hIST 검사](png-palette-metadata.md)는 별도 주제에서 관리합니다.

pixels 보고서의 transparency는 optional 값입니다. metadata에서 검사한 청크/바이트 수만 기존 ancillary deferred 통계에서 빼고, 나머지 vpAg·색상 프로필·텍스트 등은 그대로 남깁니다. 빈 tRNS는 검사 청크 1개/바이트 0개입니다. 오류에는 부분 보고서가 반환되지 않습니다. 새 동적 할당은 추가하지 않으며 기존 이미지 decode의 할당 실패 정리 경로를 재사용합니다.

현재는 투명도 메타데이터의 해석·검증·보존까지입니다. 복원 행에 alpha를 합치거나 RGBA를 생성하는 단계, compositing·색상 변환·APNG·저장은 포함하지 않습니다.

## 검증

네이티브는 grayscale depth 1/2/4/8/16 각각의 모든 u16 원값을 검사하고 RGB raw/value 보존을 확인합니다. palette 길이 0~256, 생략 alpha, 원문 변경 후 값 보존, 잘못된 Header·색상·크기, 실패 상태 불변성, 중복·순서 및 통합 할당 실패 정리를 검사합니다.

테스트 전용 WASM mode 131은 PNG를 받아 12개 u32 LE 값과 alpha[256]을 반환합니다. 값 순서는 존재, 종류(없음 0/gray 1/RGB 2/indexed 3), 명시 alpha 수, 마스킹된 sample 수, raw 3개, value 3개, 남은 ancillary 청크/바이트입니다. 기존 mode 130의 행 보고서도 같은 independent transparency oracle을 이용해 미검사 수치를 대조합니다.

JS oracle은 chunk 배열의 위치를 비교하고 big-endian Buffer 및 나머지 연산으로 sample 값을 계산합니다. 모든 유효 depth, alpha 길이, 선택적 PLTE 위치, 잘못된 tRNS 길이/중복/위치, 기존 alpha 색상 금지, unknown ancillary 유지, 입력 한도 및 실패 후 정상 재호출을 검사합니다. 실제 HWP의 PNG 32개도 회귀 비교하지만 해당 실파일에는 tRNS가 없으므로 실제 투명도 청크의 양성 검증이라고 주장하지 않습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 17/17 단계, 네이티브 355/355, 감사 스크립트 3,168,112 checks를 통과했습니다. tRNS 전용 결과는 정상 405건·거부 522건입니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 21개를 확인했습니다.
