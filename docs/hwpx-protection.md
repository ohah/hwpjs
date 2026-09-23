# HWPX 암호화 메타데이터 분류

`Document.inspectProtection`은 선택적 `META-INF/manifest.xml`을 ZIP에서 제한적으로 해제하고 공통 XML 파서의 문법·namespace 검증을 거쳐 ODF manifest namespace의 직접 `file-entry/encryption-data`를 찾습니다. `full-path`는 XML 속성 참조를 해석한 정확한 문자열로 보존합니다. 반환 `ProtectionReport`는 `manifest_present`와 암호화 표시가 붙은 경로 목록을 소유하며 호출자가 `deinit`합니다. manifest 부재와 존재하지만 비어 있는 manifest를 구분하고, 주석·CDATA·다른 namespace의 같은 로컬명은 암호화 선언으로 세지 않습니다. 경로가 없는 file-entry, 중복 encryption-data, 상위 file-entry가 없는 선언, 잘못된 루트·DTD는 오류입니다.

기본 한도는 manifest XML 1MiB, 속성 값 4096바이트, 암호화 경로 65,535개입니다. 암호화 방식·키·체크섬을 해석하거나 복호화하지 않습니다. [한컴의 HWPX 구성요소 설명](https://tech.hancom.com/hwpxformat/)은 암호 문서의 `META-INF/manifest.xml`에 엔트리별 암호화 정보가 있다고 설명합니다. `Document.inspectStructure`는 보고된 암호화 경로가 하나라도 있으면 본문 XML을 파싱하기 전에 `EncryptedDocument`를 반환합니다. 보호된 일부 리소스만 있더라도 전체 문서 검증 완료로 오인하지 않기 위한 경계이며, 호출자는 먼저 `inspectProtection`으로 해당 경로를 볼 수 있습니다.

두 corpus에서 패키지로 열린 `.hwpx` 478개 중 manifest가 있는 파일은 473개, 없는 파일은 5개, 실제 암호화 경로가 있는 파일은 2개였습니다. 암호화 2개 모두 header와 section0 경로를 포함했습니다. 합성 XML의 namespace 위장·주석 위장·문자 참조 경로·잘못된 구조·정확한 한도, 모든 할당 실패와 명시적 해제 회계를 검사했습니다. 암호 문서 본문이 평문 XML 문법 오류로 잘못 분류되지 않는지도 실파일로 검사했습니다.
