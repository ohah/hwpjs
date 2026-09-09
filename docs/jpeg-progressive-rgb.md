# Progressive JFIF RGB 조립

Progressive 샘플 평면을 JFIF RGB로 연결했습니다. 아래 선택 검증과 Debug/ReleaseSafe/ReleaseFast 전체 회귀를 통과했습니다. 제품 JS API와 HWP BinData 이미지 검사에는 아직 연결하지 않았습니다.

## 근거와 책임

[ITU-T T.871](https://www.itu.int/rec/T-REC-T.871-201105-I/en) 5절과 6.1을 다시 확인했습니다. JFIF 문법은 8비트 1/3성분의 JPEG 프로세스를 허용하며, baseline 권고와 비-baseline 기능의 지원 여부를 구분합니다. 이 작업은 기존 Huffman progressive DCT에 한정합니다. 산술·lossless·hierarchical 프로세스나 모든 JFIF 적합성 시험을 완료했다는 뜻은 아닙니다.

- `jfif_render.zig`: 순차·progressive가 공유하는 준비/렌더링 경계입니다. JFIF 전체 배치 검사, RGB 크기 사전 검사, Adobe 전체 수집, ICC 조각 재조립을 조립합니다. 같은 파일에서 복원한 샘플에 Adobe 충돌 규칙을 적용한 뒤 기존 rgb_raster를 호출합니다. RGB/Adobe/ICC 기본 한도와 unmanaged 옵션 타입도 이 파일이 소유합니다.
- `jfif_rgb.zig`: 기존 순차 옵션과 Image 필드·진입점을 유지하며 공통 준비 → 순차 샘플 → 렌더링을 호출합니다. 기존 순차 진입점이 progressive를 자동 선택하도록 바꾸지 않았습니다.
- `jfif_progressive_rgb.zig`: 공통 준비 → progressive_samples → 공통 렌더링을 호출하고 정밀도 이력을 복사합니다. MCU·계수·IDCT·업샘플링·색 공식을 재구현하지 않습니다.

[Progressive 샘플](jpeg-progressive-samples.md), [RGB와 메타데이터 정책](jpeg-rgb.md), [중심 정렬 보간](jpeg-upsampling.md), [JFIF 색 변환](jpeg-jfif-colour.md), [반올림 경계](jpeg-idct-rounding.md)의 상세 규칙은 기존 주제 문서가 소유합니다.

## API와 소유권

`jpeg_jfif_progressive_rgb.decode(allocator, jpeg_bytes, options)`의 options.samples는 progressive_samples.Options입니다. 그 안의 frame.completion을 preserve_partial 또는 require_full로 반드시 지정합니다. options.render에서는 nearest/bilinear와 `colour_management = .unmanaged`를 반드시 지정합니다. 기존 순차 decode와 새 progressive decode는 서로 다른 프로세스의 입력을 명시적 미지원 오류로 거부합니다. 썸네일 대체나 색 해석 자동 추측은 하지 않습니다.

Result.image는 기존 JFIF Image와 동일한 공통 타입으로, 소유 RGB 래스터와 scalar 메타데이터를 가집니다. Result.components는 1 또는 3이며 progression과 levels의 활성 성분 수를 나타냅니다. levels는 최대 4성분 공간 중 components개만 유효합니다. 결과는 입력 JPEG를 보관하지 않으며 `result.deinit(allocator)`로 RGB를 해제합니다.

preserve_partial은 전송된 DC로 복원할 수 있는 성분만 허용합니다. 미전송 AC의 초기값과 부분 정밀도로 RGB를 만들더라도 unseen/partial/full 통계 및 성분별 levels를 그대로 반환합니다. 한 번도 전송되지 않은 성분은 오류이며 임의의 중간색으로 만들지 않습니다. require_full 정책과 상태값 의미는 샘플/프레임 계층을 재사용합니다. RGB 바이트가 존재한다는 사실을 모든 계수 수신 완료로 해석하지 않습니다.

공통 Prepared는 immutable JPEG의 JFIF/Adobe 메타데이터를 빌리고 Adobe descriptor 배열만 소유합니다. ICC 재조립 버퍼는 준비 단계에서 바로 해제하고 조각 수만 복사합니다. 샘플 디코더와 Prepared는 같은 입력을 처리하는 내부 조립 계약입니다. 최종 Image는 이 임시 상태를 빌리지 않습니다. 모든 단계의 실패에서 이미 할당한 메모리를 정리합니다.

## 미완료 색 관리와 독립 한도

metadata_deferred는 순차/새 progressive 모두 true입니다. ICC 조각이 연결됐다는 사실은 내부 ICC 프로파일·CMM 검증이나 색 적용 성공이 아닙니다. Exif orientation, Adobe flags, 다른 APP 의미와 미검사 압축 썸네일도 보류합니다. JFIF 헤더·Adobe 개수·ICC 조각 수·기타 APP 수·미검사 압축 썸네일·미지 확장 수를 별도로 유지합니다. 출력은 unmanaged RGB이며 display-ready sRGB나 한글 화면과의 동일성을 주장하지 않습니다.

렌더링의 RGB 기본 192,000,000바이트·Adobe 256개·ICC 16,707,345바이트 한도, 샘플/계수의 저장·처리량·픽셀·스캔/RST 한도는 독립적입니다. RGB 크기는 구조 확인 후 첫 할당 전에 검사합니다. 이것이 모든 임시 저장소를 포함한 하나의 전체 메모리 예산이라는 뜻은 아닙니다. trailing 정책도 동일한 structure 옵션을 메타데이터와 샘플 단계에 전달합니다.

## 네이티브·독립 WASM 검증

새 네이티브 필터는 Debug/ReleaseSafe/ReleaseFast 각각 8/8(root 포함), 기존 JPEG RGB 필터는 7/7입니다. gray·3성분, 입력 제거 후 소유권, 단일/3성분과 두 보간 방법의 모든 할당 실패 위치, 부분 정밀도·미전송 AC·미전송 성분 오류, 독립 한도, 늦은 Adobe 충돌 양쪽 순서·padding·모든 절단 위치·trailing 허용/거부, 기존 순차 API의 유지와 비대칭 샘플링/스캔 순서를 검사했습니다. 첫 할당부터 실패하는 할당자에서도 RGB 예산 초과는 OutOfMemory가 아니라 LimitExceeded로 먼저 거부함을 확인했습니다.

테스트용 mode 283 입력은 RGB/Adobe/ICC 한도의 u32 세 개와 보간 u8 뒤에 기존 progressive 샘플 옵션/JPEG를 붙입니다. 출력은 60바이트 헤더(width/height/RGB 길이, 기존 JFIF 메타데이터 7개, 성분 수와 progression 4개), RGB 바이트, 성분별 levels 64바이트입니다. 기존 mode 277/278의 래스터 serializer를 재사용하며 해당 wire는 바꾸지 않았습니다. 테스트 bridge는 RGB 한도를 출력 limit 이하, 샘플 한도를 limit/2 이하로도 제한합니다. 제품 ABI가 아닙니다.

`jpeg-progressive-rgb.mjs`는 제품 결과를 기대 샘플로 사용하지 않습니다. 독립 progressiveSamplesOracle에서 얻은 평면을 기존 독립 보간·색 변환에 전달하고 메타데이터/정밀도 이력을 별도로 조립합니다. 공통 JFIF 메타데이터 oracle은 jpeg-rgb.mjs, fixture의 성분 ID 부여는 기존 스캔 생성기의 명시적 ids 옵션으로 공유합니다.

세 모드 각각 새 비교 2,892건·거부 645건, 기존 RGB 비교 323건·거부 734건이 통과했습니다. 블록 경계·비대칭 샘플링·스캔 재정렬·초기 Al 0/1/3·restart·DNL·부분/완료·DC-only·APP/ICC 오류와 자원/출력 경계를 포함합니다. 출력 한도 시험은 JPEG 입력 자체가 해당 limit보다 작음을 먼저 확인해 입력 크기 오류가 출력 크기 오류를 대신하지 않게 했습니다.

## 실제 파일·적대적 검증

세 모드에서 두 보간 방법 모두 noori.hwp의 progressive JPEG 183,600픽셀(7스캔), moogung.jpg의 523,000픽셀(10스캔)이 독립 결과와 일치했습니다. s1의 progressive 변환 3개(기본, restart 1B/7B)는 각각 방식당 24,928픽셀이 독립 결과 및 원본 순차 JPEG의 RGB 바이트와 일치했습니다. 모두 unseen/partial=0입니다. 기존 순차 HWP JPEG 7참조의 방식당 총 859,875픽셀도 세 모드에서 다시 일치했습니다. 참조에는 중복 이미지가 포함되며 실제 한글/libjpeg의 렌더링 픽셀 대조는 아닙니다.

full 9×17·3성분과 partial 1×1·단일 성분의 출력 총 838바이트 각각을 XOR 1로 바꿔 세 모드에서 전부 검출했습니다. RGB뿐 아니라 메타데이터·미완료 상태·levels도 포함합니다.

격리 경로 `/tmp/hwpjs-progressive-rgb-mutants.fXt0WR/`에서 YCbCr 변환 생략·Adobe 충돌 검사 제거·levels 0 덮기·완료 통계 위조·metadata_deferred=false·렌더링 한도 전달 누락·첫 할당 전 예산 검사 제거·마지막 Adobe 헤더만 검사하는 여덟 소스 결함을 주입했습니다. 모두 세 모드에서 컴파일 후 테스트 실패로 검출했습니다. 필터 8개 중 실패는 순서대로 1/1/1/1/2/2/1/1개입니다. 제품 소스에는 변형을 적용하지 않았습니다.

실제 HWP 컨테이너 테스트에도 JFIF가 있는 순차/progressive의 RGB 독립 대조를 연결했습니다. 제품 HWP BinData JPEG 지원으로 승격한 것은 아닙니다.

전체 audit는 공유 산출물이 겹치지 않게 Debug → ReleaseSafe → ReleaseFast 순서로 실행했고, 각각 20/20단계·네이티브 883/883개·대조/거부 검사 7,812,266건을 통과했습니다. 로그는 `/tmp/hwpjs-progressive-rgb-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 유한한 시험의 통과이며 모든 JPEG 입력이나 전체 HWP 문서 지원을 보증하지 않습니다.

전체 회귀 뒤 최종 `zig build test --summary all` 883/883개와 ReleaseSafe 제품 빌드 5/5단계도 통과했습니다. 변경 Zig 포맷·JS 문법·diff 공백과 변경 문서 7개의 로컬 링크 71개를 확인했습니다.
