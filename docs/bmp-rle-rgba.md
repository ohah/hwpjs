# BMP RLE RGBA 복원과 미지정 픽셀 정책

## API와 명시적 선택

`image.bmp_pixels.decode`의 options.rle는 기본 null입니다. 기존 비압축 RGB/bitfields 동작과 기본 RLE 미지원 오류는 유지합니다. 선택한 경우 [RLE 색인 복호화](bmp-rle.md)를 RGBA에 연결하며, 내장 JPEG/PNG까지 다른 디코더로 시도하지 않습니다. [HWP BinData 연결](hwp5-bin-data-bmp-rle.md)은 동일 옵션을 전달합니다. 제품 JS 공개 API는 여전히 CFB 전용입니다.

rle 옵션은 원래 raster.Options와 필수 unwritten 정책으로 구성합니다. 원래 commands.padding·completion·명령/바이트/색인 한도·후행 정책을 임의로 바꾸지 않습니다. unwritten은 reject, palette_zero, transparent 중 호출자가 선택합니다. BMP 색 관리와 마스크 정규화의 기존 명시적 옵션도 그대로입니다.

- reject: 복호화된 평면에 미지정 픽셀이 있으면 UnwrittenBmpRlePixels입니다.
- palette_zero: 미지정 픽셀을 검증된 팔레트 0의 불투명 RGBA로 채웁니다.
- transparent: 미지정 픽셀만 RGBA 0,0,0,0으로 채웁니다. 실제 색인 0의 픽셀은 원래 팔레트 색과 alpha=255를 유지합니다.

이는 렌더링 소비자의 선택 정책이지 명세가 모든 빈 픽셀에 요구하는 고정 채움값이라는 주장이 아닙니다. raster.completion=.require_full이면 fill 정책과 무관하게 먼저 IncompleteBmpRleRaster로 거부합니다. preserve_unwritten+reject는 별도 RGBA 소비 단계의 거부입니다. 어느 정책도 생략된 픽셀이 원래 파일에 지정되어 있었다고 바꾸지 않습니다.

## 책임·SSOT·소유권

`pixel_image.zig`는 공통 소유 Image와 RGBA 바이트 수 사전 검사를 소유합니다. 비압축/RLE 양쪽에서 같은 검사를 사용합니다. `rle_rgba.zig`는 이미 검사한 BMP View에서 색인 평면을 얻고 팔레트 RGBA 또는 명시적 채움값을 조립합니다. `rle.decodeView`가 압축 형식 선택을 공유하며, 파일 입력 decode와 RGBA 소비자가 각각 헤더를 재구현하지 않습니다. decodeView는 structure.inspect가 만든 유효한 View를 요구합니다.

BMP 파일/DIB/팔레트/저장 경계는 pixels.decode에서 한 번만 검사합니다. RLE 명령·좌표·미지정 개수·완료 상태는 기존 복호화기가, 팔레트 범위·BGR→RGBA는 기존 Palette가 소유합니다. RLE 평면은 이미 top-down이므로 다시 행을 뒤집지 않습니다.

구조 검사 뒤 RGBA 한도를 색인 평면의 첫 할당보다 먼저 확인합니다. 그 다음 색인 평면을 복호화하고, 채움 정책을 확인한 뒤 RGBA를 할당합니다. 실패하면 두 버퍼를 정리하며 성공 시 색인 평면은 해제하고 RGBA만 반환합니다. max_index_bytes와 max_rgba_bytes는 독립 한도이고, 복원 중 두 버퍼가 겹치는 시점의 합계 메모리 한도는 아닙니다.

공통 Image는 rle:?RleEvidence를 추가합니다. 비압축에서는 null이고, RLE에서는 unwritten 정책·written_pixels·unwritten_pixels·commands·consumed_bytes·trailing_bytes를 유지합니다. 정책에 따라 채워도 unwritten_pixels를 0으로 만들지 않습니다. 보고서는 scalar이며 입력/팔레트 포인터를 보유하지 않습니다. 기존 metadata_deferred=true는 색 관리·V5 프로파일 의미·한글 화면 동일성이 미완료임을 계속 나타냅니다.

## 검증 기록

기존 RLE를 포함한 네이티브 BMP RLE 필터는 Debug/ReleaseSafe/ReleaseFast 각각 root 포함 19/19개를 통과했습니다. 새 테스트는 실제 색인 0/투명 구분·팔레트 채움·두 단계 거부·완전한 이미지의 세 정책·색인 전 출력 사전 검사·개별 한도 전달·패딩/후행/손상 오류·비압축 불변성·입력 수명·모든 할당 실패와 명시적 누수 회계를 검사합니다. HWP 쪽 근거는 위 별도 연결 문서에서 관리합니다.

테스트용 mode 290은 RLE 선택 17바이트, RGBA 한도 u32, BMP 입력을 받습니다. 출력은 width/height/RGBA 길이/metadata_deferred/RLE 존재와 정책/지정 수/미지정 수/명령 수/소비 바이트/후행 바이트의 11 DWORD(44바이트) 뒤 RGBA입니다. mode 287/289의 기존 형식은 유지합니다. RLE 선택 읽기는 HWP 테스트 경로와 bmp-rle-options.zig를 공유합니다.

독립 JS는 기존 저장 행별 RLE 색인 oracle과 별도 팔레트 색 조립으로 기대 RGBA와 진단을 만듭니다. 세 모드 각각 대조 216건·거부 161건을 통과했습니다. seed=1380401729의 명령 변이 2,000건도 승인 423/거부 1,577이 일치했고 traps=0입니다. 고정 검사 377호출 이후 첫 변이의 정상 오류를 같은 메시지의 RuntimeError로 바꾸면 세 모드 모두 378번째 호출에서 실패했습니다.

두 비트 깊이×두 채움 정책의 출력 2,224바이트를 각각 XOR 1로 바꾸어 세 모드 모두 검출했습니다. 오류 종류 검증은 bmp-errors.mjs에 공유하며 기존 RLE의 호스트 예외 방어 3건도 유지합니다. 기존 BMP/색인/HWP BMP 직접 검사는 세 모드에서 이전 결과 그대로 통과했습니다. 기존 BMP comparisons=3,337에는 압축 미지원 4건이 포함되어 있으므로 전부 정상 출력 대조로 읽지 않습니다.

실제 비압축 BMP 28참조의 기존 RGBA 결과는 유지했습니다. 조사 표본에 실제 제작 RLE BMP는 없으므로 생성기/명세 예제 검증을 실제 RLE 원본 대조라고 부르지 않습니다.

격리 복사본에서 실제 색인 0을 미지정으로 오인, 투명 채움을 팔레트 0으로 변경, 미지정 통계를 0으로 변경, require_full 무시, HWP 남은 예산 무시, RGBA 한도 검사 제거, 색인 버퍼 해제 제거, 투명 채움 보고 누락의 소스 결함 8종을 주입했습니다. Debug/ReleaseSafe/ReleaseFast 각각 19개 필터 테스트가 실행되었고 각 변형의 실패 수는 순서대로 3/2/6/2/2/3/4/2개로 일치했습니다. 해제 제거는 ReleaseFast에서도 명시적 회계가 expected 0, found 8로 검출했습니다. 임시 근거는 `/tmp/hwpjs-bmp-rle-rgba-mutants.ySuFX7/`의 변형별·모드별 로그입니다.

후행 정책 입력 도구를 보강한 뒤 전체 audit를 Debug → ReleaseSafe → ReleaseFast 순서로 다시 실행했습니다. 세 모드 각각 20/20 build steps, 925/925 네이티브 테스트, 7,830,242개 검사 항목을 통과했습니다. 정규 회귀에서도 RGBA 대조 216/거부 161, 변이 승인 423/거부 1,577/traps 0, HWP 대조 65/거부 228이 일치했습니다. 전체 로그는 `/tmp/hwpjs-bmp-rle-rgba-{Debug,ReleaseSafe,ReleaseFast}-audit-v2.log`입니다. 중단한 첫 Debug 로그는 완료 근거에서 제외합니다.

마지막 `zig build test --summary all`은 925/925 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. 변경 Zig/JS 구문·포맷과 diff 검사, 관련 문서 6개의 로컬 링크 62개도 확인했습니다. 전체 BMP/HWP/HWPX 검증 완료를 선언하지 않습니다.
