# BMP RLE4/RLE8 명령과 색인 평면

## 근거와 현재 범위

Microsoft [GDI Bitmap Compression](https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-compression)과 [MS-WMF RLE4](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/73b57f24-6d78-4eeb-9c06-8f892d88f1ab)의 encoded/absolute·EOL/EOB·delta 규칙을 대조했습니다. 두 공식 예제 바이트열을 테스트하며 설명의 표시 좌표와 저장 행 좌표를 혼용하지 않습니다.

`image.bmp_rle.decode(allocator, bmp_bytes, options)`는 기존 BMP 파일/헤더/팔레트/저장 경계를 검사한 뒤 BI_RLE4/BI_RLE8을 색인 평면으로 복호화합니다. 다른 압축 형식은 UnsupportedBmpRleCompression입니다. 후속 [RGBA 연결](bmp-rle-rgba.md)과 [HWP 연결](hwp5-bin-data-bmp-rle.md)은 별도 선택 계약이며 이 색인 API의 반환 형식은 유지합니다.

delta·짧은 행·조기 EOB는 픽셀을 지정하지 않을 수 있습니다. 명세 예제의 미지정 값을 0으로 두는 가정을 일반 렌더링 계약으로 확대하지 않습니다. 반환 indices는 u16이며 0..255는 실제 팔레트 색인, 256은 미지정입니다. 유효한 색인 0과 구분합니다. RGBA 채움/합성 정책은 이 정보의 소비자가 후속 단계에서 명시적으로 정해야 합니다.

## 명령 파서

`rle_commands.zig`가 format, padding 정책, Run/Command, borrowed Iterator를 소유합니다. 입력 바이트와 명령 수 한도는 기본 64 MiB/1,000,000개이고 padding 정책은 반드시 선택합니다. 각 명령을 임시 reader로 끝까지 읽은 다음 위치/개수를 갱신하므로 잘린 명령·부정 패딩·한도 오류는 현재 명령을 소비하지 않습니다. Run.bytes는 입력을 빌립니다.

- 첫 바이트 1..255는 encoded 반복 길이입니다. RLE8은 두 번째 바이트 색인 하나, RLE4는 상위/하위 nibble을 교대로 사용합니다.
- 00 00은 EOL, 00 01은 EOB, 00 02 뒤 두 u8은 오른쪽/다음 저장 행 방향의 상대 이동입니다.
- 00 03..FF는 absolute 픽셀 수입니다. RLE8은 count바이트, RLE4는 ceil(count/2)바이트이며 홀수 데이터 바이트 수에는 WORD 패딩 한 바이트가 따릅니다. 미사용 마지막 nibble은 픽셀로 읽지 않습니다.
- padding=.require_zero는 패딩 0을 요구하고 .preserve는 비영 값도 원형으로 반환합니다. GDI의 RLE8 zero-padding 문구와 RLE4의 정렬 문구를 구분하며, RLE4에도 0을 요구하는 호출은 명시적인 strict 선택입니다. preserve를 strict 명세 적합성 인증으로 해석하지 않습니다.

Run.index가 encoded/absolute의 색인 추출을 소유합니다. 명령 파서는 EOB 뒤를 자동 해석/제거하지 않으며 종료/후행 정책은 raster 책임입니다.

## 색인 평면과 경계

`rle_raster.zig`는 명령을 소비하며 출력 수명·좌표·지정 개수·완료 정책을 소유합니다. 기존 Palette.validateIndex를 재사용하고 색 공식을 만들지 않습니다. `rle.zig`는 BMP 구조 결과와 이 소비자를 조립할 뿐 헤더/팔레트를 다시 파싱하지 않습니다. 비압축 rgba도 같은 팔레트 색인 검사기를 호출합니다.

양수 BMP 높이의 첫 저장 행은 맨 아래입니다. 출력은 top-down입니다. x는 run 길이만큼 증가하고 EOL은 x=0, y+=1이며 delta는 두 unsigned offset을 누적합니다. delta 0,0도 명령을 소비하므로 명령 수 한도로 제한됩니다. run은 한 행을 넘지 않아야 하고 delta 목적지는 x<=width, y<height입니다. x=width는 다음 EOL/EOB를 위한 경계 위치로 허용하지만 거기서 픽셀을 쓸 수 없습니다. 마지막 행 뒤 EOL로 y=height가 된 경우 EOB만 허용합니다. 자동 줄바꿈·음수 이동·경계 잘라내기는 하지 않습니다.

completion=.preserve_unwritten은 미지정 값을 남기고, .require_full은 EOB 시 하나라도 남으면 IncompleteBmpRleRaster입니다. 전부 지정되어도 EOB가 없으면 MissingBmpRleEnd입니다. 기본값에서는 선언된 압축 구간 안 EOB 뒤 바이트를 TrailingBmpRleBytes로 거부하며 raster.allow_trailing_bytes=true일 때만 개수로 남깁니다. 이는 파일 bfSize 뒤 structure.allow_trailing_bytes 및 압축 구간 밖 after_pixels와 별개입니다.

width×height는 u64에서 계산하고 max_index_bytes/2와 비교한 뒤 첫 출력 버퍼를 할당합니다. 기본 256 MiB는 u16 색인 평면 크기이지 RGBA 예산이 아닙니다. commands.max_bytes/max_commands, BMP 구조 한도와도 별개입니다. 예산 초과·파싱 오류·색인 오류·완료 오류에서 출력을 해제합니다. 반환 Image는 indices를 소유하며 deinit으로 해제합니다. 입력 BMP/명령/팔레트가 사라져도 반환된 색인 평면은 유효합니다.

Image의 written_pixels/unwritten_pixels, commands, consumed_bytes, trailing_bytes는 복호화 근거입니다. 색인→색 변환·색 관리·ICC·한글 화면 동일성의 완료를 뜻하지 않습니다. V5 프로파일 의미는 기존 BMP 구조 문서의 미완료 범위로 남습니다.

## 검증 기록

네이티브 BMP RLE 필터는 Debug/ReleaseSafe/ReleaseFast 각각 root 포함 10/10개를 통과했습니다. 모든 encoded/absolute 길이, 홀수 nibble/패딩, Iterator 실패 시 위치 유지, 두 공식 예제, 입력 해제 뒤 출력 수명, 미지정/색인 0 구분, 모든 명령 종류·EOB/후행·행 초과·delta 255 및 누적 이동, 팔레트 오류, 개별 한도와 모든 할당 실패를 검사했습니다. 명시적 safety/accounting 할당자로 정상 및 실패 경로의 해제량도 확인했습니다.

테스트용 mode 289 입력은 padding/full/trailing 각 u8, 색인 바이트/명령 수/압축 바이트 한도 각 u32, BMP 파일입니다. 출력은 width/height/색인 수/지정 수/미지정 수/명령 수/소비 바이트/후행 바이트 각 u32 뒤 색인 u16입니다. 제품 ABI가 아니며 native 배열/optional 표현을 메모리 덤프로 보내지 않습니다.

JS fixture는 헤더·명령 스트림을 직접 생성합니다. 독립 oracle은 저장 행별 배열의 null로 미지정 값을 추적하고 마지막에 행 배열을 뒤집습니다. 제품의 출력 offset 계산이나 명령 파서를 호출하지 않습니다. 세 모드 각각 정상 대조 3,174건·거부 2,621건이 통과했습니다. 별도 seed=1129466949의 명령 바이트 변이 3,000건은 독립 oracle과 승인 1,040/거부 1,960이 일치했고 정상 재호출 48회가 통과했습니다. 출력 한도 테스트는 입력 길이보다 출력이 큼을 먼저 확인합니다.

두 명세 예제의 출력 576바이트를 각각 XOR 1로 바꿔 세 모드에서 모두 검출했습니다. 임의 입력 전체에 대한 증명이나 원본 한글 렌더러 대조로 해석하지 않습니다.

실제 HWP fixture의 BMP 2참조와 별도 `reference/rhwp/samples/3-09월_교육_통합_2022.hwp`의 26참조를 다시 조사했습니다. 각각 BI_RGB32/BI_RGB24이며 RLE가 아니었습니다. 세 모드에서 기존 BMP 헤더/구간/RGBA 대조는 그대로 통과했고 새 RLE 전용 진입점은 명시적 형식 오류로 거부했습니다. 조사한 reference 및 핵심 fixture 트리에서도 독립 .bmp/.rle 파일은 찾지 못했습니다. 실제 제작 프로그램이 저장한 RLE BMP 표본을 검증했다는 주장은 하지 않습니다.

격리 경로 `/tmp/hwpjs-bmp-rle-mutants.niv3Ui/`에 nibble 순서 반전·행 방향 반전·미지정 값을 0으로 채움·delta y 누적 대신 대입·require_full 무시·패딩 검사 무시·색인 버퍼 한도 무시·실패 시 해제 누락·팔레트 범위 검사 누락·명령 수 한도 무시의 10종 결함을 주입했습니다. 세 모드 모두 컴파일 이후 테스트 실패로 검출했습니다(root 포함 10개 중 실패 수는 순서대로 4/3/4/1/1/1/1/1/2/1개). ReleaseFast 해제 누락에서는 명시적 회계의 0 대 2바이트 불일치를 확인했습니다. 제품 소스는 변형하지 않았으며 해당 경로에 소스와 로그를 남겼습니다.

## 예외 종류 검증의 사각지대 보강

첫 전체 회귀 도중 JS 변이 검사의 `assert.throws`가 임의 예외를 허용해 WASM trap까지 정상 거부로 집계할 수 있음을 발견했습니다. 앞의 고정 검사 5,795호출 뒤, 변이 입력의 제품 오류를 모두 WebAssembly.RuntimeError로 바꾸는 wrapper에서 주입 trap 1,960개가 기존 테스트를 통과하는 것을 실제 재현했습니다. 실제 제품 trap을 발견했다는 뜻이 아니라 테스트가 가린 결함 종류를 입증한 것입니다.

첫 회귀는 Debug/Safe까지 끝난 뒤 실행 중인 Fast의 정확한 build 프로세스를 중단했고 shell 종료 코드 143 및 남은 build/audit 프로세스 부재를 확인했습니다. 기존 로그는 보존합니다. 제품/네이티브 코드는 바꾸지 않고 RLE의 모든 JS 거부 검사에 일반 Error와 기대 파서 오류명 확인을 추가했습니다. RuntimeError/RangeError/TypeError가 메시지를 흉내 내도 거부되도록 오류 클래스 방어 3건을 정규 검사에 넣었습니다. 독립 oracle도 의도한 검증 오류와 missing EOB 외의 예외는 다시 던집니다.

수정 후 세 모드 직접 검사는 각각 기존 3,174대조/2,621거부와 변이 3,000건(1,040승인/1,960거부), 복구 48건, traps=0으로 통과했습니다. 같은 trap 주입 wrapper는 세 모드에서 첫 주입 즉시 AssertionError로 실패함을 확인했습니다. 전체 회귀를 수정된 테스트로 처음부터 다시 실행했습니다. RGBA/HWP 연결 및 전체 문서 검증 완료를 선언하지 않습니다.

Debug → ReleaseSafe → ReleaseFast 전체 재회귀는 각각 20/20단계·네이티브 916/916개·checks=7,827,383건으로 통과했습니다. 최종 로그는 `/tmp/hwpjs-bmp-rle-{Debug,ReleaseSafe,ReleaseFast}-audit-v2.log`이며, v2 없는 첫 실행 로그와 구분합니다. 검사 횟수는 기존 전체 회귀를 포함한 도구 집계이지 RLE 지원율이나 독립 제작 RLE 표본 수가 아닙니다.

격리 변형 10개의 src 파일 829개씩을 현재 제품 src와 바이트 대조하여 각 변형에서 주입 대상 파일 하나만 다르고 네이티브 테스트는 동일함을 확인했습니다.

전체 재회귀 뒤 최종 기본 `zig build test --summary all`도 916/916개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5단계를 통과했습니다. 변경 Zig 포맷·JS 문법·diff 공백 검사와 관련 문서 6개의 로컬 링크 66개를 확인했습니다. 팔레트 색인 규칙은 기존 팔레트 계층에 하나만 두고 비압축/RLE 경로에서 공유합니다.
