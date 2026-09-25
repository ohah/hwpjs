# HWPX BMP 픽셀 검사

## 계약과 경계

HWPX의 그림·브러시·OPF 전체 이미지 후보는 `src/hwpx/image_payloads.zig` 한 곳에서 ZIP 항목을 선택하고 형식별 검사를 공유합니다. BMP 바이트는 기존 `src/image/bmp/structure.zig`에 더해 `src/image/bmp/pixels.zig`로 위에서 아래로 정렬된 RGBA까지 복호화합니다. 동일한 구조 옵션을 두 번 독립 정의하지 않도록 `Options.bmp`가 구조 검사 정책을 소유하고, `Options.bmp_pixels`는 마스크·선택적 RLE·출력 한도만 소유합니다. 기본값은 색상 관리 없는 `nearest_normalized` 마스크 스케일링과 RLE 미지원입니다. `bmp_pixels=null`이면 이전 구조 검사만 수행하며 `Inspection.bmp_structure`로 구별합니다.

성공 대상은 `Inspection.bmp_rgba`와 합산 `Report.bmp_rgba_bytes`를 남깁니다. 구조는 통과했지만 팔레트 색인이 범위를 벗어나는 등 픽셀 단계가 실패하면 대상의 `inspection_error`를 남기고 성공 RGBA 바이트로 세지 않습니다. 한 문서의 각 그림·브러시·OPF 후보 보고서는 서로 별도 호출이므로 한 보고서의 기본 256 MiB BMP RGBA 한도가 세 보고서를 합친 프로세스 메모리 한도는 아닙니다. 입력 바이트·개별 RGBA 한도, 누적 RGBA 한도, 할당 실패는 오류로 처리합니다. 이미지 바이트와 픽셀 배열은 보고서에 붙잡지 않고 호출 중 해제합니다.

이 단계는 픽셀 바이트의 복호화·검사입니다. 색 프로파일 적용, BMP의 관측되지 않은 압축 변형, 그림 자르기·회전·투명도·쪽 배치, HWPX 전체 스키마, 편집·저장은 검증하지 않습니다. RLE BMP는 명시적 `bmp_pixels.rle` 정책을 주지 않으면 `UnsupportedBmpPixelCompression`으로 진단하고 구조 성공을 픽셀 성공으로 바꾸지 않습니다.

## 독립 실파일 대조와 적대적 검증

로컬 두 corpus의 읽기 가능한 HWPX 476개에서 내장 OPF BMP 후보 684개를 찾았습니다. 24비트 BI_RGB 543개, 32비트 BI_RGB 139개, 4비트·8비트 BI_RGB 각 1개입니다. 독립 Pillow 11.3.0은 원시 입력의 679개를 RGBA로 읽었지만, 파일 선언 길이 `bfSize`가 실제 바이트와 다른 6개 중 5개를 거부하고 1개는 허용했습니다. 추가로 `biSizeImage`가 실제 stride×높이와 다른 1개도 허용했습니다. 파일 크기 선언은 [Microsoft BITMAPFILEHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapfileheader)의 크기 필드 의미에 따라 엄격히 유지하고, 비영 영상 길이의 불일치는 [BITMAPINFOHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader)의 바이트 크기 의미에 비추어 정상으로 승격하지 않습니다. 이 7개를 제외한 **677개**의 RGBA 개수·총 바이트·각 파일 SHA-256 앞 64비트 합계를 독립 Pillow 결과와 Zig 선택 조사에서 8개 shard로 대조합니다. Pillow의 관대한 복호화와 원본 포맷 적합성은 같은 판정이 아닙니다. 이 합계는 픽셀 내용에 대한 독립 근거이지만, 각 픽셀의 표시·색 관리·후속 레이아웃 동치를 입증하지 않습니다.

독립 헤더 조사의 stride 계산은 이 corpus에서 684개 모두 40바이트 DIB 헤더·BI_RGB인 것을 먼저 확인한 뒤 적용합니다. 이를 다른 BMP 헤더·압축 종류 전체의 독립 검증으로 확대하지 않습니다.

Pillow는 선택적 로컬 비교 도구에만 사용하며 Zig 제품 빌드 의존성이 아닙니다. 오류 7개는 형식별 진단으로 유지하고, `inspectKnown()` 성공을 이 7개까지 유효한 이미지라는 뜻으로 해석하지 않습니다.

적대적 재조사에서 파일 크기 불일치 6개 중 5개는 2,048바이트로 잘린 원본에 훨씬 큰 `bfSize`가 적혀 있고, 나머지 1개는 선언 크기 뒤에 26바이트가 더 있습니다. 영상 길이 불일치 1개는 `biSizeImage`가 계산된 stride×높이보다 2바이트 큽니다. 구조 실패를 픽셀 복호화 성공으로 덮지 않고, 해당 대상의 원본 오류를 유지합니다.

합성 반례는 구조만 통과하는 범위 밖 팔레트 색인, 픽셀 검사 비활성화, 두 BMP의 누적 RGBA 한도, 구조와 픽셀의 독립 한도, 모든 할당 실패를 검사합니다. 그림·브러시·manifest의 기존 공유 검사 회귀도 실행합니다. 최종 소스에서 전체 Debug 테스트 2,515/2,515개, ReleaseSafe 빌드·audit, 독립 BMP 픽셀 조사 8/8 shard, HWPX `inspectKnown()` 실파일 조사 8/8 shard가 통과했습니다. BMP 성공 대상의 RGBA 합계는 1,840,218,424바이트이며 독립 Pillow 해시 합계와 shard별로 일치했습니다. 기본 audit에는 실파일 shard가 포함되지 않으므로 이 검증을 재현하려면 [개발·검증 명령](development-commands.md)의 선택 명령을 별도로 실행해야 합니다.

실제 `test-image.hwpx`의 `image1.bmp`는 그림 사이트 5개가 하나의 OPF 항목을 가리킵니다. `inspectKnown()`의 그림 보고서는 이를 대상 1개·참조 5개·RGBA 171,296바이트로, OPF 전체 후보 보고서는 별도 대상 1개·RGBA 171,296바이트로 반환합니다. 두 보고서를 합친 전역 이미지 예산이나 다섯 번의 픽셀 복호화를 주장하지 않습니다.
