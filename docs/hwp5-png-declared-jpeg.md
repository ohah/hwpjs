# HWP5의 PNG 선언·JPEG 바이트 불일치

## 계약과 책임

HWP5 BinData 표 17의 EMBEDDING 형식 이름은 CFB 스트림 경로를 고르는 **선언값**입니다. 경로와 압축 해제는 기존 `container/paths.zig`·`binaries.zig`가 소유하며 이 불일치를 이유로 다른 스트림을 검색하거나 원본 압축 바이트로 재시도하지 않습니다. PNG/JPEG 형식 선택은 `container/images.zig`, JPEG 구조·샘플/RGB 검증은 기존 `jpeg_images.zig`가 소유합니다.

기본 `Options.png_declared_jpeg = .reject`에서는 UTF-16LE 확장자가 `png`이고 JPEG 바이트가 나와도 기존 PNG 검사로 `InvalidPngSignature`를 반환합니다. 명시적 `.inspect_jpeg`는 `.jpeg` 검사 옵션도 있을 때에만 JPEG SOI `FF D8`로 시작하는 해당 항목을 JPEG 검사기로 보냅니다. JPEG 선택이 빠졌다면 `MissingJpegInspector`이고, SOI가 없으면 PNG 검사 오류를 유지합니다. 이것은 PNG 검사 실패를 catch하여 다른 디코더를 시도하는 fallback이 아닙니다. JPEG 검사기의 모든 오류·한도·완료 정책은 그대로 전파됩니다. 실제 PNG 서명은 계속 PNG 검사기가 소유합니다.

성공한 불일치 항목만 `Report.images.png_declared_jpeg_images`에 계수합니다. 같은 항목은 기존 `jpeg.images`와 `jpeg.extension_disagreements`, 독립 `jpeg.rgb_bytes` 예산에도 한 번씩 집계하며 PNG 픽셀 예산에는 넣지 않습니다. 반복 참조는 매번 계산하고 보고서는 모든 검사·가산 후 원자적으로 교체합니다. 형식 선언 자체를 수정하거나 HWP 저장/왕복·렌더링 의미를 확정하지 않습니다. HWPX 기본 선택과 제품 JS 공개 API도 바뀌지 않습니다.

## 실제 표본과 독립 근거

로컬 HWP 후보 584개 중 보안 제외 뒤 DocInfo의 PNG 선언 332건을 [앞선 PNG 조사](hwp5-png-post-iend.md)에서 확인했고, 3건의 해제 바이트가 JPEG SOI/JFIF였습니다. `node tests/hwp5/png-declared-jpeg-survey.mjs`는 제품 CFB WASM으로 **정확한 경로 조회만** 수행하고, DocInfo 레코드·항목별 raw-DEFLATE·JPEG 마커/프레임/스캔은 별도 JS로 조사합니다. 독립 JS는 엔트로피 계수·RGB 픽셀 값을 완전 복원하지 않으며, 아래 RGB 바이트 수는 프레임 치수×3에서 계산합니다. Zig JPEG 검사기는 별도로 전체 RGB 복원을 수행합니다.

| 파일 SHA-256 / 크기 | 선언 경로 | JPEG 해제 바이트 / SHA-256 | 프레임 / RGB 바이트 |
| --- | --- | --- | --- |
| `c8b091cc9edf63433a7d21729d675f8fad7f68fc8f09d74b6c0f138fb91de46f` / 992,768 | `/BinData/BIN0003.png` | 141,888 / `81959d609dffa4213a69ca08fa87d12b2d71e15232708a8f33b599bc4d0543f7` | 1,314×659 / 2,597,778 |
| 같은 파일 | `/BinData/BIN0004.png` | 371,889 / `51172b15820153be699a7512653f09b622d30b6fc3f47c501b690dcf5d408910` | 1,339×1,948 / 7,825,116 |
| `5ef5d5a3c48303122903a384744eba9a44c72e814c201c9908d4a92e990d0ffb` / 90,624 | `/BinData/BIN0002.PNG` | 10,395 / `abc7bd9bb0b79d114374be19c8e2b2e6a8c8239f9ec273a859d6e3eab069c3ab` | 118×118 / 41,772 |

세 payload 모두 독립 JS에서 SOF0·스캔 1개, Zig JPEG 검사기에서 전체 RGB 복원 성공입니다. 첫 표본은 `reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp`, 둘째는 `reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp`입니다. 기본 전체 컨테이너 검사는 둘 다 `InvalidPngSignature`; 선택한 검사는 각각 `decoded=10, declared-PNG-JPEG=2, JPEG=3, RGB=21,288,063, PNG=0, unhandled=7`과 `decoded=2, declared-PNG-JPEG=1, JPEG=1, RGB=41,772, PNG=1, unhandled=0`을 반환합니다. 첫 파일의 선언 분포는 JPG 1·BMP 7·PNG 2이며, 미검사 7건은 이번 선택에서 BMP 검사기를 켜지 않았기 때문입니다. 이 BMP들의 실제 형식·내용과 두 문서의 기타 의미/화면 결과는 검증 완료가 아닙니다.

## 검증과 적대적 경계

`zig test src/root.zig --test-filter 'PNG-declared JPEG'`는 기본 거부, JPEG 검사 미선택, 진짜 PNG와 잘못된 JPEG 분리, 반복 참조·누적 RGB 한도·실패 원자성·할당 실패를 검사합니다. `zig test src/hwp5_png_jpeg_mismatch_known_survey.zig -O ReleaseFast --test-filter 'HWP PNG-declared JPEG known'`은 두 실제 파일의 개별 JPEG 복원과 전체 HWP 컨테이너 기본/선택 경로를 대조합니다. 마지막 명령과 JS 실파일 조사는 Git에 포함되지 않는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 넣지 않습니다.

적대적 검토에서는 `png` 선언만으로 JPEG로 보내지 않는지, FF D8 뒤의 손상·미지원 JPEG가 성공으로 바뀌지 않는지, 이미지 한도 우회·이중 계수·부분 보고서 갱신이 없는지, PNG 기본 경로와 HWPX 기본 경로가 바뀌지 않는지 확인합니다. 별도 실파일에서 한글 프로그램의 표시·저장 동치를 확인하기 전에는 이 정책을 자동 기본값으로 승격하지 않습니다.

최종 소스의 Debug `zig build test --summary all`은 5/5 단계·2,483/2,483 테스트, ReleaseSafe `zig build audit -Doptimize=ReleaseSafe --summary all`은 42/42 단계·2,522/2,522 테스트를 통과했습니다. ReleaseSafe 제품 빌드는 5/5 단계 통과했습니다. 새 PNG 선언·JPEG 검사 합성 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 3/3(root 포함), 실제 두 파일의 개별/전체 컨테이너 검사는 세 모드에서 각각 2/2 통과했습니다. 기존 HWP JPEG 회귀 ReleaseSafe 9/9와 HWPX 그림 회귀 Debug 13/13도 확인했습니다. 이 결과는 전체 HWP/HWPX 문서 의미 검증 완료나 화면 동치를 뜻하지 않습니다.
