# PNG iCCP 구현·검증 작업

압축 봉투 이후의 구조·색 공간 검사와 픽셀 검사 연결은 [PNG/ICC 검사 연결](png-profile-inspection.md)에서 관리합니다.

## 현재 상태

ICC 전체 의미 검증은 진행 중입니다. `src/image/png/embedded_profile.zig`는 압축 봉투 해제를 소유하고, 현재 `profile_inspection.zig`와 `profile_collector.zig`가 ICC 구조·PNG 색 공간 대응·중복/순서를 PNG 픽셀 검사에 연결합니다. 필수 태그·태그 내용 검사는 호출자가 선택할 수 있지만 기본 검사만으로 프로파일의 완전한 의미를 인증하지 않습니다. iCCP ancillary deferred 보고와 색상 의미 보류를 유지하며, 제품 JS API·ICC 전체 지원이나 색상 변환 완료를 주장하지 않습니다.

## 압축 봉투 계약

기준은 [PNG 3 §11.3.2.3](https://www.w3.org/TR/2025/REC-png-3-20250624/#11iCCP)입니다. `decodeEnvelope`는 기존 `keyword.split`으로 이름과 구분자를 검사하고, 압축 방법 0만 받아 기존 `compression/zlib.zig`의 정확한 단일 스트림 해제를 재사용합니다. 이름 검사는 텍스트 키워드와 공유하지만, 해제된 본문에는 텍스트 문자 규칙을 적용하지 않습니다.

입력 payload 한도와 해제 크기 한도는 별도 옵션이며 기본값은 각각 64 MiB입니다. gzip/raw fallback, 잘린 스트림, 잘못된 체크섬, 압축 스트림 뒤의 추가 바이트는 허용하지 않습니다. 반환된 이름은 입력을 빌리고 `profile_bytes`만 소유합니다. `deinit`은 해제 버퍼를 정리합니다.

빈 zlib 출력이나 임의 바이너리 출력도 압축 봉투 해제 자체는 성공할 수 있습니다. 이것을 ICC 프로파일 성공으로 읽으면 안 됩니다. 현재 PNG 조립 경로는 CRC·순서·중복을 검사하고, 해제 후 ICC 태그 테이블 구조·이미지 색 유형과의 RGB/GRAY 대응까지 검사합니다. 따라서 단독 `decodeEnvelope` 성공과 `pixels.inspect` 성공은 서로 다른 계약입니다.

## 남은 의미 검증과 근거

[ICC 공식 명세 목록](https://www.color.org/specifications/)의 [v2 원문](https://www.color.org/specification/ICC.1-2001-04.pdf)과 v4를 분리해 확인합니다. [ICC.1:2022](https://www.color.org/specifications/ICC.1-2022-05.pdf) §7은 헤더, 태그 테이블, 데이터 배치를 구분합니다. 최신 규칙을 모든 구버전에 소급 적용하지 않고, 버전별 차이를 확인한 뒤 검사 정책을 정합니다.

ICC 헤더·버전·선언 크기·프로파일 ID의 현재 구현은 [ICC 구조 작업](icc-structure.md), 태그 경계/공유/중복/정렬은 [태그 테이블 작업](icc-tag-table.md)에 분리합니다. 프로파일 종류별 필수 태그와 태그 내용의 선택적 검사는 [PNG/ICC 검사 연결](png-profile-inspection.md) 및 해당 ICC 주제 문서가 소유합니다. PNG 이미지 유형과 프로파일 RGB/GRAY 대응, 단일 청크/순서, 자원 한도는 현재 연결되어 있습니다. 버전·프로파일 종류별 완전한 의미 판정, 색 정보 우선순위, 프로파일 선택·색상 변환은 남아 있으며 이번 봉투 해제만으로 완료 처리하지 않습니다.

## 확인한 테스트

2026-09-27 현재 재검증에서는 [PNG Third Edition §11.3.2.3의 iCCP 필드·zlib 방식·색 공간 대응](https://www.w3.org/TR/2025/REC-png-3-20250624/#11iCCP)을 현재 Zig 봉투·ICC 검사·PNG 조립 경계에 대조했습니다. Debug·ReleaseSafe·ReleaseFast의 `PNG embedded profile envelope` 집중 필터는 각각 root 포함 5/5 통과했습니다. 로컬 probe의 독립 JS `iccEdges` 전체는 정상 38,178건·거부 23,551건, 그중 봉투 바이트 변형은 1,380건을 포함해 통과했습니다. 별도 PNG→ICC mode 239 직접 대조는 정상 43건·거부 288건이 일치했습니다. 이 JS 총계에는 봉투 외 ICC 헤더·태그 테이블 검사도 포함되므로 봉투 단독 건수로 세지 않습니다. 아래 2026-09-07 전체 테스트 수치는 이번에 다시 실행하지 않았고, 실제 HWP/HWPX 안의 iCCP 양성 사례·색상 변환·렌더링·저장 동치는 확인하지 않았습니다.

### 과거 검증 기록

2026-09-07 `zig build test --summary all` 401/401 통과를 확인했습니다. 새 네이티브 테스트는 0..255 바이너리 원값과 버퍼 소유권, 입력/출력 정확한 한도, 압축 방법 256값, 모든 잘림 위치, 후미 바이트, 이름 경계, 빈 출력, 체크섬 실패를 포함한 모든 할당 실패 지점 정리를 검사합니다. 포맷과 `git diff --check`도 통과했습니다.

이후 기존 ICC [WASM·실파일·전체 audit 기록](icc-verification.md)은 별도 문서에서 관리합니다. 픽셀 연결 검증은 위 연결 문서에서 관리하며 압축 해제를 ICC 유효성 검사로 표시하지 않습니다.
