# EMF+ Brush 객체

## 책임과 구조

`src/image/emf/emf_plus_brush.zig`는 [EmfPlusBrush](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/79c653fb-bf01-4f87-8bd2-eac1de71e140)의 GraphicsVersion, BrushType과 다섯 payload dispatch를 소유합니다. 완성된 Object assembler 결과는 `parseCompleted`가 ObjectTypeBrush인지 확인한 뒤 같은 parser로 전달합니다. 기본 입력 한도는 64 MiB이며 호출자가 낮출 수 있습니다.

`emf_plus_brush_values.zig`는 BrushType, 0x00~0x34의 HatchStyle과 BrushData flag 정의를 한 번만 소유합니다. Brush와 ImageAttributes가 공유하는 WrapMode는 `emf_plus_wrap_mode.zig`만 소유합니다. 명세가 정의한 BrushData 비트 `0x0000_01df`만 승인하되, 각 brush에서 의미가 없는 정의된 비트도 원값으로 보존합니다. 의미가 없다는 이유만으로 정의된 비트를 거부하지 않으며 예약 비트 5와 상위 비트는 거부합니다.

`emf_plus_simple_brush.zig`는 SolidColor의 ARGB 4바이트와 HatchFill의 HatchStyle·foreground·background 12바이트를 정확한 크기로 읽습니다. `emf_plus_linear_gradient_brush.zig`는 flags, WrapMode, RectF, 시작·끝 ARGB와 두 reserved DWORD를 보존하고 선택 데이터를 이어 읽습니다. Linear 선택 데이터의 순서는 Transform, PresetColors 또는 BlendFactors이며 수직·수평 factor가 함께 있으면 명세 순서인 수직 다음 수평으로 읽습니다. PresetColors와 factor flag의 충돌은 거부합니다.

`emf_plus_path_gradient_brush.zig`는 중심색·중심점, 주변색 배열과 Path/Point boundary를 분리합니다. signed Size와 Count의 음수, count·byte 한도와 후행 바이트를 검사합니다. Path boundary는 선언된 크기의 slice만 공통 [Path parser](emf-plus-path-object.md)에 전달하고, Point boundary는 PointF의 8바이트 폭을 사용합니다. 선택 데이터는 Transform, PresetColors 또는 수평 BlendFactors, FocusScale 순서입니다.

`emf_plus_texture_brush.zig`는 flags와 WrapMode 뒤 Transform이 있으면 먼저 읽고, 남은 payload가 있으면 공통 [Image parser](emf-plus-image-object.md)에 전달합니다. Image가 없는 길이 8의 payload도 wire 구조상 허용합니다. `emf_plus_brush_optional.zig`가 linear/path 선택 필드 순서와 충돌 검사를 공유하고, gradient 배열·행렬·ARGB·geometry는 기존 공통 모듈을 재사용합니다.

## 검증과 미지원 경계

합성 fixture는 다섯 BrushType dispatch, 53개 HatchStyle, 모든 정의 BrushData flag와 예약 비트, 정확한 고정 크기와 모든 prefix 잘림, WrapMode, reserved 값, 선택 필드 순서·충돌, 주변색·PointF 폭·signed 경계, 중첩 Path/Image 위임, 선언 한도, 후행 바이트와 잘못된 ObjectType을 검사합니다. Texture fixture는 gamma flag와 독립된 Transform 비트만으로 행렬 존재를 검증합니다.

현재 corpus에는 EMF+ Brush Object 실표본이 확인되지 않았으므로 한컴 버전별 payload나 렌더링 동등성을 실측 완료했다고 주장하지 않습니다. 이 계층은 wire 구조를 빌려 읽을 뿐 brush 렌더링, gamma 보정, WrapMode sampling, gradient 색 보간, Path fill, Image 복호화·재생, Object Table 적용이나 재직렬화를 구현하지 않습니다. reserved DWORD와 정의되었지만 해당 brush에서 무관한 flag는 의미를 추정하지 않고 보존합니다.

## 적대적 검증 기록

22개 결함(BrushType, ObjectType, 전체 크기 한도, Solid/Hatch 크기, HatchStyle, 예약 flag, linear flag 충돌·factor 순서·후행 바이트·reserved 순서, path boundary 선택·signed size·signed count·PointF 폭·색상 한도·선택 필드 순서·Path 위임, texture Transform 비트·Image 부재·Image 위임·무관한 정의 flag 승인)을 각각 독립 복사본에 주입했습니다. 최초 실행은 개별 모듈을 직접 진입점으로 삼아 import 경계 컴파일 오류를 검출로 오판했으므로 폐기했습니다. 제품 `src/root.zig`에서 실제 대상 테스트가 수집되는지 확인하고 변이별 로컬·전역 캐시를 새로 만든 Debug·ReleaseSafe·ReleaseFast에서 다시 실행해 총 66/66을 검출했습니다. 엄격 재실행에는 컴파일 실패나 분류되지 않은 종료가 없습니다. 이 과정에서 정확한 크기보다 1바이트 큰 Solid/Hatch 입력이 빠진 위치 편향을 찾아 양쪽 fixture를 보강했습니다. 변이 복사본은 `/tmp/hwpjs-emfplus-brush-mutants.JqYuiv`, 유효한 모드별 로그는 `/tmp/hwpjs-strict-<변이>-<모드>.log`에 남겼습니다.

최종 테스트 보강 뒤 전체 `audit`도 다시 실행해 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 step과 1,582/1,582 test를 통과했습니다. 모드별 구성은 native 1,543, chart ownership 31, WMF contents 8이며, 각 HWP/WASM 감사 결과는 8,905,827 checks와 imports 0입니다. 최종 로그는 `/tmp/hwpjs-emfplus-brush-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다.
