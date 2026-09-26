# HWPX PNG 선택 RGBA 검사

## 계약·SSOT

그림·브러시·OPF 전체 후보가 공유하는 `src/hwpx/image_payloads.zig`에 `png_pixels = .{}`를 명시할 때만 공통 [PNG RGBA 코어](png-rgba.md)를 실행합니다. 기본값 null은 기존 `Inspection.png_scanlines`와 복원 행 검사·통계를 유지합니다. PNG 구조·메타데이터 정책은 `Options.png` 한 곳이 소유하고 `png_pixels`는 개별 RGBA 바이트 한도만 지정합니다. 성공 대상은 `Inspection.png_rgba`, 보고서는 기존 `png_decoded_bytes`와 별도 `png_rgba_bytes`를 반환합니다. 형식 손상 등 대상별 픽셀 실패는 `inspection_error`를 남기며 성공 RGBA 합계에 더하지 않습니다. 자원 한도·할당 실패는 기존 계약대로 보고서 호출 전체의 오류입니다. 보고서는 RGBA 버퍼가 아니라 바이트 수만 보존합니다.

`max_total_png_decoded_bytes`와 `max_total_png_rgba_bytes`는 한 **이미지 보고서** 호출 내의 독립 누적 한도이며 기본 각각 256 MiB입니다. ZIP 해제·각 대상과 총 encoded 한도는 기존 정책 그대로입니다. 한 OPF 항목을 그림/브러시 여러 사이트가 참조하면 해당 보고서 안에서 한 번 검사합니다. 그림·브러시·OPF 전체 후보 보고서는 각각 별도 호출이므로 세 보고서를 합친 전역 RGBA 예산이나 색 관리된 화면 출력을 주장하지 않습니다. ICC·APNG·배치·편집/저장은 미지원입니다.

## 실측과 적대적 검증

합성 ZIP 두 PNG는 기본 복원 행 4바이트·RGBA 0바이트와 선택 복원 행 4바이트·RGBA 8바이트를 구별합니다. 개별/누적 RGBA 및 복원 행 한도, 뒤 대상의 PNG CRC 오류를 대상 진단으로 남기는 성공분만의 합산, ZIP/출력 할당 실패, 그림·브러시에서 반복 참조 한 번만 검사하는 경로를 확인합니다.

실제 `issue5595_rotated_picture_topbottom.hwpx`의 `BinData/image1.png`는 선택 OPF 후보에서 복원 행 200바이트·RGBA 256바이트이며, 한도 255바이트에서 거부됩니다. 독립 ZIP 추출과 Pillow 11.3.0의 unmanaged RGBA SHA-256 `f33fbbcce1b234a2a3fd5b59dff4496310d5a9cefbf3720840070c7256ade3fe`가 Zig 출력과 일치했습니다. 이 8×8 PNG와 합성 경로의 증거이지 모든 HWPX 이미지나 문서 전체의 적합성 증거는 아닙니다.

재현 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

이번 연결을 포함한 전체 Debug `zig build test --summary all`은 5/5 단계·2,545/2,545 테스트, ReleaseSafe 제품 빌드는 5/5 단계 통과했습니다. 두 결과는 이 선택적 이미지 경로의 회귀 근거이며 HWPX 전체 파싱 완료 판정은 아닙니다.
