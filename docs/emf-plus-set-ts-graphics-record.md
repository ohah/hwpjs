# EMF+ SetTSGraphics record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_ts_graphics.zig`는 MS-EMFPLUS 2.3.8.2의 EmfPlusSetTSGraphics envelope와 필드 조립을 소유합니다. Type `0x4039`, Flags의 T(bit 0)·V(bit 1), 36바이트 고정부, 선택 Palette를 검사합니다. 나머지 Flags는 MUST ignore이므로 원값을 보존합니다. T가 없으면 Size 48·DataSize 36·실제 data 36이어야 하고, T가 있으면 Palette 헤더 8바이트 이상을 포함하며 공용 `emf_plus_palette.zig`가 정확한 끝까지 소비해야 합니다.

공용 SmoothingMode, TextRenderingHint, CompositingMode, CompositingQuality, PixelOffsetMode, TransformMatrix와 Palette를 재사용합니다. 누락됐던 sparse FilterType 값 0–4, 6, 7은 `emf_plus_filter_type.zig` 한곳에서 소유합니다. 이 레코드의 CompositingQuality는 공식 필드 계약이 `MUST be a value`이므로 일반 SetCompositingQuality property에서 문서화한 Windows invalid-value fallback을 적용하지 않습니다. WorldToDevice의 여섯 f32는 NaN·무한대·signed zero를 임의 보정하지 않습니다.

V는 T와 실제 Palette를 요구합니다. Palette의 각 RGB가 표준 16개 basic VGA 색 중 하나인지 검사하며 alpha는 색상 집합 판정과 분리해 원값을 보존합니다. 공식 문서는 basic VGA 집합 자체를 열거하지 않으므로 이 16색 집합은 명세 문구를 구현하기 위한 호환성 해석입니다. V가 없는 Palette에는 이 제한을 적용하지 않습니다.

공식 문서에는 전체 record 예제가 없고 Windows는 이 record를 생성하지 않으며 GDI+ 1.1만 지원한다고 명시합니다. 따라서 검증은 공식 필드 계약에 따른 합성 wire를 사용합니다.

## 미지원 경계

graphics device context에 품질·원점·행렬·Palette를 적용하거나 Save/Restore snapshot과 함께 재생하고 렌더링하는 기능은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없으므로 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

고정부 전체 wire 순서, signed origin 극값, TextContrast 0–12, 모든 enum의 유효·인접 무효값, FilterType gap 5, TransformMatrix 특수 f32, T/V 조합, Palette 한도·trailing data·VGA/non-VGA·alpha 보존, 모든 고정부와 Palette 최소 길이 잘림, u32 크기 극값과 세 size 축, stream count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

적대적 검토는 (1) 공식 Flags·크기·필드 순서, (2) enum domain·signed/endian·특수 f32, (3) T/V·Palette 소비·VGA claim, (4) u32 overflow·stream rollback·framing, (5) SSOT와 미지원 범위의 다섯 관점으로 반복했습니다. 중복된 크기 조건 두 개는 개별 변이가 동작 차이를 만들지 못한 사실을 확인한 뒤 C별 최소 길이 한곳으로 합쳤습니다. 최종 22개 의미 변이를 모드별 독립 source와 cache, 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 campaign의 중복 조건 생존과 두 컴파일 경고 종료는 성과에서 제외하고 컴파일 가능한 최종 소스 변이로 교체했습니다. 최종 66/66회가 assertion 또는 unhandled expected-error 의미 실패였고 생존·컴파일 오류·timeout은 0입니다. 유효 로그는 `/tmp/hwpjs-tsgraphics-mutants-run2`의 60개와 `/tmp/hwpjs-tsgraphics-mutant-fix.13kAOy`의 대체 6개입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,792/1,792 테스트(공통 native 1,753, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-ts-graphics-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
