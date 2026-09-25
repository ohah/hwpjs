# Exif JPEG IFD0 방향값 판독

## 계약과 소유권

`src/image/jpeg/exif_tiff.zig`는 `Exif\0\0` APP1 payload의 TIFF 바이트 순서·값 42·IFD0 테이블 경계만 확인하고, IFD0의 Orientation(tag 274) 원값 1~8을 읽습니다. 0th IFD의 다른 필드 값, 태그 정렬, 다음 IFD·Exif/GPS/Interoperability 포인터 대상, 썸네일은 검사하지 않습니다. 중복·잘못된 Orientation 자체는 오류입니다. TIFF 기본 정수 읽기는 `src/image/tiff/structure.zig`를 공유하지만, 그 모듈의 **전체 필드·IFD chain strict 검사 성공**을 주장하지 않습니다. CIPA의 [Exif 규격](https://www.cipa.jp/std/documents/e/DC-008-2010_E.pdf)은 APP1 식별자 뒤 TIFF 헤더와 0th IFD, 선택적인 1st IFD, IFD0의 Orientation 1~8을 정의합니다. 현행 규격 목록은 [Exif 3.1](https://www.cipa.jp/e/std/std-sec.html)이지만, 이 계층은 그 전체 스키마 구현이 아닙니다.

HWPX에서는 `jpeg_pixels.exif_adobe_colour = true`인 Exif 선두 JPEG에서만 추가로 `jpeg_pixels.inspect_exif_orientation = true`를 선택합니다. 기본은 false이며 기존 JFIF·Exif 픽셀 판정은 바뀌지 않습니다. 성공 대상의 `jpeg_exif_orientation_inspected`는 IFD0 방향 필드 판독을 시도해 경계를 통과했다는 뜻이고, `jpeg_exif_orientation`이 null이면 방향 태그가 없다는 뜻입니다. `jpeg_exif_nested_ifds_deferred`는 IFD0의 Exif/GPS 포인터 **존재만** 알립니다. 방향값은 화면 회전·반전, 크기 교환, 색 관리, 편집/저장에 적용하지 않습니다. 오류는 기존 대상별 `inspection_error`에 남고, 옵션의 `max_fields`는 IFD0 항목 수를 제한합니다.

## 관측과 적대적 검증

독립 Python ZIP/OPF 선택과 Pillow 11.3.0의 `getexif()` 조사에서 Exif 선두 JPEG 34개 모두 판독됐고, 방향 1이 31개·태그 부재가 3개였습니다. Zig의 별도 IFD0 판독도 같은 34개에서 31/3입니다. 픽셀까지 지원하는 Exif+Adobe 31개 중에는 방향 1이 29개·부재가 2개이며, 모두 명시적 옵션에서 RGB 바이트 수가 기본 경로와 같습니다. 이 corpus에는 2~8 방향값이 없어 합성 테스트로만 검사했습니다. Pillow와 같은 개수라는 사실은 임의 Exif 필드나 렌더링의 동치를 증명하지 않습니다.

범용 TIFF strict 검사기를 Exif APP1 전체에 적용하는 초안은 위 픽셀 성공 31개 중 15개를 태그 역순·다른 필드 extent·빈 IFD 때문에 거부했습니다. 이 현상은 원본 전체가 유효하다는 증거도, Orientation 판독 실패의 증거도 아닙니다. 그래서 이번 API는 **IFD0 방향값만** 읽으며, 문제 있는 다른 필드를 정상으로 승인하지 않습니다. 합성 반례에서는 양·리틀 엔디언, 방향 6/8, 값 부재, 모든 prefix 잘림, 잘못된 오프셋·타입·개수·범위·중복, 항목 수 한도, 태그 역순, 범위 밖 하위 포인터의 미검증 표식, 썸네일 포인터의 미검증 표식, HWPX 옵션 해제·대상별 오류·OOM을 확인합니다.

변경 후 `zig build test --summary all`은 종료 코드 0·2,526/2,526 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. 새 HWPX 합성 경로도 별도 ReleaseSafe에서 통과했습니다. 이 결과는 IFD0 방향 판독 계약의 검증이지 Exif 전체 구조, 픽셀 회전, HWPX 전체 의미 모델이나 편집/저장 완료의 증명이 아닙니다.
