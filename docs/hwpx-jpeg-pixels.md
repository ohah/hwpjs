# HWPX JPEG 픽셀 검사

## 계약과 책임

HWPX 그림·브러시·OPF 전체 이미지 후보는 `src/hwpx/image_payloads.zig`에서 동일한 JPEG 바이트 경계를 공유합니다. 기본값은 기존 `jpeg_framing`이며, `jpeg_pixels=.{}`를 명시하면 `jpeg_rgb` 단계에서 공통 `src/image/jpeg/pixel_inspection.zig`의 JFIF 순차·progressive RGB 복호화를 실행합니다. HWP5의 `container/jpeg_images.zig`도 같은 형식 코어를 호출하되 기존 보고서 모양과 `UnsupportedHwpJpegProcess` 오류 이름을 유지합니다. HWPX가 HWP5 컨테이너 모듈을 참조하지 않으며, JPEG 구조 정책의 단일 출처는 `Options.jpeg`입니다.

픽셀 선택에서는 `render.upsampling`과 색 관리 미적용을 명시하고, progressive는 `require_full`로 고정해 부분 계수를 RGB 성공으로 표시하지 않습니다. 샘플/블록/계수·ICC/Adobe/개별 RGB 한도도 공통 코어에 전달합니다. `max_total_jpeg_rgb_bytes`는 한 이미지 보고서의 성공 RGB 바이트 누적 한도이고 기본 256 MiB입니다. `Report.jpeg_rgb_bytes`는 성공 대상만 합산합니다. 형식 내부 오류·미지원 프로세스는 대상별 `inspection_error`이고, ZIP 실패·한도·할당 실패는 호출 오류입니다. 복호화 버퍼는 호출 중 해제합니다. 기본값이 구조 검사인 이유는 아래 관측된 대형 문서·비JFIF 변형을 성공으로 가장하지 않고 기존 검사 범위와 자원 예산을 보존하기 위해서입니다.

`jpeg_rgb`는 화면 출력용 sRGB, ICC 적용, Exif 방향, CMYK 변환, 그림 배치·자르기, 전체 HWPX 스키마, 편집·저장 완료를 뜻하지 않습니다. 구조만 성공한 `jpeg_framing`도 픽셀 의미를 인증하지 않습니다. 각 그림·브러시·OPF 보고서는 서로 별도 호출이므로 256 MiB 한도가 이들을 합친 프로세스 한도는 아닙니다.

## 독립 corpus 조사와 검증 경계

`python3 tools/hwpx-fill-brush-image-oracle.py --jpeg-readiness`는 로컬 두 corpus의 ZIP/OPF 후보를 Python으로 독립 선택하고 Pillow 11.3.0으로 실제 픽셀 해제·크기를 검사합니다. 읽기 가능한 비암호화 HWPX 476개에 내장 JPEG 후보 820개가 있고, 선두 APP에서 JFIF 식별자가 786개·Exif 식별자가 34개입니다. Pillow는 807개를 해제했고 13개를 거부했습니다. 해제된 807개의 모드는 RGB 489·그레이스케일 316·CMYK 2개이며 progressive는 20개입니다. 모든 해제 대상을 RGB로 환산한 **이론적** 바이트 합계는 1,797,481,077바이트입니다. 이는 우리 파서의 성공 개수나 픽셀 내용 동치가 아닙니다.

한 문서의 JPEG RGB 환산 합계는 최대 1,099,249,830바이트이고 한 대상은 최대 104,404,245바이트입니다. 이 대형 문서의 31개 JPEG는 SOF 성분 ID가 `(0,1,2)`라서 현재 엄격 JFIF 경로에서 **예산에 닿기 전에** 거부됩니다. [ITU-T T.871의 JFIF 성분 ID](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-T.871-201105-I%21%21PDF-E&lang=e&type=items)는 3성분일 때 `(1,2,3)`을 명시합니다. 나중에 관측 편차를 별도 정책으로 복호화하더라도 이 문서의 JPEG를 모두 처리하려면 256 MiB 누적 한도를 명시적으로 조정해야 합니다. 이 수치를 근거로 기본 한도를 임의로 1 GiB 이상 늘리거나, 한도 오류를 손상 이미지 진단으로 삼키지 않습니다. 선두 Exif·Pillow 성공만으로 JFIF 요구 충족이나 우리 디코더의 성공을 추정하지 않습니다.

선택적 Zig 실파일 검사 8개 shard의 후보 820개 중 JFIF RGB 715개·성공 RGB 합계 487,055,718바이트가 반환됐습니다. 나머지 105개는 선두 JFIF 부재 34, 마커 오류 13, JFIF 성분 ID 오류 33, JFIF/Adobe 색 선언 충돌 24, 중복 JFIF 1개로 대상별 오류를 남겼습니다. 독립 Python의 선두 APP·SOF ID·JFIF 개수·Pillow 오류 분포는 부재 34, ID가 `(0,1,2)`인 대형 문서 31개, 중복 JFIF 1개, Pillow 거부 13개와 3성분 JFIF에 Adobe transform 0이 붙은 24개를 별도 재현합니다. Pillow의 관대한 RGB 해제 807개와 Zig의 엄격 JFIF 성공 715개는 서로 다른 판정 범위이며, 성공 개수·크기 합계만으로 두 디코더의 픽셀 바이트 동치를 주장하지 않습니다.

합성 ZIP의 순차·progressive JPEG 두 개에 대해 구조 전용 0바이트, 명시적 픽셀 선택 6 RGB 바이트, 누적/개별/샘플/구조 한도, 픽셀 단계 엔트로피 오류, 미지원 산술 프로세스의 대상별 오류, 모든 할당 실패를 검사합니다. `shapecontainer-2.hwpx`의 1,240×84 그레이스케일 JPEG는 `inspectKnown()`의 그림·OPF 두 보고서에서 각각 RGB 312,480바이트로 확인합니다. 보고서 간 중복 복호화와 별도 예산을 합쳐 하나의 전역 예산인 것처럼 주장하지 않습니다. 전체 corpus의 RGB 출력 내용에 대한 독립 바이트 동치, 관측 비준수 JFIF 변형의 안전한 호환 정책, Exif·CMYK 색 의미는 아직 검증되지 않았습니다.

적대적 픽셀 내용 대조에서는 위 그레이스케일 JPEG의 RGB SHA-256이 Zig `bb76fe42843734b3201859908bbe72fea06210ed008238f93bbb66c5e76de001`, Pillow `77edee45a0a7fbd1918d135a0ffb40a5842208c59a6ee6343d05575be5ff776e`로 **다릅니다**. 두 디코더의 크기가 같아도 바이트 동치는 성립하지 않으며, 이 결과만으로 어느 쪽 복호화가 잘못됐는지도 판정할 수 없습니다. IDCT·반올림·성분 처리의 차이는 후속 독립 샘플·오차 분포 검증 대상으로 둡니다.

## 최종 회귀와 적대적 검토

최종 소스의 전체 Debug `zig build test --summary all`은 종료 코드 0·2,520/2,520 테스트, ReleaseSafe 제품 빌드는 5/5 단계, ReleaseSafe 전체 `audit`과 `compare`도 종료 코드 0으로 통과했습니다. 8개 JPEG 선택 실파일 shard는 기본 audit에 포함되지 않으며 별도로 모두 통과했습니다. 전체 빌드 출력의 `failed command` 러너 문구는 최종 성공 종료 코드와 빌드 요약을 대체하지 않습니다.

적대적 검토에서는 부분 progressive 계수를 RGB 성공으로 표시할 수 있던 옵션을 HWPX에서 제거해 `require_full`로 고정했고, 부분·산술·잘못된 엔트로피를 대상별 오류로 확인했습니다. 독립 조사기는 선두 APP의 실제 마커 코드를 확인하도록 보강했으며, 476개 문서와 후보 820개를 제품 조사와 분할별로 대조했습니다. 비준수 성분 ID를 조용히 `(1,2,3)`으로 바꾸거나 Adobe 색 충돌을 무시하지 않고, 큰 문서의 자원 한도를 근거 없이 늘리지 않았습니다. RGB 길이 일치를 픽셀 바이트 일치라고 주장하지 않는 것이 이번 검토의 중요한 결론입니다.
