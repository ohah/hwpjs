# Adobe APP14 4성분 JPEG 픽셀

## 범위와 색 계약

[ITU-T T.872 6.3·6.5.3·7](https://www.itu.int/rec/T-REC-T.872-201206-I/en)의 Adobe APP14 선언이 있는 Exif 선두 JPEG에 한해 8비트 4성분을 명시적 선택 옵션으로 해제합니다. SOF 성분 ID는 현재 관측된 `(1,2,3,4)`만 허용하며, 다른 ID 배치는 미지원 오류입니다. JFIF 기본 경로와 일반 JPEG 자동 판별은 변경하지 않습니다.

- transform 0: 네 성분을 complemented CMYK로 해석합니다. unmanaged RGB는 각각 `round(C′×K′/255)`, `round(M′×K′/255)`, `round(Y′×K′/255)`로 만듭니다.
- transform 2: 첫 세 성분을 YCbCr 방식으로 *uncomplemented* CMY로 복원한 뒤 각 성분을 반전하고 complemented K와 곱합니다. 기존 `jfif_colour.toRgb`의 고정 소수점 양자화와 `rgb_raster`의 샘플링 정책을 재사용합니다.
- transform 1·기타 값, 누락·충돌하는 Adobe 선언, 미지원 성분 ID/정밀도는 RGB로 추측하지 않고 오류로 돌려줍니다.

`adobe_cmyk_colour.zig`는 위 색 산술만, `exif_adobe_rgb.zig`는 선언·성분 정책만, `rgb_raster.zig`는 평면 샘플링·RGB 버퍼만 소유합니다. ICC 조각은 구조적으로 모을 뿐 색 관리(CMM)를 하지 않습니다. RGB는 화면용 sRGB나 한글 프로그램의 렌더링과 동일하다고 주장할 수 없습니다. Exif 방향 적용·편집·저장도 범위 밖입니다.

## 실측·적대적 검증

합성 HWPX ZIP은 기본 엄격 JFIF 경로의 거부, transform 0/2 선택 성공, transform 1·성분 ID 오류, RGB·샘플 예산, 모든 할당 실패를 확인합니다. 같은 입력을 `pixel_inspection`과 HWPX 보고서에서 거치므로 별도 색 산술을 복제하지 않습니다.

두 로컬 corpus의 Exif 선두 JPEG 34개 중 33개가 선택 옵션에서 해제되고 총 RGB 길이는 171,143,412바이트입니다. 이전에 거부하던 Adobe transform 2 이미지 2개가 추가됐으며, 1개는 Adobe 선언이 없어 계속 거부됩니다. 두 YCCK 파일은 각각 1,211×355, RGB 1,289,715바이트입니다. 이는 후보·길이의 실측이지 전체 JPEG 의미 정확성의 증거가 아닙니다.

`issue6269/156739836_public_sector_jobs_stats.hwpx`의 `BinData/image1.jpg`를 Pillow 11.3.0의 unmanaged CMYK→RGB와 실제 바이트로 대조했습니다. Zig SHA-256은 `69ef7f808d6c286c51a5b1201d901ff2b7403d90f0c725b545c47c111befe8d8`, Pillow는 `a627653a1a092eafc5f3de44019d9cdfd5153c851b54119521fed0c33d621131`입니다. 1,289,715채널 중 3,206채널이 다르고 최대 절댓값 차이는 3입니다. 따라서 색 순서와 규모의 독립 대조는 통과했지만 픽셀 바이트 동치는 아닙니다. ICC가 들어 있는 실제 이미지이므로 색 관리 결과와의 일치도 주장하지 않습니다.

재현 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

이번 변경 후 `zig build test --summary all`은 Debug 2,530/2,530개·5/5단계, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5단계 통과했습니다. JPEG 필터 192/192개, 선택 Exif corpus 34개, 세 가지 독립 Pillow RGB 대조도 통과했습니다. 이 수치는 테스트 집합의 결과이지 HWP/HWPX 전체 파서나 화면 픽셀 일치율이 아닙니다.
