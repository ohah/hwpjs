# HWP5 문서 조립·컨테이너·별도 스트림 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

- [변경 추적 ViewText 조사](hwp5-track-change-viewtext.md)는 현재 BodyText 검증에서 제외된 스트림의 실측·재현 근거와 다음 구현 조건을 관리합니다.

- `src/hwp5/document/`: types는 입력/소유권/보고서, docinfo는 리소스 검증 연결, section은 기존 본문 검사기 조립, validation은 헤더 지원 정책·구역 수/인덱스·전역 한도를 소유합니다. inspectDecoded 입력은 이미 압축 해제된 스트림이며 CFB를 검색하지 않습니다. 구역 보고서는 인덱스 순서로 소유하고 DocInfo 원문 슬라이스는 빌립니다. 레벨·ID·구역 정의 첫 문단 조건 등 기존 의미 규칙을 이 계층에 복제하지 않습니다.

- `src/hwp5/container/`: paths는 CFB 계층 조회와 정규 Section/BinData 이름, sections는 직접 BodyText 자식의 bounded decode, binaries는 항목별 압축/외부 링크 보류, validation은 파일 단위 수명과 총 decode 한도를 소유합니다. strict CFB와 findExact만 사용하며 동명 basename fallback·외부 링크 접근·압축 실패 후 원본 fallback을 금지합니다. 반환 보고서는 DocInfo backing을 소유하므로 입력 CFB를 해제해도 유효합니다. uninspected 스트림은 완료로 세지 않습니다.

- `hwp5/preview/text.zig`는 길이 접두사 없는 raw UTF-16LE 미리보기 뷰/진단, `container/preview.zig`는 선택 루트 PrvText 조회와 전체 소비 한도를 소유합니다. 본문 제어문자 문법·NUL 종결·BOM 제거·2048바이트 상한을 임의 적용하지 않습니다. 고립 서로게이트는 치환하지 않고 수치로 진단합니다. 검사 보고서 존재를 무조건 Unicode 정상 판정으로 해석하지 않습니다.

- `hwp5/summary/`: header는 HWP FMTID/단일 set envelope, parser는 속성 offset/중복/배열 수명, value는 알려진 typed value, rules는 ID별 기대 타입을 소유합니다. PID 0 dictionary는 TypedPropertyValue로 읽지 않습니다. LPWSTR 문자열 길이는 u32 코드 유닛이며 NUL 종결/패딩을 검사하되 원문·extra·64비트 FILETIME을 보존합니다. `container/summary.zig`는 제어문자 0x05를 포함한 정확한 루트 경로와 전역 한도만 연결합니다. 미지원 타입/ID·dictionary·꼬리를 완료로 치환하지 않습니다.

- `hwp5/scripts/version.zig`는 버전 두 DWORD, `source.zig`는 u32 길이의 네 UTF-16 필드와 -1 종료 표식을 소유합니다. summary의 NUL/패딩 규칙을 재사용하지 않습니다. `container/scripts.zig`는 정확한 선택 경로·공통 stream.decode·전역 소비 한도를 연결하며 scalar 보고서만 반환합니다. 미지 버전/꼬리는 보존·보고하고 스크립트를 실행하지 않습니다.

- `hwp5/xml_template/string.zig`는 표 10~12의 decoded 문자열 envelope, `template.zig`는 세 선택 입력의 총 한도/부재를 소유합니다. Scripts와 `utf16_string.read32`를 공유하며 두 길이 폭 모두 실패 시 커서를 보존합니다. XML 문법/스키마 검증·외부 엔터티 로드·CFB 압축 자동 판별은 포함하지 않습니다. 실제 XMLTemplate 표본은 아직 확보하지 못했습니다.

- `hwp5/history/record.zig`는 BYTE tag + UINT byte length의 별도 framing, `value.zig`는 공식 태그/포함 비트/알려진 payload, `item.zig`는 한 decoded VersionLog의 시작·끝·포함 비트를 소유합니다. 시작 payload는 spec_flag_first/observed_option_first를 명시적으로 선택합니다. SYSTEMDATE는 레이아웃 미정의로 raw deferred이며 마지막 문서 연결·DiffML/HWPML·암호화는 별도입니다. 일반 본문 record 헤더나 압축 정책을 자동 적용하지 않습니다.

- summary `strings.zig`는 counted 문자열의 경계·종결·패딩을 공유합니다. LPWSTR 길이는 UTF-16 유닛, LPSTR 길이는 바이트이며 CP1200일 때도 바이트입니다. parser는 PID1의 VT_I2를 먼저 확인해 뒤에 있는 코드페이지도 적용하며 u16 비트패턴을 보존합니다. `dictionary.zig`는 명시된 코드페이지에서 항목 경계/ID만 검사합니다. 이름 인코딩·중복 의미는 별도이며, 코드페이지가 없는 HWP dictionary에 자동 기본값을 적용하지 않습니다.
