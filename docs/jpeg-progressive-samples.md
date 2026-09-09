# Progressive JPEG 샘플 평면

프레임 계수에서 성분별 샘플 평면을 만드는 코드를 구현했습니다. 실제 파일에서 발견한 IDCT 반올림 차이도 수정했으며 아래 독립 대조·적대적 검사·세 모드 전체 회귀를 통과했습니다. RGB 조립이나 제품 HWP 지원 완료와는 구분합니다.

## 책임과 현재 계약

- `src/image/jpeg/progressive_samples.zig`: progressive_frame의 소유 계수·성분별 Q snapshot·정밀도 이력을 받아 visible 영역만 복원합니다. `decode`는 계수 프레임 수명을 정리하며, `fromCoefficients`는 progressive_frame.decode가 반환한 변경하지 않은 Image를 빌립니다. 임의로 조작한 Image의 유효성까지 검사하는 API가 아닙니다.
- `sample_image.zig`: 순차·progressive에서 공유하는 성분 평면의 전체 샘플 수 제한, 할당·실패 정리·해제를 소유합니다. `sample_planes.Image`는 이 공통 타입을 재노출합니다.
- `sample_block.zig`: 기존 역양자화·IDCT·샘플 복원을 호출하고 visible 블록의 행만 복사합니다. Progressive point transform은 계수에서 이미 복원되므로 다시 곱하지 않습니다.
- `coefficient_storage.Grid.atConst`: 가변 접근과 동일한 경계·stride 계산을 사용하며 입력 계수를 수정하지 않습니다.

완료 정책은 [프레임 계약](jpeg-progressive-frame.md)의 preserve_partial/require_full을 명시적으로 선택합니다. 미전송 AC와 낮은 정밀도를 허용한 경우에도 levels와 progression을 반환하여 상태를 숨기지 않습니다. 한 번도 전송하지 않아 Q가 없는 성분은 `UnseenJpegProgressiveComponent`이며 임의의 중간색으로 채우지 않습니다.

샘플 평면은 RGB가 아닙니다. 기존 jfif_rgb 진입점은 순차 전용으로 유지하며 후속 [progressive JFIF RGB](jpeg-progressive-rgb.md)를 별도로 제공합니다. 후속 [HWP BinData JPEG 검사](hwp5-bin-data-jpeg.md)는 별도 선택으로 연결하며 제품 HWP JS API는 미완료입니다.

`jpeg_progressive_samples.decode(allocator, jpeg_bytes, options)`의 frame 옵션은 기존 프레임의 입력·마커·픽셀·저장 블록·처리량·스캔/RST 한도와 완료 정책을 전달합니다. max_samples 기본값은 64,000,000이며 모든 성분의 visible 샘플 수 합계입니다. 계수 저장 한도와 독립적이며 샘플 배열 바이트의 usize 범위도 할당 전에 검사합니다. 계수 프레임을 완성한 뒤 샘플을 조립하므로 두 저장소가 동시에 존재하는 구간이 있습니다.

Result는 Image와 progression, 최대 4성분의 levels를 소유합니다. levels 중 image.planes.len만 활성입니다. 입력을 변경·보관하지 않으며 `result.deinit(allocator)`로 해제합니다. Image의 width/height/precision, 선언 순서의 각 성분 ID·sampling·Q destination과 실제 크기·row-major u16 샘플을 유지합니다. 완성 중 오류가 나면 모든 할당을 해제하며 부분 평면을 반환하지 않습니다.

## 현재 통과한 검사

- Debug/ReleaseSafe/ReleaseFast의 progressive samples 네이티브 필터는 각각 9/9(root 포함)입니다. 소유권·할당 실패·후반 padding 오류·부분 정밀도·비정방 격자·블록 끝 자르기·수평/수직 AC 방향·성분별 마지막 Q 보존을 포함합니다. 공통 sample image 사전 한도 필터 2/2, 기존 순차 sample planes 필터 6/6도 세 모드에서 통과했습니다.
- 독립 WASM 세 모드에서 합성 입력 비교 971건·거부 14건씩 통과했습니다. 마지막 Q를 공유 목적지에 소급 적용하지 않는지, 12비트 프레임의 16비트 Q와 다른 허프먼 목적지를 확인합니다. 테스트용 mode 282는 기존 샘플 평면 wire 뒤에 progression(scans/unseen/partial/full) 4개 u32와 성분별 levels 64바이트를 붙입니다. 제품 ABI가 아닙니다.
- HWP 실제 JPEG 8참조를 세 모드에서 비교했습니다. noori의 progressive 550,800샘플과 나머지 순차 7참조의 총 1,237,819샘플이 독립 계산과 일치했습니다. 참조에는 동일 이미지가 중복됩니다.
- s1 원본의 74,784샘플과 jpegtran progressive 변환 3개(기본, restart 1B/7B)의 각 74,784샘플이 세 모드에서 모두 일치했습니다. 변환본의 progression 부가정보를 제외한 샘플 평면 wire를 원본 순차 JPEG 결과와 직접 비교했습니다.

## 실제 반올림 불일치 수정과 적대적 검증

`reference/rhwp/samples/images/moogung.jpg`에서 발견한 53개 차이의 재현·정수식 검증·제품과 독립 코드의 수정은 [IDCT 반올림 경계](jpeg-idct-rounding.md)가 소유합니다. 수정 후에는 이 파일의 785,000샘플 전체가 세 모드에서 정확히 일치했습니다. HWP 8참조와 s1 원본·변환본 3개의 위 샘플 대조도 수정 후 세 모드에서 다시 통과했습니다.

독립 샘플 oracle은 제품 계수를 기대 입력으로 재사용하지 않습니다. 기존 progressiveFrameOracle의 독립 Map 계수·Q snapshot을 역양자화하고, 독립 IDCT로 만든 블록을 샘플 좌표에서 찾아 조립합니다. 제품의 clipped row 복사와 순회 방식이 다릅니다. 프레임·샘플 테스트가 쓰는 양자화 수명/16비트 Q 입력은 jpeg-progressive-frame-cases.mjs의 공통 fixture로 분리했습니다. 샘플의 제품 wire 직렬화는 순차·progressive 모두 jpeg-sample-image-wire.zig를 재사용합니다.

full 9×17·3성분과 partial 1×1·단일 성분의 출력 총 720바이트를 각각 XOR 1로 변조하여 세 모드에서 전부 검출했습니다. 헤더·평면 메타데이터·모든 샘플·정밀도 이력을 포함합니다.

`/tmp/hwpjs-progressive-samples-mutants.F4NKTH/`에 격리한 블록 행/열 전치·첫 성분의 Q 재사용·성분별로 늘린 잘못된 샘플 예산·levels를 0으로 덮기·복원 계수를 다시 두 배로 만들기의 다섯 소스 결함은 세 모드에서 모두 컴파일 후 실패했습니다. progressive samples 필터 9개 중 각각 1/1/1/2/8개가 실패했습니다. 추가 IDCT 소스 3종·독립 JS 2종의 검출 결과는 IDCT 반올림 문서에서 관리합니다.

## 전체 회귀와 남은 범위

Debug → ReleaseSafe → ReleaseFast 전체 audit가 각각 20/20단계·876/876 네이티브 테스트·checks 7,808,710건으로 통과했습니다. 로그는 `/tmp/hwpjs-progressive-samples-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 검사 수는 지원률이나 모든 가능한 파일의 정확성 증명이 아닙니다.

전체 회귀 종료 후 최종 `zig build test --summary all`도 876/876개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`도 5/5단계로 통과했습니다. 포맷·변경 JS 문법·diff 공백·변경 문서 8개의 로컬 링크 69개 검사도 통과했습니다.

한글/libjpeg 픽셀 동일성과 T.83 적합성을 주장하지 않습니다. 이 샘플 단계의 실제 HWP 독립 대조만으로 제품 BinData 검사 지원을 입증한 것은 아닙니다. 후속 RGB 연결은 [progressive JFIF RGB](jpeg-progressive-rgb.md)가 소유하며 색 관리·orientation, 제품 HWP API는 미완료입니다.
