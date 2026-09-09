# BMP 파일·DIB 헤더와 저장 영역

## 지원 경계와 근거

Microsoft의 [파일 헤더](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapfileheader), [CORE](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapcoreheader), [GDI INFO](https://learn.microsoft.com/en-us/previous-versions/dd183376(v=vs.85)), [V4](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv4header), [V5](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header), [헤더 종류](https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-header-types)를 대조했습니다. 최신 INFO API 문서의 DirectShow/YUV·하드웨어 surface 의미를 BMP 파일에 적용하지 않습니다.

BM 파일 헤더와 12/40/108/124바이트 Windows DIB 헤더를 읽습니다. OS/2 확장 16/64바이트, 비표준 52/56바이트, 배열·아이콘·파일 헤더 없는 packed DIB 자동 탐지는 이 진입점의 지원 범위가 아닙니다. 모르는 크기에서 가까운 버전을 추측하지 않고 UnsupportedBmpHeader로 거부합니다.

현재 이 계층은 헤더와 저장 경계를 검사하며, [비압축 픽셀](bmp-pixels.md)은 별도 디코더가 담당합니다. RLE4/8·내장 JPEG/PNG의 header/저장 바이트를 읽는 것과 그 압축 내용을 복호화하는 것은 다릅니다. HWP BinData의 제품 BMP 검사 연결은 아직 하지 않았습니다.

## 책임과 필드의 부재

- `src/image/bmp/file_header.zig`: BM 식별, 선언 파일 크기, 예약값 0, 픽셀 시작 offset. 14바이트만 읽는 prefix 파서입니다.
- `header.zig`: DIB 크기별 필드 배치와 차원/planes/bit-count/압축 조합. 반환 Header.raw는 소비한 DIB 헤더만 빌리므로 길이가 곧 소비량입니다.
- `masks.zig`: 활성 RGB/alpha 비트 마스크와 수치 변환 규칙.
- `palette.zig`: RGBTRIPLE/RGBQUAD 원본 배열·예약 바이트·색인 접근.
- `structure.zig`: 위 파서의 조립, 파일/팔레트/픽셀 범위, gap·후행 바이트와 stride. 모든 View는 입력을 빌리고 할당하지 않습니다.

CORE의 폭·높이는 u16이며 top_down=false입니다. INFO 이후는 폭 i32 양수, 높이 i32 비영 값으로 읽고 높이의 부호와 절댓값을 분리합니다. i32 최솟값의 부호 반전은 i64에서 하여 overflow를 피합니다. 높이를 읽었다고 모든 크기의 이미지를 할당한다는 뜻은 아니며 별도 픽셀 한도가 있습니다.

Header.info는 CORE에서 null이고 INFO 이후에는 image_bytes·부호 있는 X/Y 해상도·colours_used·important_colours를 가집니다. 0으로 선언된 image_bytes와 필드가 존재하지 않는 CORE를 합치지 않습니다. V4/V5의 Header.colour는 원본 RGBA 마스크, 색공간 식별자, 부호 있는 2.30 endpoints 9개, unsigned 16.16 gamma 3개입니다. Header.profile은 V5에만 존재하며 intent/offset/size를 원형으로 보존합니다. V5 예약 DWORD는 0이어야 합니다.

색공간·endpoint/gamma 의미, 렌더링 intent와 important_colours 의미는 아직 검증하지 않습니다. 특히 **V5 profile offset/size는 읽고 보존할 뿐 따라가지 않습니다.** Profile의 파일 내 extent, ICC 내부, CP1252 링크 문자열, 색 변환도 후속 범위입니다. 엉뚱한 profile offset이 raw 필드로 반환돼도 프로파일이 유효하다는 뜻이 아닙니다. 외부 경로·네트워크를 열지 않습니다.

## 형식·팔레트·마스크

CORE는 1/4/8/24 bpp, INFO 이후 BI_RGB는 1/4/8/16/24/32 bpp를 허용합니다. BI_RLE8/4는 각각 8/4 bpp, BI_BITFIELDS는 16/32 bpp, BI_JPEG/PNG는 0 bpp를 요구합니다. 다른 압축 값은 명시적 미지원 오류입니다. 압축된 형식에는 음수 높이를 허용하지 않습니다.

색인 이미지에서 colours_used=0은 2^bpp개 팔레트이고, 비영 값은 그 이하의 선언 개수입니다. true-colour의 비영 colours_used는 선택적 최적화 팔레트로 읽지만 픽셀 색인으로 사용하지 않습니다. CORE는 3바이트 BGR, 나머지는 4바이트 BGR+예약 0입니다. [RGBQUAD](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-rgbquad)의 예약 바이트를 알파로 바꾸지 않습니다.

INFO BI_BITFIELDS는 DIB 뒤의 RGB DWORD 3개를 읽고, V4/V5는 DIB 내부의 RGBA DWORD를 사용합니다. 활성 RGB 마스크는 비영, 각각 연속 비트이며 서로/alpha와 겹치지 않고 픽셀 폭 안에 있어야 합니다. 선택 alpha=0과 사용하지 않는 픽셀 비트는 허용합니다. BI_RGB16은 RGB555, BI_RGB32 상위 바이트는 미사용으로 처리합니다. 비활성 V4/V5 mask 원값은 Header.colour에 남기며 픽셀에 자동 적용하지 않습니다.

## 저장 경계와 한도

선언 bfSize만 파일로 제한하며 입력보다 크면 잘림, 14보다 작으면 잘못된 크기입니다. 기본값에서는 bfSize 뒤의 입력을 거부하고, allow_trailing_bytes=true일 때만 trailing으로 분리합니다. bfOffBits는 DIB·외부 마스크·팔레트 뒤이며 선언 파일 안에 있어야 합니다.

비압축 행 길이는 [DWORD 정렬 규칙](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader#calculating-surface-stride)으로 계산합니다. 저장 크기는 stride×절대 높이이며, 비영 선언 image_bytes와 다르면 거부합니다. GDI 문서의 명시적 0 허용에 따라 BI_RGB의 0은 계산값으로 해석하고 BI_BITFIELDS의 0은 이 strict 계약에서 거부합니다. 선언값 자체는 Header.info에 남습니다. compressed 바이트는 비영 image_bytes만큼 경계 검사하며 entropy/RLE 명령의 유효성은 주장하지 않습니다.

header.max_pixels는 기본 100,000,000픽셀, max_bytes는 64 MiB, max_palette_entries는 65,536개, max_pixel_bytes는 256 MiB입니다. 크기 산술은 u64에서 계산하고 usize/입력 경계로 좁히기 전에 검사합니다. 팔레트·파일 바이트와 RGBA 출력 한도는 별개입니다.

픽셀 앞 gap, 픽셀 뒤 after_pixels, 선언 파일 밖 trailing은 별도 borrowed slice로 유지합니다. after_pixels에 포함될 수 있는 V5 프로파일을 검증한 것으로 세지 않습니다. 행 패딩과 홀수 폭의 사용하지 않는 마지막 비트/nibble은 색인으로 읽지 않습니다. metadata_deferred는 항상 true입니다.

구현·독립 대조·실파일·적대적 검증 기록은 [비압축 픽셀 작업](bmp-pixels.md)에서 관리합니다.
