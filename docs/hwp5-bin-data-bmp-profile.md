# HWP5 BMP V5 프로파일 선택 검사

## 선택과 책임

`container_validation.Options.images.bmp_profile`을 명시적으로 선택하면 기존 [BMP 이미지 검사](hwp5-bin-data-bmp.md)에 [V5 프로파일 검사](bmp-profile.md)를 연결합니다. 기본 null은 기존 동작을 유지합니다. bmp_profile을 선택한 Budget.consume에서 bmp=null이면 InvalidBmpProfileSelection입니다. BinData 표 17·18의 압축/경로 정책, PNG→선택 JPEG→선택 BMP 우선순위는 그대로 재사용합니다. 외부 링크나 압축 실패 원본 fallback을 실행하지 않습니다.

`bmp_profiles.zig`는 파일과 무관한 옵션·가산 scalar 보고서를 소유합니다. max_profile_bytes/max_link_bytes의 기본값은 기존 transport 옵션에서 가져옵니다. linked는 reject/preserve 중 필수 선택입니다. content=null은 범위 검사만 뜻하고 ICC 유효성 검사가 아닙니다. content를 선택하면 기존 ContentOptions의 layout/max_tags/required/payloads를 그대로 전달합니다.

`bmp_images.inspectProfiled`는 원래 BMP 구조를 한 번 검사하고, 이미 검사한 View를 프로파일과 RGBA 소비자에 전달합니다. `pixels.decodeView`는 원래 픽셀 규칙을, `profile_transport.fromView`는 원래 범위 규칙을 재사용합니다. `profile_inspection.fromTransport`는 ICC 내용 검사만 조립합니다. 기존 파일 API는 이 연결점을 호출하며 헤더/태그 규칙을 별도로 복제하지 않습니다. 파일 API의 기존 옵션 모양은 유지합니다.

프로파일을 선택하면 RGBA 출력 한도를 ICC descriptor의 첫 할당보다 먼저 검사합니다. 프로파일을 끈 기존 경로의 오류 우선순위는 유지합니다. 선택 경로는 범위/ICC 검사 후 RGBA를 복원하므로 이미지와 프로파일 둘 다 성공해야 보고서를 반환합니다. 프로파일 검사에서 만든 태그 descriptor는 RGBA 복원 전에 해제합니다.

## 예산·보고서·수명

max_total_bmp_profile_bytes는 기본 64 MiB이며 RGBA·PNG·JPEG 예산과 별개입니다. 내장은 원래 ProfileSize, 링크는 NUL 포함 실제 stored_bytes를 참조마다 차감합니다. 같은 BinData의 반복 참조도 각각 집계합니다. 개별 상한과 전역 남은 양 중 작은 값을 transport 검사에 넘깁니다. 검사 옵션을 끄면 기존 누적값은 보존하되 비활성 프로파일 예산을 다시 차감하지 않습니다.

`images.Report.bmp_profile`은 embedded, linked, stored_bytes, icc_checked, icc_tags, id_verified, id_not_calculated, id_not_defined, content_deferred, required_checked, missing_tags, payloads_checked, unhandled_tags의 13개 scalar입니다. linked=preserve는 경로 바이트만 검사하고 linked/content_deferred를 집계합니다. content를 선택해도 링크를 외부 ICC로 열거나 icc_checked로 세지 않습니다. reject는 UnsupportedBmpLinkedProfile입니다.

내장 범위 검사 성공과 ICC 내용 검사 성공을 분리합니다. 빈 내장 데이터도 transport-only에서는 존재하지만, ICC 검사를 선택하면 기존 InvalidIccProfileSize 오류를 전파합니다. content_deferred는 활성 프로파일마다 남으며, 필수 태그/알려진 payload 검사를 선택했다고 전체 의미·색 변환이 완료됐다고 바꾸지 않습니다. 부재는 전부 0입니다.

기존 BMP 통계와 새 프로파일 통계를 임시 Report에 checked 가산한 뒤에만 Budget.report를 교체합니다. 실패·overflow에서는 binaries를 포함한 기존 보고서를 유지합니다. 프로파일·BMP·BinData·CFB 바이트는 보고서에 남기지 않습니다. 전체 HWP Report의 원래 deinit 책임은 그대로입니다.

## 네이티브 검증 이력

새 Debug 네이티브 필터는 root 포함 7/7개를 통과했습니다. 반복 참조·전역/개별 한도·비활성 전환·링크 preserve/reject·빈 내장·ICC ID 오류·카운터 overflow·CFB 해제 이후 수명·모든 할당 실패와 명시적 누수 회계를 검사합니다. 연결점 분리 직후 기존 BMP 필터 46/46개도 통과했습니다.

초기 Debug/ReleaseSafe/ReleaseFast의 전체 BMP 네이티브 필터는 각각 52/52개를 통과했습니다. 이후 RLE+ICC 오류의 원자성과 required/payloads 보고서 전달 테스트를 추가하여 새 연결 필터가 세 모드 각각 root 포함 9/9개를 통과했습니다. RLE 복원 오류와 ICC ID 오류 모두 픽셀/프로파일 보고서를 부분 반영하지 않는 것을 확인했습니다.

## WASM·실파일·적대적 검증

새 테스트 mode 294는 기존 mode 291 입력의 43바이트 선택 뒤 프로파일 enabled/content/linked/semantics u8 네 개와 개별 profile/link/tag·전역 profile 한도 u32 네 개를 받습니다. 그 뒤는 기존 문서 한도 u32와 CFB입니다. 출력은 mode 291 전체 보고서 뒤 프로파일 선택 u32와 13개 통계 u32(56바이트)를 붙입니다. 기존 이미지 확장 156바이트를 포함한 새 확장은 212바이트이며, 기존 mode의 wire는 변경하지 않습니다.

독립 JS는 기존 문서·RGBA 대조를 유지하고 별도 BMP profile oracle의 내장/링크/부재 결과와 독립 ICC table/ID 결과로 13개 기대값을 계산합니다. 제품 Report reflection으로 기대 필드 순서를 생성하지 않습니다. 의미 선택 oracle은 명시적인 display RGB/XYZ·미지원 text 태그 하나의 생성 fixture만 대상으로 하며 임의 ICC 의미 지원으로 일반화하지 않습니다.

세 모드 각각 비교 96/거부 218건을 통과했습니다. 압축/비압축 BinData, ICC v2/v4, 1/2/5회 참조, transport-only/bounded/strict 선택, RLE4/8과 두 채움 정책, 프로파일 꺼짐·비활성 V5·PNG/JPEG 우선순위, 범위/한도/짧은 선택 입력/오류를 대조했습니다. 내장/링크/빈 내장/부재의 212바이트 확장 총 848바이트를 각각 XOR 1로 바꿔 세 모드 모두 검출했고, 정상 오류를 RuntimeError로 바꾼 첫 주입도 테스트 실패로 검출했습니다.

일반 HWP 45개와 추가 `reference/rhwp/samples/3-09월_교육_통합_2022.hwp`를 세 모드에서 대조했습니다. 배포용 2/암호화 1개는 기존 정책으로 제외했습니다. 기존 BMP 2+26참조의 픽셀/문서 보고서는 유지됐고 새 프로파일 13개 통계는 모두 0이었습니다. 추가 문서에는 명시적인 128 MiB 문서 한도를 사용했습니다. 실제 제작 V5 프로파일은 이 표본에 없으므로 생성 fixture 검증과 구분합니다.

첫 직접 검사에서 테스트용 container probe의 limit을 출력 바이트 한도로 잘못 가정하여 out.length-1에서 오류를 기대했습니다. 실제 코드는 max_total_records로 전달하고, 0은 InvalidDocumentLimit입니다. 테스트를 문서 레코드 계약으로 수정하여 0/1 제한의 오류를 각각 확인했고 제품/bridge의 제한 의미는 바꾸지 않았습니다. 이를 제품 출력 초과 버그로 세지 않습니다.

격리 소스에서 남은 프로파일 예산 무시, RGBA 사전 한도 검사 제거, ICC 내용 검사 건너뜀, 통계 가산 전 부분 commit, 비활성 예산 강제 적용, 링크를 ICC 성공으로 집계, stored_bytes 손실, ICC 실패 경로 해제 제거의 8종을 주입했습니다. 세 모드 각각 9개 테스트가 실행됐으며 변형별 실패 수는 순서대로 3/1/6/1/2/1/4/1개였습니다. 마지막 해제 제거는 ReleaseFast에서도 expected 0, found 32로 검출했습니다. 근거는 `/tmp/hwpjs-container-bmp-profile-mutants.2qAh1F/`의 변형별·모드별 로그입니다.

전체 audit를 Debug → ReleaseSafe → ReleaseFast 순서로 실행하여 각 모드 20/20 build steps, 944/944 네이티브 테스트, 7,835,179개 검사 항목을 통과했습니다. 실행 셸 종료 코드 0도 확인했습니다. 정규 회귀에도 새 HWP 대조 96/거부 218과 실파일 연결 검사를 포함했습니다. 로그는 `/tmp/hwpjs-container-bmp-profile-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

관련 문서 4개의 로컬 링크 60개와 변경 파일의 구문·포맷·diff 검사를 확인했습니다. 최종 `zig build test --summary all`은 5/5 단계·944/944 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했고 종료 코드 0을 확인했습니다. 제품 JS API는 여전히 CFB 전용이고 실제 한글 제작 V5 표본·색 변환·전체 문서 검증 완료를 선언하지 않습니다.
