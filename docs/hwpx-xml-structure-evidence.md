# HWPX header·section XML 구조 조사

이 문서는 다음 문서 계층을 위한 읽기 전용 증거입니다. 제품의 `Document.inspectVersion`과 달리 `src/hwpx_structure_survey.zig`는 명시적으로 실행하는 조사 테스트이며 header/section 모델이나 암호 해독을 구현하지 않습니다. 재현 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

[한컴의 구성요소 설명](https://tech.hancom.com/hwpxformat/)에 따르면 `content.hpf`의 spine 순서는 문서 읽기 순서이고, header는 서식 매핑, section은 구역별 본문입니다. 실제 두 corpus의 `.hwpx` 484개 중 ZIP으로 열린 478개는 모두 `version.xml`, `Contents/header.xml`, 하나 이상의 `Contents/sectionN.xml`을 포함했습니다. section 파일 수 분포는 1개 442파일, 2개 21파일, 3개 10파일, 4개 2파일, 5개 2파일, 14개 1파일입니다. 유효 ZIP의 manifest/spine 사전 조사에서는 모든 section 경로가 spine에 있었고 순서는 숫자 순서와 같았습니다. 그러나 spine에 스크립트 항목도 포함될 수 있으므로 모든 spine 항목을 section으로 취급하면 안 됩니다.

전체 해제 크기 약 246MB의 버전·헤더·section XML 1502개를 공통 Zig XML 파서로 문법·namespace 검사했습니다. ReleaseFast 읽기 전용 조사에서 1498개가 통과했고, `TextOutsideXmlRoot` 3개와 `InvalidXmlEncoding` 1개가 남았습니다. 두 암호 문서의 `META-INF/manifest.xml`에 `encryption-data`가 있음을 확인했고, 이 두 문서의 header/section 네 엔트리를 독립적으로 검사해 위 네 오류와 정확히 대응함을 확인했습니다. 암호문을 XML 파서에 건네 생긴 오류를 평문 XML 결함이나 해독 지원으로 해석하지 않습니다. 암호화 분류·명시적 미지원 처리는 다음 제품 단계가 소유합니다.

분리된 조사 명령 `zig test src/hwpx_structure_survey.zig -O ReleaseFast`는 위 전수 검사와 두 암호 표본 재현을 포함해 20/20 테스트가 통과했습니다. 이 조사는 정규 `audit`에 포함되지 않으며 더 큰 외부 corpus나 후속 스키마 의미 검증을 대신하지 않습니다.

header의 선언 `secCnt`와 실제 section 파일 수는 한 표본에서 각각 1과 2로 달랐습니다. 사전 조사 수치로 확인한 불일치를 임의로 보정하거나 하나의 section을 버리지 않습니다. 제품 계층에서는 선언값·실제 관계·spine 순서를 분리해 보고하고, 명세상 오류 판정과 실파일 호환 정책을 별도로 결정해야 합니다. header의 내부 리소스 참조·section의 문단/그림/표 의미는 이 조사에서 검증하지 않았습니다.
