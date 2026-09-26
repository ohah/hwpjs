# HWP5 BinData PNG RGBA 선택 검사

## 범위·책임

`container.Options.images`는 기본 null이고, 이미지 검사 선택 후에도 `images.png_pixels`의 기본값은 null입니다. null이면 기존 [BinData PNG 복원 행 검사](hwp5-bin-data-images.md)만 수행합니다. `png_pixels = .{}`를 명시하면 같은 decoded BinData 바이트를 공통 [PNG RGBA 코어](png-rgba.md)에 한 번 전달합니다. PNG 구조·IDAT·메타데이터 정책은 기존 `images.png`가 단독 소유하고, `png_pixels`는 개별 출력 한도만 소유합니다. 실패한 복호화를 다른 형식이나 구조 성공으로 대체하지 않습니다.

보고서의 기존 `png_images`와 `pixel_bytes`는 모든 성공 PNG의 개수와 필터 바이트 포함 복원 행 합계를 그대로 뜻합니다. 선택 성공에는 `png_rgba_images`와 `png_rgba_bytes`를 별도로 더합니다. `max_total_pixel_bytes`와 `max_total_png_rgba_bytes`는 각각 복원 행과 RGBA의 독립 문서 누적 한도이며 기본 256 MiB입니다. 같은 BinData를 여러 항목이 참조하면 각 항목을 기존 예산 정책대로 셉니다. 실패한 소비 호출은 보고서를 변경하지 않고 출력 버퍼를 붙잡지 않습니다.

색 관리·화면 배치·편집/저장·제품 JS API는 여전히 범위 밖입니다. `PrvImage`는 이 BinData 경로가 아니라 별도 미리보기 계층입니다. PNG 선언이지만 실제 JPEG 바이트인 항목도 [명시적 불일치 정책](hwp5-png-declared-jpeg.md)이 계속 소유합니다.

## 실측과 적대적 검증

합성 문서/예산은 미선택 상태의 0 RGBA, 반복 참조 2회의 8 RGBA 바이트와 4 복원 행 바이트, 개별/누적 RGBA·복원 행 한도, 실패 후 보고서 불변성, 모든 할당 실패를 확인합니다.

실제 `task1749/saved_bounds_cumulative_vpos.hwp`는 PNG 선언 두 항목 중 하나가 JPEG 바이트라 기존 명시적 `.png_declared_jpeg = .inspect_jpeg`가 필요합니다. PNG 1건의 RGBA 153,664바이트를 보고하고, 한도 153,663바이트에서는 거부합니다. 별도 `olefile` + raw-DEFLATE 추출과 Pillow 11.3.0의 unmanaged RGBA SHA-256 `d14568f24bd855ad2028cd23d830104df6497a174654e4509e54daec34f12303`가 Zig 출력과 일치했습니다. 이는 이 한 파일의 픽셀 바이트 근거이지 HWP5 전체 의미 검증은 아닙니다.

재현 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

이번 연결을 포함한 전체 Debug `zig build test --summary all`은 5/5 단계·2,545/2,545 테스트, ReleaseSafe 제품 빌드는 5/5 단계 통과했습니다. 두 결과는 이 선택적 이미지 경로의 회귀 근거이며 HWP5 전체 파싱 완료 판정은 아닙니다.
