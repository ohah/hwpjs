# Exif 선두 JPEG의 Adobe 색 선언 픽셀 검사

## 계약과 명세 경계

기본 HWPX JPEG 검사는 기존처럼 구조만 보거나 엄격 JFIF 픽셀을 해제합니다. `jpeg_pixels.exif_adobe_colour = true`를 명시하면, SOI 바로 뒤 APP1이 `Exif\0\0`으로 시작하고 호환되는 Adobe APP14 색 선언이 있는 이미지에 한해 별도 `src/image/jpeg/exif_adobe_rgb.zig` 경로를 선택합니다. APP1의 TIFF/Exif 필드·방향·썸네일은 **파싱하지 않습니다**. 이 옵션은 Exif 파일 전체 유효성 또는 화면 표시용 색을 인증하지 않습니다.

[ITU-T T.872 6.5.3](https://www.itu.int/rec/T-REC-T.872-201206-I/en)은 Adobe APP14 transform 1을 3성분 YCbCr로 정의합니다. 이 경로는 3성분 transform 1 또는 1성분 grayscale+transform 0만 받으며, 모든 Adobe 헤더의 식별자·transform을 검사합니다. Adobe 부재·충돌·4성분 CMYK/YCCK·다른 색 선언은 오류로 남깁니다. SOF ID는 공통 `jfif.classifyFrame`의 기본 `(1)`/`(1,2,3)` 검사를 재사용하고, 앞 단계의 [관측 `(0,1,2)` 예외](jpeg-component-id-compatibility.md)는 별도 옵션이 함께 켜졌을 때만 허용합니다. JFIF 선두 파일은 이 옵션과 무관하게 기존 경로를 사용합니다.

공통 JPEG 구조·엔트로피·순차/progressive 샘플·RGB 조립·ICC 조각·자원 한도를 재사용합니다. `pixel_inspection.Evidence.exif_adobe_colour`와 HWPX `Target.jpeg_exif_adobe_colour`는 **성공한** Exif+Adobe 색 경로에서만 true입니다. RGB는 unmanaged이며 Exif 방향 적용, ICC/CMM, Adobe flags, Exif TIFF 트리, CMYK 변환, 편집·저장 및 HWPX 문서 전체 의미 해석은 후속 책임입니다. 오류는 기존 이미지 대상별 `inspection_error`, ZIP·예산·OOM은 호출 오류 경계를 유지합니다.

## 실측과 적대적 검증

독립 Python ZIP/마커/Pillow 조사에서 두 로컬 corpus의 Exif 선두 JPEG는 34개입니다. 31개는 이 경로에서 해제됐고 RGB 길이 합계가 독립 Pillow의 168,563,982바이트와 일치했습니다. 남은 1개는 Adobe 색 선언이 없고 2개는 4성분 Adobe transform 2라 명시적 오류입니다. 해제된 31개 중 1개는 SOF ID `(0,1,2)`라 두 옵션을 모두 요구합니다. 이 개수는 픽셀 바이트 동치가 아니라 후보·형식·길이 대조입니다. 기본 엄격 JFIF corpus 집계는 변경하지 않습니다.

합성 HWPX ZIP은 기본 거부, 명시적 grayscale 성공·표식, JFIF 기존 경로 유지, Adobe 누락·색 충돌·식별자 오류·중복 Exif·엔트로피 패딩 손상, 모든 2바이트 이상 prefix 잘림, RGB·Adobe·샘플 예산, 순차와 progressive 완성/부분 계수 및 모든 할당 실패를 검사합니다. 실제 `issue5543_carried_anchor_ladder.hwpx`의 `(0,1,2)` Exif JPEG는 두 옵션을 모두 켜야 성공하고, 한 옵션만 켜면 기존 JFIF 헤더 또는 성분 ID 오류를 유지합니다. `2025 행정업무운영 편람(최종).hwpx`의 progressive `image177.jpg`는 Pillow 11.3.0과 실제 RGB 802,389바이트를 비교해 다른 채널 650개·최대 절댓값 차이 3을 확인했습니다. SHA-256은 Zig `04c262f6954de3a0cb4dea9768e3afcf31194b883fbd2b6c67531911b1153fc5`, Pillow `1abcbedf0573e2181d181fe7d29aaf733b0cf682f8d6025ebdf0b1ff2bdf8fdd`입니다. 바이트 일치 또는 모든 Exif 이미지의 정확성을 주장하지 않습니다.

변경 후 `zig build test --summary all`은 Debug 2,523/2,523, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. Exif 합성 ZIP 테스트도 별도 ReleaseSafe에서 통과했고, 선택 실파일 Exif 후보 34개와 기존 JFIF 8개 shard를 재검사했습니다. 이 통과 수치는 명시된 테스트 범위에 한정되며 HWP/HWPX 전체 포맷·화면 렌더링·편집/저장 완성을 뜻하지 않습니다.
