# PNG 배경색·히스토그램 검증

## 범위와 명세

`background.zig`와 `histogram.zig`는 [PNG Third Edition §11.3.4.1~2](https://www.w3.org/TR/png-3/#11bKGD)를 기준으로 bKGD/hIST를 해석합니다. `metadata.zig`에서 [§5.6](https://www.w3.org/TR/png-3/#5ChunkOrdering)의 중복·PLTE 이후/IDAT 이전 규칙을 검사하고 pixels.decode/inspect에 연결합니다. tRNS/bKGD/hIST 사이에는 추가 순서를 강제하지 않습니다.

bKGD는 grayscale 및 grayscale+alpha에서 2바이트, RGB 및 RGBA에서 6바이트의 sample입니다. 낮은 bit depth의 사용하지 않는 상위 비트를 마스킹하고 raw/value를 모두 보존합니다. indexed에서는 정확히 1바이트의 PLTE 인덱스이며 실제 palette 항목 수보다 작아야 합니다. 이미지에서 사용하지 않은 palette 인덱스도 배경색으로 지정할 수 있습니다.

hIST는 PLTE가 있어야 하며 정확히 항목 수만큼의 big-endian u16 값을 가집니다. 빈도는 근사치이므로 픽셀 개수나 총합과 같은지 검사하지 않습니다. 단, indexed 이미지에서 실제 사용한 인덱스의 빈도가 0이면 InvalidPngHistogramUsage로 거부합니다. 복원된 모든 pass의 실제 픽셀 인덱스를 검사하고 마지막 바이트의 패딩 비트는 제외합니다.

truecolor/RGBA의 PLTE는 권장 양자화 palette입니다. 어떤 픽셀이 어떤 palette 항목으로 매핑되는지 이 단계에서 결정하지 않으므로 빈도 의미 대조를 수행하지 않습니다. 그 경우 길이·배치·값 파싱은 완료하되 histogram_usage_validated=false로 보고합니다. 모든 빈도가 0인 권장 palette를 강제로 거부하지 않습니다.

## SSOT와 반환값

- `sample.zig`: tRNS와 bKGD가 공유하는 u16 원값/bit depth 마스킹. 부적합한 depth도 오류로 반환합니다.
- `Header.validatePaletteCount`: PLTE 허용 색상, 항목 수 1~256, indexed bit depth 한도를 소유합니다. PLTE bytes 파싱·tRNS·bKGD·hIST가 재사용합니다.
- `background.zig`: grayscale/RGB sample 또는 indexed 배경값의 union.
- `histogram.zig`: frequencies[256]과 유효 count를 소유하는 값. 입력을 빌리지 않으며 사용하지 않는 배열 슬롯은 0입니다.
- `palette_indices.inspectWithHistogram`: 기존 packed 인덱스 범위 검사와 같은 루프에서 선택적 빈도 0 조건을 검사합니다. 기존 inspect는 빈도 없이 이 함수를 호출합니다.
- `metadata.State`: 각 청크의 optional 값·순서·검사한 청크/바이트 수를 관리합니다. payload 검사가 성공하기 전에는 해당 값을 상태에 넣지 않습니다.

pixels 보고서에는 optional background/histogram과 histogram_usage_validated를 추가했습니다. 마지막 플래그는 histogram이 있고 indexed 픽셀과의 검사를 완료한 경우만 true입니다. 부재와 의미 대조 보류는 histogram의 존재 여부로 구분합니다.

검사한 payload/순서에 해당하는 청크·바이트만 ancillary deferred에서 제외합니다. **deferred=0이 모든 메타데이터 의미 검증 완료라는 뜻은 아닙니다.** 권장 palette의 빈도 대조 보류는 별도 플래그로 확인해야 합니다. 배경 합성·palette 양자화·RGBA 변환·화면 렌더링은 포함하지 않습니다.

## 검증

네이티브는 배경색의 alpha 유무별 길이/값, 마스킹, 모든 8-bit 배경 인덱스, histogram 항목 수 1~256·u16 경계·원문 변경 후 보존, 잘못된 한도/길이, 패딩과 실제 마지막 픽셀의 구분을 검사합니다. 초기 bKGD 오류와 해제 후 hIST 사용 오류에서 모든 할당 실패 정리도 검사합니다.

테스트용 WASM mode 132는 PNG를 받아 13개 u32 LE 보고서와 frequencies[256]의 u16 LE 배열을 반환합니다. 보고서 순서는 배경 종류(없음 0/gray 1/RGB 2/indexed 3), 배경 인덱스, raw 3개, value 3개, hIST 존재, 항목 수, 사용 검사 여부, 남은 ancillary 청크/바이트입니다. 제품 JS API에 추가한 모드는 아닙니다.

독립 JS는 chunk 배열 위치·Buffer big-endian 값·나머지 연산과 기존 독립 픽셀 복원을 이용합니다. metadata 3종의 순서 6가지, 중복·앞뒤 위치·payload 길이·palette 범위, unknown ancillary 유지, indexed의 0 빈도와 truecolor 보류, 입력 한도, 실패 후 회복을 검사합니다. 기존 mode 130/131의 반환 통계도 함께 대조합니다.

Adam7 1×2 이미지의 마지막 pass에서만 빈도 0인 인덱스를 사용하는 오류와, 같은 자리의 사용하지 않는 패딩 비트만 설정한 정상 입력을 정규 테스트에 추가했습니다. 이 보강 후 Debug·ReleaseSafe·ReleaseFast 전체 audit를 재실행해 각각 17/17 단계, 네이티브 359/359, 감사 스크립트 3,168,923 checks를 통과했습니다. 전용 결과는 정상 143건·거부 382건입니다. 실제 PNG 32개도 회귀 비교했지만 해당 파일에는 bKGD/hIST가 없어 양성 메타데이터는 합성 입력으로 검증했습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 24개를 확인했습니다.
