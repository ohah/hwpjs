# BMP V5 프로파일 범위와 ICC 선택 검사

## 근거와 선택 경계

Microsoft [BITMAPV5HEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header), [WCS 구조 설명](https://learn.microsoft.com/en-us/windows/win32/wcs/using-structures-in-wcs-1-0), [MS-WMF V5 필드](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/8a37c67b-dab0-4693-98a9-fe0499095da6), [색공간 상수](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/3c289fe1-c42e-42f6-b125-4b5fc49a2b20)를 대조했습니다. BMP 파일과 메모리에 로드한 DIB의 배치를 혼용하지 않습니다. 예약 필드 등의 차이가 있는 WMF 규칙 전체를 BMP로 옮기지 않습니다.

`image.bmp_profile_transport.inspect(bytes, options)`는 기존 [BMP 구조 검사](bmp-structure.md) 뒤 V5의 PROFILE_EMBEDDED/PROFILE_LINKED만 해석합니다. 다른 헤더/색공간에서는 null이며, 비활성 offset/size가 비정상이어도 따라가지 않습니다. V5 필드가 존재하는 것과 활성 프로파일이 존재하는 것은 별개입니다.

`profile_transport.zig`는 선언 파일 안의 프로파일 범위만 소유합니다. offset은 파일 시작이 아니라 14바이트 파일 헤더 뒤 DIB 시작 기준입니다. 덧셈은 u64에서 하며, 이 파일용 진입점에서는 프로파일이 픽셀 저장 영역 뒤에 있어야 합니다. 파일 헤더·DIB·팔레트·픽셀과 겹치거나 선언 파일 밖인 offset을 거부합니다. packed DIB/메모리 DIB의 프로파일 위치를 자동 추정하지 않습니다.

## 내장·링크·소유권

내장은 ProfileSize만큼 읽되 별도 max_profile_bytes(기본 64 MiB)와 남은 파일 범위를 검사합니다. 크기 0은 존재하는 빈 데이터로 반환하며, 유효한 ICC라는 뜻이 아닙니다. 실제 ICC 소비자가 이를 거부합니다.

링크는 max_link_bytes(기본 4,096바이트, NUL 포함)와 선언 파일 경계 안에서 첫 NUL을 찾습니다. ProfileSize는 공식 문서에서 내장 데이터 크기로 정의되므로 링크 길이에 사용하지 않고 declared_size에 보존합니다. NUL 앞의 원시 CP1252 바이트를 data로 반환하며 유니코드 문자열로 임의 변환하지 않습니다. 빈 링크는 원형으로 반환합니다. CP1252 미정의 바이트, 경로 문법/존재·권한·연결 대상의 유효성은 아직 검사하지 않습니다. 외부 경로/네트워크 접근은 전혀 없습니다.

View의 data, before_profile, after_profile은 입력 BMP를 빌립니다. before/after는 픽셀 이후의 프로파일 전후 데이터이고, 파일 밖 trailing은 프로파일 일부가 아닙니다. stored_bytes는 링크 NUL을 포함하지만 data는 포함하지 않습니다. fromView는 기존 structure.inspect의 유효한 View를 요구하며 헤더/팔레트를 재파싱하지 않습니다.

## ICC 내용 검사

`image.bmp_profile_inspection.inspect(allocator, bytes, options)`는 transport 뒤 기존 ICC tag_table과 profile_id를 재사용합니다. 내장 데이터 전체의 ICC 선언 길이·태그 범위·선택한 배치·v4 ID를 검사합니다. layout은 bounded/icc_2022 중 필수 선택이고 버전으로 추정하지 않습니다. required/payloads도 별도로 선택하면 기존 ICC 검사기에 그대로 전달합니다.

Profile은 태그 descriptor 배열만 소유하므로 deinit이 필요합니다. transport와 태그 data는 계속 원본 BMP를 빌립니다. 실패 시 이미 할당한 descriptor를 해제합니다. 링크형을 이 ICC 진입점에 넣으면 UnsupportedBmpLinkedProfile이며, 부재 null이나 검사를 마친 ICC로 바꾸지 않습니다.

두 API 모두 semantics_deferred=true입니다. BMP 색공간·intent·endpoints/gamma의 의미 검증, ICC 색 변환과 렌더링 동일성은 별도입니다. 기존 pixels.decode와 HWP images.Budget에는 아직 이 검사를 자동 연결하지 않았으며, 제품 JS API는 여전히 CFB 전용입니다.

## 현재 검증 기록

네이티브 필터는 root 포함 12개로 Debug/ReleaseSafe/ReleaseFast 모두 통과했습니다. offset/size 교차 조합, 활성/비활성/버전, 입력 모든 잘림, 각 한도, 파일 밖 NUL, 링크 선언 크기 무시, borrowed 수명, ICC ID·배치 정책·옵션 전달, OOM과 ReleaseFast 명시적 누수 회계를 검사합니다.

테스트 mode 292/293 입력은 profile/link/tag 상한 u32 세 개, layout/trailing u8 두 개와 BMP입니다. mode 292 출력은 존재 종류(0 없음/1 내장/2 링크), 파일 offset, 선언 size, data 길이, stored 길이, before/after 길이, 의미 보류의 8 DWORD 뒤 data입니다. mode 293은 data 앞에 태그 수와 ID 상태 DWORD 두 개를 더합니다. 기존 mode의 wire는 변경하지 않습니다.

세 모드 WASM은 독립 JS 생성기·영역 oracle·기존 독립 ICC oracle로 대조 198/거부 1,801을 통과했습니다. seed=1112952885의 프로파일 필드/데이터 변이 2,000건은 승인 1,058/거부 942/traps 0으로 일치했습니다. 임의 호스트 예외는 정상 거부로 세지 않습니다. 원래 정상 오류를 RuntimeError로 바꾼 첫 주입은 세 모드 모두 테스트 실패로 검출했습니다.

내장 v2/v4·링크·부재 출력 총 829바이트를 각각 XOR 1로 바꾸어 세 모드 모두 검출했습니다. 실파일 검사는 세 모드 각각 일반 HWP 45개와 추가 reference 문서의 BMP 2+26참조를 대조했으며 활성 V5 프로파일이 없었습니다. 배포용 2/암호화 1개는 기존 정책으로 제외했습니다. 따라서 실제 제작 V5 내장/링크 표본 검증 완료로 읽지 않습니다.

격리 소스에서 DIB 기준 14바이트 누락, 내장 크기 상한 무시, 링크를 ProfileSize로 제한, 링크 data에 NUL 포함, after_profile 손실, ID 검사 생략, 실패 경로 descriptor 해제 제거, layout을 bounded로 강제하는 결함 8종을 주입했습니다. 세 모드 각각 12개 테스트가 실행되고 변형별 실패 수는 순서대로 10/2/1/1/2/2/2/1개였습니다. 해제 제거는 ReleaseFast에서도 ID 오류와 payload 한도 오류 양쪽에서 expected 0, found 32로 검출했습니다. 근거는 `/tmp/hwpjs-bmp-profile-mutants.8Csooz/`의 변형별 로그입니다.

ID 검사 호출을 완전히 삭제한 첫 변형은 오류 집합 변경 때문에 컴파일되지 않아 런타임 검출 근거에서 제외했습니다. 유효한 비영 크기에서 검사를 건너뛰되 오류 집합을 유지하는 변형으로 다시 검사해 위 실패를 확인했습니다. ID/해제/layout의 최종 근거는 해당 모드의 `-v2.log`입니다. 제품 코드와 정규 테스트를 이 변형을 위해 수정하지 않았습니다.

전체 audit를 Debug → ReleaseSafe → ReleaseFast 순서로 실행하여 각 모드 20/20 build steps, 936/936 네이티브 테스트, 7,834,331개 검사 항목을 통과했습니다. 실행 셸의 종료 코드 0도 확인했습니다. 로그는 `/tmp/hwpjs-bmp-profile-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 정규 회귀에 새 WASM 대조와 실파일 프로파일 검사를 포함했으며, 검사 중 제품 코드와 테스트를 변경하지 않았습니다.

관련 문서 3개의 로컬 링크 55개와 변경 파일의 구문·포맷·diff 검사를 통과했습니다. 마지막 `zig build test --summary all`은 936/936 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. 이 문서는 전체 문서 검증 완료 기록이 아닙니다.
