# HWPX header 시작 번호

`XmlTrees.inspectBeginNumbers(allocator, options)`는 이미 소유한 2011 namespace header 트리의 **직접 자식** `beginNum`만 읽습니다. `page`·`footnote`·`endnote`·`pic`·`tbl`·`equation` 여섯 속성의 XML 정규화 문자열을 소유한 보고서로 반환하며 `deinit(allocator)`으로 해제합니다. 각 존재 값은 임의 길이 `xs:positiveInteger` 표기여야 하고, 0·음수·손상된 십진수는 오류입니다. `beginNum` 자체와 개별 속성의 부재를 구분하고, 중첩된 동명 요소는 별도 집계하며, 직접 자식이 중복되면 오류입니다. 없는 값을 1로 채우거나 원본 XML을 바꾸지 않습니다. 속성별 정규화 바이트 상한은 기본 4096입니다.

[한컴의 Header 스키마·필드 설명](https://tech.hancom.com/python-hwpx-parsing-2/)은 2021 계열 예시에서 `beginNum`의 여섯 `xs:positiveInteger` 속성을 필수로 제시합니다. 그러나 현재 지원하는 2011 namespace 실파일에서는 요소 자체가 없는 문서가 발견됐습니다. 따라서 이 계층은 스키마 세대의 동치를 가정하지 않고 부재를 진단으로 보존합니다. 이 값은 시작 번호의 원값일 뿐 문서 내 실제 페이지·각주·그림 번호나 편집 시 배정 규칙을 계산하지 않습니다.

## 검증

합성 XML은 여섯 필드·XML 문자 참조·앞뒤 공백·큰 정수, 요소/속성 부재, 다른 namespace·중첩 요소, 직접 자식 중복, 0·음수·손상된 십진수, 정확한 바이트 한도, 모든 할당 실패와 ReleaseFast 해제 경로를 검사합니다. 선택 실파일 대조는 [문서 XML 트리 조립](hwpx-document-trees.md)의 8개 shard 명령에서 독립 Python ElementTree 조사와 비교합니다.

2026-09-24 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서에서 `beginNum` 직접 자식이 있는 문서는 455개, 없는 문서는 21개였습니다. 존재하는 455개는 여섯 속성이 모두 있고 값은 모두 1이었으며 직접 중복·중첩 동명 요소는 관측되지 않았습니다. 실파일이 제공하지 않는 다른 양의 값·누락 속성은 합성 테스트 범위입니다. 이 결과는 header 전체 스키마 검증이나 실제 번호 배정 의미의 증거가 아닙니다.

부재 21개는 모두 header `version="1.4"`였지만, 같은 버전 197개 중 176개에는 `beginNum`이 있습니다. 따라서 버전 문자열만으로 요소 존재를 추론하거나 임의 기본값을 적용하지 않습니다. 이 분포는 독립 Python 조사에서 확인한 해당 두 corpus의 관측값이며 모든 1.4 문서에 대한 규칙은 아닙니다.

같은 변경에서 네이티브 Debug 전체 테스트 2,188개, 전용 단위 테스트 6개(Debug·ReleaseSafe·ReleaseFast), ReleaseSafe 제품 빌드 및 전체 Debug `zig build audit --summary all`이 통과했습니다. 선택 실파일 8개 shard도 버전 연결을 포함해 별도로 모두 통과했습니다. 이 shard들은 기본 audit에 포함되지 않습니다.
