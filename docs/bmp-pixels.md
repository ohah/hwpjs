# BMP 비압축 RGBA 복원

## API와 현재 범위

`image.bmp_pixels.decode(allocator, bytes, options)`는 [BMP 구조 검사](bmp-structure.md) 이후 BI_RGB/BI_BITFIELDS의 픽셀을 복원합니다. 1/4/8 bpp 색인, RGB555, BGR24, BGRX32, 명시적 16/32비트 마스크를 지원합니다. 팔레트/헤더/마스크/stride를 다시 파싱하지 않습니다. 후속 [HWP BinData BMP 연결](hwp5-bin-data-bmp.md)은 별도 adapter가 소유하며 제품 JS 공개 API는 CFB 전용입니다.

RLE4/8·내장 JPEG/PNG를 구조적으로 읽더라도 여기서는 UnsupportedBmpPixelCompression으로 거부합니다. 썸네일이나 다른 형식을 대신 반환하지 않습니다. V5 프로파일 수명·extent·ICC와 색 변환도 아직 검사하지 않으며, raw 필드 보존과 실제 의미 검증을 구분합니다.

options.colour_management=.unmanaged와 mask_scaling=.nearest_normalized를 반드시 지정합니다. 전자는 색 관리된 sRGB/화면 동일성을 주장하지 않는 선택이고, 후자는 n비트 채널을 0..255로 정규화해 가장 가까운 정수로 만드는 명시적 수치 정책입니다. Windows/libjpeg·브라우저와 모든 반올림/색상 결과가 같다는 근거로 사용하지 않습니다.

반환 Image는 width/height와 top-down 행 우선 RGBA 버퍼를 소유합니다. 양수 높이의 저장 행을 뒤집고 음수 높이의 저장 행은 유지합니다. BI_RGB32의 상위 바이트를 알파로 추측하지 않으며 alpha=255입니다. 활성 비트필드 alpha가 있으면 정규화한 채널을 반환하지만 합성·premultiplication·감마 적용은 하지 않습니다. 입력 BMP를 해제해도 결과가 유효하며 `image.deinit(allocator)`로 해제합니다.

max_rgba_bytes 기본 256 MiB는 구조의 파일/픽셀 저장 한도와 독립적입니다. width×height가 출력 한도를 넘으면 할당 전에 거부합니다. 색인 범위 오류 등 할당 후 실패에서도 출력 메모리를 해제합니다. Image.metadata_deferred는 true로 남습니다.

## 명세와 실제 표본

헤더별 근거는 구조 문서에 연결했습니다. 특히 GDI INFO의 [32비트 BI_RGB 정의](https://learn.microsoft.com/en-us/previous-versions/dd183376(v=vs.85))에서 상위 바이트가 미사용임을 확인했고, [V5 비트필드](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header)의 명시적 alpha와 혼용하지 않았습니다. 5/6/10/30비트 채널 정규화는 위 API가 선택하는 수치 정책이며 Microsoft의 렌더러 구현 코드를 이식한 것은 아닙니다.

일반 HWP fixture의 BMP 2참조는 noori.hwp의 BIN0002/BIN0003이며 둘 다 INFO·BI_RGB32·image_bytes=0입니다. 각각 115×720(82,800픽셀), 92×410(37,720픽셀)입니다. 크기 0을 빈 이미지로 해석하지 않고 실제 저장 행 길이로 복원했습니다.

별도 `reference/rhwp/samples/3-09월_교육_통합_2022.hwp`의 BMP 26참조는 모두 INFO·BI_RGB24입니다. 총 28,689,681픽셀, RGBA 114,758,724바이트를 대조했습니다. 참조 수는 고유 이미지 수가 아니며, 이 추가 표본을 기존 fixture 2개와 혼동하지 않습니다. 원본 한글 화면 캡처 대조가 아니라 독립 바이트/픽셀 oracle과의 비교입니다.

## 네이티브·WASM 검증

네이티브 BMP 필터는 Debug/ReleaseSafe/ReleaseFast 각각 root 포함 9/9개 통과했습니다. 입력 제거 후 출력 수명, BI_RGB 상위 바이트 변화, 양/음수 높이, CORE 필드 부재와 INFO 0 구분, V4/V5 signed/fixed 원값, 모든 절단 위치, 크기·offset·stride·trailing, i32 최소 높이, 독립 한도, 부정 마스크, unused nibble/padding, 알파, RGB555, 잘못된 색인에서 할당 후 해제와 모든 할당 실패 위치를 검사했습니다.

테스트용 mode 285는 DIB 헤더 의미값 34 DWORD(136바이트), mode 286은 해당 헤더+파일/팔레트/마스크/stride/구간 메타데이터 15 DWORD와 원본 구간들을 반환합니다. mode 287은 width/height/RGBA 길이/metadata_deferred 16바이트 뒤 RGBA를 반환합니다. 제품 ABI가 아니며 native 구조를 메모리 덤프로 내보내지 않습니다.

`bmp-fixture.mjs`는 헤더와 저장 픽셀을 직접 생성합니다. `bmp-oracle.mjs`는 별도로 범위를 읽고 저장 행별 RGBA를 만든 뒤 행 배열을 뒤집습니다. 마스크는 비트 위치 목록과 BigInt 유리수 계산으로 대조하며 native ctz/나눗셈 구현을 호출하지 않습니다. `bmp.mjs`는 실행/기대값·거부·실파일 연결만 소유합니다.

세 모드 직접 검사는 각각 총 3,500건을 통과했습니다: 정상 출력 대조 3,333건, 압축 픽셀 미지원 확인 4건, 기타 거부 163건입니다. 도구의 comparisons=3,337에는 위 미지원 확인 4건이 포함되어 있습니다. CORE/INFO/V4/V5, 1/4/8/16/24/32 bpp, 부호·비대칭 크기·gap/tail·0/비영 image_bytes·선택 팔레트와 여러 마스크 위치/폭을 조합했습니다. 출력 한도 테스트는 입력 자체가 해당 limit보다 작음을 먼저 확인합니다.

세 모드에서 noori의 2개 BMP와 위 추가 레퍼런스의 26개 BMP가 모두 독립 헤더/구간/픽셀 결과와 일치했습니다. 당시 실제 HWP 테스트 조립에도 이 독립 검사를 넣었으며, 후속 제품 images.Budget 연결 검증은 위 별도 주제에서 관리합니다.

CORE 색인과 V5 alpha-bitfield 표본의 mode 285/286/287 출력 총 840바이트를 각각 XOR 1로 바꿔 세 모드에서 모두 검출했습니다. 원본 픽셀뿐 아니라 optional 필드와 raw 구간도 포함합니다.

## 누수 검증의 모드 편향 수정

격리 소스에서 pixels.decode의 errdefer 해제를 제거했을 때 초기 Debug/Safe는 누수를 검출했으나 ReleaseFast는 root 포함 9/9개가 통과했습니다. 로컬 Zig 0.16 std/testing.zig와 heap/debug_allocator.zig에서 기본 testing allocator의 safety가 runtime_safety를 따르고 deinit의 leak 검사가 safety에 의존함을 확인했습니다. checkAllAllocationFailures는 유도한 OOM 경로의 할당/해제량을 확인하지만 최초 무제한 실행의 성공 반환에서는 같은 회계를 비교하지 않았습니다. 기대한 색인 오류를 잡아 테스트 성공으로 바꾼 경우 이 차이가 드러났습니다.

실행 중인 첫 전체 audit의 정확한 프로세스를 중단하고, 명시적 `.safety=true, .enable_memory_limit=true` 검사 할당자에서 정상 복원/해제와 잘못된 색인 오류 후의 total_requested_bytes=0을 별도로 확인하도록 보강했습니다. 제품 디코더의 해제 코드는 원래 존재했으며, 발견한 문제는 테스트가 결함을 놓치는 조건입니다. 수정 후 정상 네이티브 필터는 세 모드 각각 9/9개를 다시 통과했습니다. 이전 누수 변형 로그를 보존하며 모든 소스 변형도 수정된 검사로 다시 실행합니다.

수정된 테스트를 `/tmp/hwpjs-bmp-mutants.ekVztB/`의 모든 변형에 반영하여 세 모드에서 다시 컴파일·실행했습니다. 저장 행 뒤집기 누락·BI_RGB32 상위 바이트를 alpha로 해석·팔레트 간격 3바이트 고정·DWORD 행 패딩 누락·RGBA 한도 무시·마스크 연속성 검사 누락·실패 시 해제 누락·CORE의 없는 info를 0값 구조로 치환·정규화 반올림 버림의 9종 모두 실패로 검출했습니다. root 포함 9개 중 실패 수는 세 모드 각각 순서대로 3/2/1/1/1/1/1/1/1개입니다. 누수 변형의 Fast 실패는 명시적 할당 회계의 0 대 4바이트 불일치로 확인했습니다. 변형은 제품 소스에 적용하지 않았으며 `*-v2.log`에 재검증 결과를 남겼습니다.

Debug/ReleaseSafe/ReleaseFast 전체 audit를 순차 실행하여 각각 20/20단계, 네이티브 899/899개, 독립 검사 checks=7,817,053건을 통과했습니다. 로그는 `/tmp/hwpjs-bmp-{Debug,ReleaseSafe,ReleaseFast}-audit-v2.log`에 남겼습니다. 이 숫자는 BMP 전용 검사 수나 지원율이 아니라 기존 회귀를 포함한 실행 집계입니다. 전체 BMP·전체 HWP/HWPX 검증 완료를 선언하지 않습니다.

전체 회귀 이후 기본 `zig build test --summary all`도 899/899개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5단계를 통과했습니다. 변경 Zig/JS 구문·포맷, diff 공백 검사와 관련 문서 4개의 로컬 링크 52개를 확인했습니다. 파일 헤더·DIB 필드·마스크·팔레트·구간 구조·소유 픽셀 복원을 책임별로 분리하고, 픽셀 계층은 기존 구조 검사 결과를 재사용합니다.
