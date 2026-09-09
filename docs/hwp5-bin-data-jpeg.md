# HWP5 BinData JPEG 검사 연결

## 범위와 선택

BinData 표 17~18의 내부 항목별 압축 정책으로 얻은 바이트에 JFIF JPEG 복원 검사를 연결했습니다. 명세의 jpg 형식 예시를 모든 JPEG가 JFIF라는 보증으로 읽지 않습니다. HWP 경로·압축 정책은 기존 [이미지 연결](hwp5-bin-data-images.md)과 binaries/paths가 소유하며 외부 LINK를 실행하거나 실패한 압축/이미지를 원본 fallback으로 통과시키지 않습니다.

`container.Options.images`와 그 안의 `jpeg`는 모두 기본 null입니다. images만 켜면 기존 PNG 검사 그대로이며 JPEG는 unhandled로 남습니다. jpeg를 켤 때 `completion`과 `render.upsampling`, `render.colour_management = .unmanaged`를 명시합니다. 제품 JS 공개 API는 여전히 CFB 전용입니다.

기존 PNG 선택 규칙을 먼저 적용합니다. PNG 확장자는 PNG를 요구하고, PNG 서명이 있으면 다른 확장자여도 기존 불일치 통계와 함께 PNG를 검사합니다. 그 밖에 JPEG를 선택한 경우 대소문자 무관 UTF-16LE jpg/jpeg 힌트 또는 FF D8 시작 바이트로 JPEG 검사를 요구합니다. 비어 있지 않은 다른 확장자로 JPEG를 발견하면 JPEG extension_disagreements에 집계합니다. BMP/OLE 등 다른 바이트는 unhandled로 남깁니다. 힌트 없는 FF FF D8 같은 추가 fill 식별까지 하는 범용 탐지기는 아닙니다.

전체 구조 검사에서 얻은 SOF 프로세스로 Huffman 순차/baseline과 progressive를 분기합니다. 실패를 catch하여 다른 디코더나 썸네일을 시도하지 않습니다. 산술/lossless는 UnsupportedHwpJpegProcess, hierarchical은 기존 명시적 미지원 오류입니다. JFIF 헤더 부재·지원하지 않는 정밀도/성분·Adobe 충돌·잘린 엔트로피는 해당 검사 오류를 전파합니다. 미지원 오류를 구조 적합성 인증이나 파일 손상의 증명으로 해석하지 않습니다.

## 책임과 단일 출처

- `container/images.zig`: 형식 선택, 항목 수, PNG/JPEG의 문서별 누적 예산과 원자적인 보고서 갱신.
- `container/jpeg_images.zig`: 구조 inspector의 콜백으로 SOF 식별 → 기존 두 JFIF RGB API 호출 → 소유 출력 해제 → scalar 근거 반환. JPEG 바이트 파서·색 공식·계수/정밀도 규칙은 구현하지 않습니다.
- [순차 RGB](jpeg-rgb.md), [progressive RGB](jpeg-progressive-rgb.md): 원래 명시적 진입점·옵션은 그대로 유지합니다. adapter의 공통 structure/render/샘플 한도를 두 경로에 전달하며 기본 샘플/작업량 한도는 기존 Options에서 가져옵니다.

프로세스 선택 때문에 전체 구조를 한 번 더 순회합니다. 단일 순회 최적화나 전체 실행 시간 상한을 입증한 것은 아닙니다. 기존 검사기를 공유하는 것이 규칙의 단일 출처이며, 순회 횟수를 하나로 만들었다는 뜻은 아닙니다.

## 한도와 보고서

기존 `max_total_pixel_bytes`와 `Report.pixel_bytes`는 계속 PNG 필터 포함 decoded scanline 바이트만 의미합니다. JPEG는 독립적인 `max_total_jpeg_rgb_bytes`(기본 256 MiB)와 `Report.jpeg.rgb_bytes`로 집계합니다. 각 항목의 RGB 상한은 render.max_rgb_bytes와 남은 문서 JPEG 예산의 최솟값입니다. max_binaries는 두 형식과 unhandled를 포함한 항목 수이며 반복 참조도 매번 계산합니다. 두 바이트 상한이 하나의 전체 메모리 상한을 뜻하지는 않습니다.

JPEG 저장 샘플·순차 블록·progressive 계수 저장/방문 수·구조/마커/스캔·ICC/Adobe 제한은 개별 입력 한도로 유지합니다. completion과 trailing 정책을 두 검사 단계에서 임의로 완화하지 않습니다. RGB 한도 초과는 복원 버퍼의 첫 할당 전에 거부합니다.

`Report.jpeg`는 images, progressive_images, rgb_bytes, extension_disagreements, profile_images, metadata_deferred_images, scans, unseen_coefficients, partial_coefficients, full_coefficients, adobe_headers, unchecked_compressed_thumbnails, unknown_extensions의 가산 scalar만 소유합니다. 순차 수는 images-progressive_images입니다. 정밀도 3개 통계는 progressive의 **성분별 64개 주파수 상태**만 누적하며 실제 블록 위치별 계수 개수가 아닙니다. 성분별 levels 원본이 필요하면 별도의 progressive RGB API를 사용합니다.

preserve_partial에서 unseen/partial을 0으로 바꾸거나 완료 RGB로 표시하지 않습니다. 전혀 수신하지 않은 성분은 기존 샘플 오류입니다. profile_images는 ICC 조각 재조립 사실이며 ICC 내부 검증·색 적용 완료가 아닙니다. PNG의 동명 기존 통계와 합치지 않습니다. semantics_deferred와 JPEG metadata_deferred_images는 색 관리·Exif orientation·APP 의미 등의 미완료 상태를 남깁니다.

consume은 임시 보고서를 만들고 모든 검사/가산 성공 뒤 교체합니다. 카운터 오버플로도 LimitExceeded이며 보고서는 실패 이전 그대로입니다. RGB/샘플/계수/ICC/CFB 임시 버퍼는 반환 전에 해제하고 결과가 입력 포인터를 보유하지 않습니다.

## 검증 기록

- 네이티브 HWP JPEG 필터: Debug/ReleaseSafe/ReleaseFast 각각 root 포함 9/9개 통과. 순차/progressive 반복 예산, PNG 혼합/선택 꺼짐, jpg/jpeg 대소문자와 다른 확장자, 모든 절단 위치·padding·산술 미지원·완료 정책·독립 한도·ICC/Adobe/trailing 전달·카운터 오버플로를 확인했습니다. 실제 CFB 2회 참조의 보고서 수명과 모든 할당 실패 위치도 검사했습니다.
- 테스트용 mode 284는 기존 mode 244 보고서를 유지하고 56바이트 JPEG 선택/13개 통계를 추가합니다. 기존 44바이트와 합쳐 확장 100바이트입니다. 입력은 기존 이미지 선택/PNG 예산/항목 수 뒤 JPEG 선택·보간·완료 각 u8, RGB 예산 u32, 기존 문서 바이트 한도/CFB 순서입니다. 제품 ABI는 아닙니다.
- 세 모드 직접 WASM: 새 비교 220건·거부 588건, 기존 PNG 비교 26건·거부 14건 통과. 독립 JS가 압축/비압축, 1/2/5회 참조, 단일/3성분·비대칭 샘플링·restart/DNL·두 보간 방식의 RGB oracle과 별도 scalar 배열을 조립합니다. PNG 전용 결과와 JPEG 선택 시 기존 부분 보고서의 차이도 검증합니다.
- 세 모드 각각 실제 일반 HWP 45개에서 두 보간 방식 모두 JPEG 8참조(순차 7, progressive 1), RGB 3,130,425바이트, 14스캔, Adobe 헤더 2개가 독립 결과와 일치했습니다. unseen/partial은 0이고 progressive full 상태는 192개입니다. 중복 참조를 포함하며 고유 이미지 수가 아닙니다. 배포용/암호화 3개는 기존 정책으로 제외했습니다.
- 세 모드에서 partial JPEG 2회 참조 보고서의 확장 100바이트를 각각 XOR 1로 바꿔 모두 독립 대조 실패로 검출했습니다.

격리 경로 `/tmp/hwpjs-container-jpeg-mutants.Qwv8nV/`에 남은 RGB 예산 무시·누적 보고서 덮기·미전송 계수 상태 삭제·require_full 무시·메타데이터 보류 삭제·샘플 한도 전달 누락·이미지 오류를 빈 성공으로 바꾸는 일곱 결함을 주입했습니다. 각각 세 모드에서 컴파일 후 네이티브 테스트 실패로 검출했습니다(root 포함 9개 중 실패 수는 순서대로 1/6/1/1/1/1/7개). fallback 변형은 최초 컴파일 타입 오류를 고친 후 다시 실행했으며, 컴파일 오류를 검출 성공으로 집계하지 않았습니다. 제품 소스에는 결함을 적용하지 않았습니다.

디스크 공간 부족으로 검증 후 독립 WASM 임시 산출물과 위 21개 mutant의 네이티브 실행 파일/오브젝트 캐시만 제거했습니다. 소스·테스트·변형 소스와 실패 로그는 유지하며 빌드 명령으로 산출물을 재생성할 수 있습니다. 실행 중인 전체 audit의 산출물은 제거하지 않았습니다.

첫 Debug 전체 audit는 네이티브 891/891개를 통과했지만 새 JS 이미지 연결 도구가 문서 한도를 64 MiB로 고정해 기존 87,772,864바이트 곡선 레퍼런스를 LimitExceeded로 거부했습니다. 제품 한도는 바꾸지 않고 imageContainerInput의 명시적 문서 한도를 공유하며, containerActual의 독립 계산 total을 이미지 선택 전후 두 경로에도 전달하도록 수정했습니다. 수정 후 해당 레퍼런스의 직접 재현에서 두 배치·29개 거부·2개 정렬 검사가 통과했습니다. 실패한 첫 audit 로그는 `/tmp/hwpjs-container-jpeg-Debug-audit.log`에 보존하며 세 모드 전체 회귀를 다시 실행합니다.

수정 후 Debug → ReleaseSafe → ReleaseFast 전체 audit는 각각 20/20단계·네이티브 891/891개·대조/거부 검사 7,813,418건으로 통과했습니다. 로그는 `/tmp/hwpjs-container-jpeg-{Debug,ReleaseSafe,ReleaseFast}-audit-v2.log`입니다. 이 기록은 JPEG 제품 JS 제공·전체 HWP/HWPX 문서 검증·한글 화면 픽셀 동일성의 완료 선언이 아닙니다.

전체 회귀 뒤 최종 네이티브 테스트도 891/891개, ReleaseSafe 제품 빌드도 5/5단계로 통과했습니다. Zig 포맷·변경 JS 문법·diff 공백과 변경 문서 17개의 로컬 링크 139개를 확인했습니다. 과거 JPEG 주제의 미완료 안내는 현재 연결 계약을 가리키도록 갱신하되 당시 검사 수를 현재 완료 범위로 바꾸지 않았습니다.
