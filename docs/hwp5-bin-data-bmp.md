# HWP5 BinData BMP 검사 연결

## 선택과 명세 경계

BinData 표 17~18의 내부 항목별 압축 정책으로 얻은 바이트를 [BMP 비압축 복원](bmp-pixels.md)에 연결합니다. 확장자 예시 bmp를 모든 BMP 변형 지원의 보증으로 읽지 않습니다. LINK 외부 접근, 압축 오류 후 원본 fallback, 이미지 오류 후 빈 성공은 없습니다. 경로·압축 정책은 기존 [이미지 연결](hwp5-bin-data-images.md)과 binaries/paths가 소유합니다. 레거시 명세의 부가 구현 주석에 있는 fallback 권고를 현재 정책으로 채택하지 않습니다.

`container.Options.images`와 그 안의 `bmp`는 기본 null입니다. images만 켜면 기존 PNG 동작을 유지하며 JPEG와 BMP는 각각 별도 선택입니다. bmp는 원래 pixels.Options 타입을 그대로 사용하므로 colour_management=.unmanaged, mask_scaling=.nearest_normalized를 반드시 지정합니다. 제품 JS 공개 API는 여전히 CFB 전용입니다.

기존 PNG 힌트/서명 → 선택된 JPEG 힌트/서명 → 선택된 BMP 힌트/서명 순서입니다. 앞 형식 검사의 오류를 잡아 다음 형식으로 넘기지 않습니다. UTF-16LE ASCII 대소문자 무관 bmp 힌트 또는 BM 시작 바이트로 BMP 검사를 요구합니다. 서명으로 찾았지만 비어 있지 않은 다른 확장자가 있으면 extension_disagreements를 증가시킵니다. null/빈 확장자는 불일치가 아닙니다. 경로·UTF-16 유효성을 이 힌트 검사에서 재구현하지 않습니다.

예를 들어 bmp 확장자의 PNG 서명은 PNG로 처리하고, JPEG를 켰다면 bmp 확장자의 FF D8은 JPEG로 처리합니다. 반대로 jpg 확장자의 BM은 JPEG를 켰으면 JPEG 오류이며, JPEG를 끄고 BMP를 켰다면 BMP 불일치 통계로 처리합니다. 우선순위는 자동 형식 복구 휴리스틱이 아니라 기존 선택 규칙을 보존하는 명시적 정책입니다.

RLE4/8은 [별도 RGBA 선택](hwp5-bin-data-bmp-rle.md)으로 연결합니다. 기본 rle=null과 내장 JPEG/PNG는 UnsupportedBmpPixelCompression으로 거부합니다. OS/2 등 미지원 헤더·packed DIB·V5 프로파일 의미 검사·색 관리·한글 화면 동일성까지 지원했다고 주장하지 않습니다. V5 raw profile offset/size를 보존하는 기존 메타데이터 보류 정책도 완화하거나 완료로 바꾸지 않습니다.

## 책임·한도·소유권

V5 프로파일의 범위·ICC 검사는 [별도 HWP 선택 연결](hwp5-bin-data-bmp-profile.md)로 제공합니다. 기본 null은 기존 동작이며 프로파일 통계·예산은 픽셀과 별도로 관리합니다.

- `container/images.zig`: 선택, 전체 항목 수, 형식별 누적 예산, 원자적인 scalar 보고서 갱신.
- `container/bmp_images.zig`: 원래 BMP 디코더에 옵션/남은 예산 전달 → 소유 RGBA 해제 → scalar 근거 반환. 헤더·팔레트·마스크·픽셀을 다시 파싱하지 않습니다.
- `image/bmp/`: [파일/DIB 구조](bmp-structure.md)와 [픽셀](bmp-pixels.md)의 기존 SSOT를 유지합니다. HWP 경로나 압축 정책을 넣지 않습니다.

`max_total_bmp_rgba_bytes` 기본 256 MiB는 BMP RGBA 합계입니다. 개별 max_rgba_bytes와 남은 문서 BMP 예산 중 작은 값을 전달합니다. PNG 필터 포함 decoded scanline의 max_total_pixel_bytes, JPEG의 max_total_jpeg_rgb_bytes와 서로 다른 단위/통계이며 합치거나 대신 차감하지 않습니다. 이 세 한도가 하나의 프로세스 최고 메모리 상한이라는 뜻은 아닙니다.

max_binaries는 모든 처리/미처리 항목 수입니다. 동일 스트림을 반복 참조해도 매 항목마다 RGBA와 항목 수를 계산합니다. BMP 파일 바이트·헤더 픽셀 수·팔레트 수·저장 바이트·trailing 정책은 원래 개별 Options를 그대로 전달합니다. RGBA 한도 초과는 복원 버퍼 할당 전에 거부됩니다.

`Report.bmp`의 기본 통계는 images, rgba_bytes, extension_disagreements, metadata_deferred_images 네 가산 scalar이며, 후속 RLE 통계는 위 별도 주제 문서가 소유합니다. overflow는 LimitExceeded이며, 파싱·복원·가산이 모두 성공한 뒤에만 보고서를 교체합니다. 상위 semantics_deferred와 BMP metadata_deferred_images는 그대로 남습니다. 보고서는 입력 CFB·decoded BinData·픽셀 버퍼를 빌리지 않습니다.

## 독립 검증 기록

네이티브 HWP BMP 필터는 Debug/ReleaseSafe/ReleaseFast 각각 root 포함 9/9개 통과했습니다. 반복 예산·선택 꺼짐·PNG/JPEG 우선순위·확장자 불일치·모든 절단 위치·압축 미지원·개별/문서 한도·옵션 전달·trailing·보고서 수명·카운터 overflow를 확인했습니다. CFB 2회 참조와 반복 consume의 모든 할당 실패 위치, 명시적 safety/accounting 할당자의 정상/오류 경로 해제량도 검사했습니다.

초기 native의 `bad` 입력과 JS의 BMP→JPEG 힌트 충돌 테스트에서 예상 오류명이 실제 선행 서명 검사와 달랐습니다. 각각 InvalidBmpSignature/InvalidJpegMarker로 기대값을 수정한 뒤 재실행했습니다. 제품 오류를 우회하거나 실패 케이스를 삭제하지 않았습니다.

테스트용 mode 288은 기존 mode 284의 입력 16바이트 옵션 뒤 BMP 선택 u8·총 RGBA u32·개별 RGBA u32·trailing u8을 추가하고, 문서 한도 u32와 CFB를 받습니다. 출력은 기존 PNG/JPEG 확장 100바이트 뒤 BMP 선택/네 통계 20바이트를 추가합니다. 제품 ABI가 아니며 기존 mode 244/284 형식은 유지됩니다.

독립 JS는 직접 생성한 CORE/INFO/V4/V5, 1/4/8/16/24/32비트·마스크·부호·gap/tail을 CFB에 넣고, 압축/비압축 × 1/2/5회 참조를 대조합니다. 기존 BMP BigInt/행별 픽셀 oracle을 호출하고 자체 고정 scalar 순서를 조립합니다. 기존 보고서에서 BMP 개수만 unhandled에서 빼고 JPEG/PNG 및 비이미지 문서 결과는 그대로인지 확인합니다. 세 모드 각각 비교 428건·거부 507건, 기존 PNG 비교 26/거부 14건과 JPEG 비교 220/거부 588건을 통과했습니다.

세 모드 각각 실제 일반 HWP 45개에서 BMP 2참조·RGBA 482,080바이트·불일치 0·보류 2가 일치했습니다. 배포용 2개/암호화 1개는 기존 정책으로 제외했습니다. 별도 `reference/rhwp/samples/3-09월_교육_통합_2022.hwp`는 BMP 26참조·RGBA 114,758,724바이트·불일치 0·보류 26이 일치했습니다. 이 추가 문서는 명시적으로 문서 decoded 바이트 한도를 128 MiB로 선택했습니다. 일반 표본과 추가 표본을 혼동하지 않으며 참조 수는 고유 이미지 수가 아닙니다. 연결 검사도 정규 containerActual에 포함합니다.

세 모드에서 V5 bitfield 2회 참조 보고서의 확장 120바이트를 각각 XOR 1로 바꿔 모두 독립 대조 실패로 검출했습니다. 전체 문서/픽셀 의미 검증이나 소스 결함 검출을 이 출력 변형으로 대신하지 않습니다.

격리 경로 `/tmp/hwpjs-container-bmp-mutants.VguQJF/`에 남은 RGBA 예산 무시·누적 보고서 덮기·메타데이터 보류 삭제·개별 RGBA 한도 무시·구조 옵션 초기화·복원 오류를 빈 성공으로 바꾸기·출력 해제 누락·검사 전 보고서 갱신의 8종 결함을 주입했습니다. 각각 세 모드에서 컴파일 후 테스트 실패로 검출했습니다(root 포함 9개 중 실패 수는 순서대로 2/6/4/1/2/7/3/7개). ReleaseFast 해제 누락에서는 명시적 할당 회계의 0 대 32바이트 불일치를 확인했습니다. 제품 소스에는 결함을 적용하지 않았고 소스/로그를 해당 격리 경로에 남겼습니다.

Debug → ReleaseSafe → ReleaseFast 전체 audit는 각각 20/20단계·네이티브 907/907개·checks=7,818,540건으로 통과했습니다. 로그는 `/tmp/hwpjs-container-bmp-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 전체 회귀에는 기존 검사도 포함되므로 BMP 전용 검사 수나 지원율로 읽지 않습니다. 전체 BMP·HWP/HWPX 문서 검증 완료를 선언하지 않습니다.

전체 회귀 이후 최종 기본 `zig build test --summary all`도 907/907개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5단계를 통과했습니다. 변경 Zig 포맷·JS 문법·diff 공백 검사와 관련 문서 7개의 로컬 링크 74개를 확인했습니다. 문서 진입점에는 링크만 연결하고 BMP 계약·검증 기록은 이 주제와 기존 독립 코어 문서에 분리했습니다.
