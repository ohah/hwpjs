# EMF+ Image 객체

## 책임과 구조

`src/image/emf/emf_plus_image.zig`는 [EmfPlusImage](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/02c80141-208e-4335-ad51-190b40a1802c)의 GraphicsVersion, ImageDataType과 payload dispatch를 소유합니다. `ImageDataTypeUnknown`의 payload는 형식을 추측하지 않고 원문으로 빌리며, 정의되지 않은 type 값은 거부합니다. 완성된 Object assembler 결과는 `parseCompleted`가 ObjectTypeImage인지 확인한 뒤 같은 parser로 전달합니다.

`emf_plus_image_values.zig`는 [ImageDataType](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/0eefa442-7d98-449f-b1a6-ad40575e3f25), [BitmapDataType](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/75788808-426f-48b6-8a9d-3fc41fec3963), [MetafileDataType](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/f9878a20-51f1-4ac7-ab68-8fd119521dcc), [PixelFormat](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/47cbe48e-d13c-450b-8a23-6aa95488428e)과 PaletteStyle flag 값을 한 번만 정의합니다. raw pixel은 공식 15개 PixelFormat 값만 승인하며 index·bits-per-pixel을 같은 enum에서 유도합니다. 압축 bitmap에서는 명세상 undefined인 PixelFormat 원값을 그대로 보존합니다.

`emf_plus_bitmap.zig`는 [EmfPlusBitmap](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/112a5e2c-6bb3-4daf-8ee3-0f3d3984410f)의 signed width·height·stride, PixelFormat, BitmapDataType을 읽습니다. [raw pixel data](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c236db12-fc5d-4e5b-8266-0468881cd940)는 stride가 4의 배수이고 `ceil(abs(width) * bits-per-pixel / 8)`의 4바이트 정렬값과 일치하는지 확인합니다. pixel bytes는 `abs(stride) * abs(height)`로 정확히 자르고 뒤의 0~3바이트만 alignment padding으로 보존합니다. 음수 stride와 `i32` 최소값도 좁은 signed 절댓값 연산 없이 검사합니다. [compressed image](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/9c00912b-adfa-469e-8baa-82d9d3d8d6ae)는 EXIF/GIF/JPEG/PNG/TIFF를 자동 판별·복호화하지 않고 남은 payload 전체를 빌립니다. 이 경우 width·height·stride·PixelFormat은 명세대로 undefined이므로 검증하거나 보정하지 않습니다.

`emf_plus_palette.zig`는 indexed PixelFormat에만 존재하는 [EmfPlusPalette](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/dfb51d9c-7d65-45ec-ac00-9666e0578783)를 읽습니다. count×ARGB 경계와 호출자 한도를 확인하고 공통 `emf_plus_argb.zig` 값을 재사용합니다. 정의되지 않은 PaletteStyle bit를 거부하며 HasAlpha가 설정되면 불투명하지 않은 항목이 하나 이상인지, GrayScale이 설정되면 모든 항목의 RGB가 같은지 확인합니다. Halftone의 렌더링 적합성은 이 wire parser가 판정하지 않습니다.

`emf_plus_metafile.zig`는 [EmfPlusMetafile](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/503573f8-791a-469c-a2af-d4b570585944)의 다섯 type, 선언 크기, data와 0~3바이트 padding을 구분합니다. 중첩 WMF·placeable WMF·EMF·EMF+ only/dual의 내부 유효성 검사나 재귀 재생은 각 형식 parser를 연결하는 후속 단계입니다.

## 검증과 미지원 경계

합성 fixture는 세 ImageDataType, 모든 BitmapDataType과 MetafileDataType, 공식 PixelFormat 전체, indexed palette, 양수·음수 stride, alignment padding 0~3, 압축 payload의 undefined 헤더, 모든 고정 prefix 잘림, 선언 크기 초과, 잘못된 enum·flag·stride·palette 의미, count·byte 한도와 잘못된 ObjectType을 검사합니다. 현재 HWP corpus 조사에는 EMF BinData 후보가 없고 EMF+ Image Object 실표본도 없으므로, 한컴 버전별 Image payload 또는 렌더링 동등성을 실측 완료했다고 주장하지 않습니다.

Image parser는 wire 구조와 직접 계산 가능한 크기·enum·palette 계약까지만 보증합니다. 압축 이미지 시그니처/CRC·픽셀 복호화, raw pixel 색상 변환, palette index 범위, 중첩 metafile 유효성·재생, DrawImage 적용과 ImageAttributes 처리는 미지원입니다. 기존 PNG/JPEG/GIF/BMP/WMF/EMF parser 연결은 payload 종류가 명시적으로 선택된 후 별도 계층에서 수행해야 하며, 바이트 모양을 근거로 ImageDataType을 바꾸지 않습니다.

## 적대적 검증 기록

18개 결함(Image/Bitmap/Metafile enum 범위, 압축 header 오검증, PixelFormat 승인, stride 배수·정확값, pixel 높이·signed magnitude 계산, bitmap/metafile padding, indexed palette 존재·flag·alpha·grayscale, metafile 선언 크기, ObjectType, image 한도)을 각각 독립 복사본에 주입했습니다. 캐시를 분리한 Debug·ReleaseSafe·ReleaseFast에서 총 54/54를 모두 검출했습니다. 최초 stride 배수 변이는 stride 정확값 검사에도 함께 걸리는 fixture 위치 편향 때문에 생존했으며, PixelFormatUndefined·height 0에서 나머지 1·2·3을 각각 검사하도록 배수 규칙을 독립시킨 뒤 세 모드 모두 검출했습니다. 변이 복사본은 `/tmp/hwpjs-emfplus-image-mutants.58vWIt`에 남겼습니다.

전체 `audit`도 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 step과 1,568/1,568 test를 통과했습니다. 모드별 구성은 native 1,529, chart ownership 31, WMF contents 8이며, 각 HWP/WASM 감사 결과는 8,905,827 checks와 imports 0입니다. 로그는 `/tmp/hwpjs-emfplus-image-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다.
