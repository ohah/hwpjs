# PNG iCCP와 ICC 구조 검사 연결

명시적으로 선택한 필수 태그 검사의 후속 계약과 검증 상태는 [ICC 필수 태그 테이블 연결](icc-required-table.md)에서 관리합니다.

## 현재 계약

`png_profile_inspection.inspect`는 유효한 PNG 헤더와 iCCP payload를 받아 기존 압축 봉투 해제, ICC 태그 테이블 검사, PNG/ICC 색 공간 대응을 순서대로 실행합니다. `Profile`은 해제된 프로파일과 태그 descriptor를 소유하고 이름만 원래 payload를 빌립니다. deinit은 descriptor를 먼저 정리하고 backing 프로파일을 해제합니다. 실패 경로도 같은 소유권을 정리합니다.

[PNG 3 §11.3.2.3](https://www.w3.org/TR/2025/REC-png-3-20250624/#11iCCP)에 따라 color type 0/4는 GRAY, 2/3/6은 RGB로 검사합니다. 팔레트 인덱스가 한 채널이라고 type3에 GRAY를 허용하지 않습니다. PNG 헤더 검증은 기존 Header.validate를 재사용합니다.

레이아웃 정책은 호출자가 bounded/icc_2022를 명시합니다. 버전 major만 보고 최신 배치 규칙을 소급 적용하지 않습니다. bounded의 중첩·미참조 바이트 보고와 layout_validated는 그대로 보존합니다. 압축 입력·출력 한도와 태그 수 한도는 기존 검사기에 전달합니다.

semantics_deferred는 항상 true입니다. 여기서는 ICC 헤더 scalar·식별자·필수 태그·태그별 의미·색변환을 모두 인증하지 않습니다. 빈 태그 테이블의 경계 검사가 성공해도 완전한 프로파일 검증 성공은 아닙니다. CRC·순서·중복·색 정보 우선순위는 PNG 조립 계층이 소유합니다. sRGB/iCCP 동시 존재 권고를 이 모듈에서 무조건 오류로 바꾸지 않습니다.

## 검증과 남은 연결

신규 네이티브 테스트는 color type 256값×RGB/GRAY/CMYK, 팔레트·알파 대응, 임의 압축 해제 결과 거부, 색 공간 불일치, 출력 한도, borrowed 이름, 명시적 레이아웃 정책과 의미 보류, 모든 정상 경로 할당 실패 지점 정리를 확인합니다. 압축 fixture 생성은 기존 봉투 테스트와 별도 파일에서 공유합니다.

첫 전체 Debug 네이티브 실행은 5/5 단계, 691/691 테스트로 통과했습니다.

## 픽셀 검사 연결

pixels.decode/inspect는 profile_collector를 기본 실행합니다. Options.profile의 기본 배치 정책은 bounded이고 호출자가 icc_2022를 명시할 수 있습니다. collector가 iCCP 중복과 PLTE/IDAT 이후 배치를 거부하고, 기존 structure/chunks가 CRC와 컨테이너 경계를 검사합니다. 압축 payload·출력·태그 수 한도는 Options.profile로 전달합니다.

보고서는 프로파일 바이트 수·태그 수·버전 major·색 공간·배치 통계만 복사합니다. 이름·태그 슬라이스·해제 버퍼를 픽셀 보고서에 남기지 않습니다. iCCP 의미 검증이 미완료이므로 ancillary deferred 카운터는 차감하지 않고 color_semantics_deferred도 true로 유지합니다. sRGB와의 동시 존재를 자동 거부하지 않습니다.

신규 픽셀 테스트는 기본 연결과 모든 할당 실패, 중복·PLTE/IDAT 뒤 배치, 팔레트 RGB/GRAY 불일치, 압축 해제 한도를 검사합니다. 기존 sRGB 테스트의 임의 iCCP 바이트는 구조적으로 검사 가능한 GRAY fixture로 변경했습니다. WASM 독립 대조와 세 모드 전체 감사·적대적 검증 결과는 아래에 기록합니다.

픽셀 연결 후 전체 Debug 네이티브 실행은 5/5 단계, 694/694 테스트로 통과했습니다.

## WASM 직접 대조

mode239는 payload 한도·해제 한도·태그 수 한도의 u32 BE 12바이트 prefix 뒤 전체 PNG를 받습니다. 실제 픽셀 검사 경로를 실행하고 프로파일 존재/크기/태그/버전/색 공간/의미 보류/배치 검사/중첩/미참조 바이트, 색 의미 보류, ancillary 보류 건수·바이트의 12개 u32 LE를 반환합니다. 제품 JS ABI 변경은 아닙니다.

Debug 직접 실행은 정상 43건·오류 거부 288건으로 통과했습니다. 5개 PNG 색 유형, ICC v2/v4, 0/1태그, sRGB 동반 여부, 정확한 한도와 한도-1, CMYK/잘못된 색 공간, 중복·PLTE/IDAT 뒤 배치, ICC 헤더/태그 손상, zlib 체크섬·후미 바이트, 전체 입력 잘림과 오류 후 재사용을 검사합니다. 잘림 검사에서 실제 공통 리더 오류 UnexpectedEnd가 누락된 기대 목록을 수정했습니다.

의미 보류 삭제, 존재 플래그 삭제, 프로파일 크기 변조, 색 공간 불일치 승인, 늦은 iCCP 승인 변형 5종을 모두 ERR_ASSERTION으로 검출했습니다. 이는 출력 및 거부 검사 민감도이며 제품 소스 변형이나 세 모드 전체 감사 완료를 뜻하지 않습니다. 최초 Debug 감사 로그 `/tmp/hwpjs-png-profile-Debug.log`는 아래 수정 후 재실행으로 대체했습니다.

## 재검토에서 발견한 테스트 진입점 충돌

새 probe 작성 시 기존 `png-profile-probe.zig`와 이름이 겹쳐 mode145 압축 봉투 계약까지 변경된 것을 소스 diff 검토에서 발견했습니다. 기존 파일을 HEAD 내용 그대로 복구하고 mode239는 별도 `png-profile-inspection-probe.zig`로 분리했습니다. 복구 후 새 43/288건을 재검사하고, mode145가 임의 비ICC 바이트를 여전히 원형 해제하는 것도 직접 대조했습니다.

수정 전 Debug 감사는 살아 있는 하위 프로세스를 확인한 뒤 중단했으며 최종 통과 근거로 사용하지 않습니다. 수정 후 세 모드 감사는 `/tmp/hwpjs-png-profile-Debug-final.log`, `/tmp/hwpjs-png-profile-ReleaseSafe.log`, `/tmp/hwpjs-png-profile-ReleaseFast.log`에 순차 실행하여 모두 완료했습니다.

임시 소스 `/tmp/hwpjs-png-profile-mutant.EtBLIT/src`에서 색 공간 불일치 거부를 제거하자 세 모드 모두 `PNG profile` 필터 5개 중 2개가 TestExpectedError로 실패했습니다. Debug/Safe에는 오류를 기대한 테스트가 변형의 예상 밖 성공 결과를 소유하지 않아 누수 진단도 동반됐습니다. 정상 제품의 누수 증거가 아니며 Fast에서도 값/오류 assertion으로 검출했습니다. 제품에는 변형을 반영하지 않았고 로그는 `/tmp/hwpjs-png-profile-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`에 기록했습니다.

## 실제 프로파일 대조

macOS 시스템 프로파일 중 RGB/GRAY 11개를 원본 그대로 zlib 압축해 합성 PNG의 iCCP에 넣었습니다. RGB는 PNG 유형 2/3/6, GRAY는 0/4에 각각 적용한 31건이 통과했습니다. 원본 헤더·태그 수와 보고서의 크기/버전/색 공간을 직접 비교하고, bounded 배치 미확정·의미 보류 및 ancillary 카운터 유지를 확인했습니다. 원본 파일을 수정하지 않았으며 이 수동 건수는 정규 audit에 합산하지 않습니다. 합성 PNG 검사이며 HWP 내부 실이미지나 색상 렌더링 대조는 아닙니다.

## 최종 감사

수정 후 Debug·ReleaseSafe·ReleaseFast 전체 audit가 모두 종료 코드 0, 20/20 단계, 네이티브 694/694, WASM checks=6,992,787로 통과했습니다. 이전 6,992,456에 신규 331건이 추가됐습니다. ReleaseSafe·ReleaseFast 실제 감사 산출물에서도 신규 직접 대조와 변형 5종 검출이 통과했습니다. 기존 mode145 파일은 변경 없이 보존했습니다.

최종 재검토에서는 PNG 구조/ICC 경계/색 공간/collector의 책임 분리, 보류 카운터 유지, 이름·태그·해제 버퍼 수명, 실패 경로 정리, 명시적 배치 정책과 한도 전달, 중복·순서 및 기존 probe 계약을 확인했습니다. 발견한 파일 충돌을 수정한 후 이번 범위에서 추가 결함은 발견하지 못했습니다. 포맷·JS 문법·diff 공백·문서 로컬 링크 4개를 확인했습니다. ICC 전체 태그 의미·필수 태그 통합·색 정보 우선순위·렌더링·HWP/HWPX 전체 문서 검증은 아직 미완료입니다.
