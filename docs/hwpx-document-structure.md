# HWPX header·spine XML 구조 검증

## 책임과 결과

`Document.inspectStructure`는 [암호화 분류](hwpx-protection.md) 뒤에 `Contents/header.xml`을 package manifest의 내장 `application/xml` 항목과 정확히 연결하고, 공통 XML 파서로 header와 spine의 XML 전체 문법·namespace를 검사합니다. header 루트는 2011 `head` namespace의 `head`, section 루트는 2011 `section` namespace의 `sec`로 판정합니다. 선택된 header의 manifest item 인덱스·해제 바이트·요소 수를 보고합니다. spine 항목을 파일명이나 manifest 저장 순서로 재정렬하지 않습니다. `application/xml` spine 항목의 실제 XML 루트가 section이면 그 순서와 manifest item 인덱스, 해제 바이트·요소·직접 문단 개수를 기록합니다. 비XML spine 항목과 다른 XML 루트는 각각 따로 셉니다. section 파일명이 관측형 `Contents/sectionN.xml`일 때의 숫자 순서 일치는 별도 진단일 뿐 section 선택 조건이 아닙니다.

header의 `version`은 부재 가능 문자열, `secCnt`는 부재 가능 `u32`로 보존합니다. `declared_count_matches`는 선언값과 spine에서 확인한 section 수의 비교이며 선언이 없으면 null입니다. 한 실파일에서 선언 1·실제 2가 관측됐으므로 파서는 section을 버리거나 선언값을 고치지 않고 false를 반환합니다. header의 manifest 참조 누락·외부 header·잘못된 미디어 유형·잘못된 XML 루트, 중복 section spine 참조, section 없음은 오류입니다. header가 spine에 있는지 여부도 별도 보고하며 없는 경우 자동 삽입하지 않습니다. 반환 section 인덱스는 소유 `Document.manifest.items`를 가리키므로 `Document`가 보고서보다 오래 살아야 합니다.

header 최대 32MiB, spine XML 엔트리별 최대 128MiB, header+spine XML 합계 최대 256MiB, section 수 최대 65,535개가 기본 상한이며 호출자가 조정할 수 있습니다. 암호화 manifest·앞선 package XML·version XML의 해제량은 이 합계에 포함되지 않고 각 단계의 별도 상한을 따릅니다. 반환 문자열·section 배열은 보고서가 소유하고 `deinit`으로 해제합니다. [header 리소스 ID 색인](hwpx-header-resources.md)은 별도 진입점이며, 이 계층은 문단 속성 참조, 표·그림·BinData 의미, 편집·저장을 아직 검증하지 않습니다. 2021/2024 OWPML namespace 변형도 현재 지원 근거가 없으므로 2011 형식 검사 통과를 모든 버전의 문서 지원으로 확대하지 않습니다.

버전 계열 루트의 명시적 거부와 실파일 분포는 [XML 네임스페이스 버전 경계](hwpx-namespace-profiles.md)가 소유합니다.

[한컴의 구조 설명](https://tech.hancom.com/hwpxformat/)은 spine 읽기 순서와 header/section 역할을, [한컴의 본문 파싱 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 `secCnt`가 구역 개수이며 section에 문단이 포함된다는 점을 설명합니다. 고정 리비전 [head 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/HWPMLHeadType.cpp)에서도 `version`·`secCnt`·`refList` 필드를 확인했습니다. 다만 이 구현은 해당 설명의 전체 스키마 검증기가 아닙니다.

## 실파일·적대적 검증

2026-09-23 두 corpus의 `.hwpx` 484개 중 ZIP 종료 레코드가 없어 거부된 6개와 암호화 2개를 제외한 476개가 이 구조 계층을 통과했습니다. spine 순서로 section 544개를 확인했고 `secCnt` 불일치 1개를 확인했으며 선언 부재는 0개였습니다. 불일치 문서의 section을 버리거나 선언값을 고치지 않습니다. 비XML spine 항목은 합계 210개였고, 다른 루트의 XML spine 항목은 0개였습니다. 비XML 항목의 내용이나 header/section 내부 참조가 검증됐다는 뜻은 아닙니다. 파일명에 `section`이 없는 합성 XML을 spine 순서로 읽는 테스트, 실제 암호 문서·불일치 문서, 손상 루트·숫자·namespace 위장·중복·총량 경계, 할당 실패·명시적 해제 테스트가 있습니다. 적대적 검토에서 비숫자 section 경로 뒤의 숫자 경로가 순서 진단의 `null`을 `false`로 덮는 결함을 발견해 수정하고 혼합 경로 회귀 테스트를 추가했습니다. 독립 소스 복사본에서 이 수정 제거, 암호 문서 선제 거부 제거, 보고서 버전 문자열 해제 제거 변이를 각각 주입하자 대응 테스트가 실패했습니다. 마지막 해제 변이는 ReleaseFast의 명시적 할당 회계에서 3바이트 누수로 검출됐습니다. 더 넓은 corpus와 미지원 namespace·암호 해독은 후속 검증 대상입니다.

2026-09-23 당시 재검증 결과: HWPX 전용 테스트는 Debug·ReleaseFast 각각 42/42, 선택적 corpus 조사는 ReleaseFast 21/21, 전체 기본 테스트는 2064/2064 통과했습니다. 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 통과했고 뒤의 두 모드는 각각 2103/2103 테스트를 통과했습니다. ReleaseSafe 비교 검증도 통과했습니다. 이 개수는 현재 전체 테스트 수가 아닙니다.

2026-09-27 현재 소스에서는 `HWPX structure` 합성 테스트 6개와 실파일 header·section 순서 및 `secCnt` 불일치 테스트를 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. 단독 ReleaseFast corpus 조사는 허용 476개·ZIP 거부 6개·암호화 2개, section 544개·선언 불일치 1개·선언 부재 0개·비XML spine 210개·미분류 XML 0개로 위 기록과 일치했습니다. 전체 audit와 과거 변이 검사는 이번 문서 재검증에서 다시 실행하지 않았습니다.
