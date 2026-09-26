# PNG RGBA 픽셀 조립

## 계약과 책임

[PNG Third Edition](https://www.w3.org/TR/png-3/)의 색 타입·비트 깊이·Adam7·tRNS 규칙을 사용합니다. `src/image/png/rgba.zig`는 명시적 메모리 기반 진입점으로, 기존 `pixels.decode`의 검증·복원 행을 `rgba_raster.zig`에서 8비트 RGBA로 조립합니다. PNG 색 타입 0/2/3/4/6의 허용 비트 깊이를 모두 대상으로 합니다. 반환 버퍼는 소유한 위→아래 행 우선, **비선행 알파(unassociated alpha)** RGBA이며 `Image.deinit`으로 해제합니다. 입력 PNG의 수명과 독립적입니다.

`palette_colours.zig`는 검증된 PLTE의 8비트 RGB 값을 `pixels.Decoded`에 복사하고 팔레트 해석의 단일 출처가 됩니다. indexed-color의 tRNS 알파는 기존 `transparency.zig`의 생략 항목 불투명 규칙을 재사용합니다. 저비트 회색은 원래 sample로 tRNS를 비교한 다음 8비트 전체 범위로 확대합니다. 16비트 회색/truecolor도 **16비트 전체 값으로 먼저** tRNS를 비교합니다. 8비트 축소는 `floor(sample × 255 / maximum + 0.5)` 정책입니다. Adam7 pass는 기존 layout의 좌표로 최종 이미지에 배치합니다. 배경 합성·ICC/gAMA/cHRM/sRGB 적용·방향·APNG·저장은 하지 않으며, 이 RGB가 색 관리된 화면 sRGB라는 뜻도 아닙니다.

출력 한도 `max_rgba_bytes`는 기본 256 MiB입니다. PNG 구조를 검사한 뒤 `width × height × 4`의 overflow와 출력 한도를 **IDAT 해제 전에** 확인합니다. 복원 행 한도 `pixels.max_decoded_bytes`와 별도이며 두 버퍼·압축 입력이 동시에 존재할 수 있으므로 전체 프로세스 메모리 한도가 아닙니다. 직접 `fromDecoded`를 호출해도 canonical layout·행 버퍼 길이를 확인하고 잘못된 레이아웃은 인덱싱 전에 거부합니다.

이미지 공통 코어의 명시적 API이며, 선택적 [HWP5 BinData 연결](hwp5-bin-data-png-rgba.md)과 [HWPX 이미지 보고서 연결](hwpx-png-rgba.md)이 별도 누적 예산으로 호출합니다. 제품 JS API는 아직 연결하지 않았고, `pixels.inspect`의 기존 구조·복원 보고서 계약도 변경하지 않았습니다.

## 실측과 적대적 검증

합성 PNG는 모든 색 타입, 저비트 회색/팔레트, 16비트 tRNS의 축소 전 비교, 명시적 알파, Adam7 8×8 전 픽셀, 출력 한도, 모든 할당 실패와 직접 위조한 레이아웃을 검사합니다. 저비트 마지막 패딩은 픽셀로 해석하지 않습니다.

Pillow 11.3.0의 `convert("RGBA")`를 독립 기준으로 삼고 PNG 파일 자체에 ICC 변환은 적용하지 않았습니다. 로컬 PNG 57개(RGB 42·RGBA 15, 51,505,560 RGBA 바이트)와 HWP `PrvImage` PNG 32개(94,896,128바이트)를 **바이트 단위로** 대조했습니다. HWP 스트림은 Zig CFB와 Python `olefile`이 각각 독립적으로 추출합니다. 합계 89개·146,401,688바이트가 일치했습니다. 이 실파일은 8비트 RGB/RGBA 위주이며, 저비트·16비트·Adam7 양성 근거는 합성 테스트입니다. 임의 PNG·모든 ancillary 의미·HWP/HWPX 전체 문서의 동치를 뜻하지 않습니다.

재현 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

공통 코어 도입 당시 `zig build test --summary all`은 Debug 2,539/2,539개·5/5단계, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5단계 통과했습니다. PNG 필터 87/87개와 위 89개 실파일 대조도 통과했습니다. 이후 상위 보고서 연결의 검증 결과는 각 주제 문서가 소유합니다. 이 코어 결과는 JS API나 전체 문서 파싱의 완성을 뜻하지 않습니다.
