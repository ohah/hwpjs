# HWPX XML 네임스페이스 버전 경계

현재 HWPX 구조·section 파서는 `http://www.hancom.co.kr/hwpml/2011/` 계열의 `head`·`section`·`paragraph`·`core` 이름만 의미 있게 처리합니다. `version.xml`의 숫자, header `version` 문자열, XML 루트 네임스페이스는 서로 다른 관측값이며 어느 하나에서 다른 하나의 지원 여부를 추론하지 않습니다. [한컴의 HWPX 본문 설명](https://tech.hancom.com/python-hwpx-parsing-2/)에는 `http://www.owpml.org/owpml/2021/section`과 `.../2021/paragraph` 스키마가 제시되어 있으므로, 2011 corpus 통과를 모든 OWPML 버전 지원으로 확대할 수 없습니다.

`src/hwpx/namespace_profile.zig`는 루트의 확장된 이름이 `head` 또는 `sec`이고 URI가 `http://www.owpml.org/owpml/` + 네 자리 연도 + `/head` 또는 `/section`인 경우만 **미지원 버전 계열**로 식별합니다. 이를 스키마 검증이나 2021/2024 의미 지원으로 취급하지 않습니다. `Document.inspectStructure`, `readSectionTree`, `inspectSectionText`, 직접 `SectionTree.parse`는 해당 루트에서 `UnsupportedHwpxNamespaceProfile`을 반환합니다. 다른 URI의 위장 루트는 기존 잘못된 루트 진단으로 남기고, 미지원 버전을 빈 문서 또는 없는 section으로 조용히 처리하지 않습니다. header-only 검사 중 일부는 기존 `InvalidHeaderRoot`로 거부하므로 모든 API가 같은 오류 이름을 제공한다고 주장하지 않습니다.

이 경계는 지원되는 2011 XML의 내부 필드가 다른 버전에서 동일하다고 가정하지 않습니다. 후속 버전 지원은 header·section·참조·텍스트·리소스 소비자를 한 프로필로 묶고 실제 해당 버전 문서와 스키마로 대조한 뒤에만 활성화해야 합니다.

## 검증

독립 Python `ElementTree` 조사에서 로컬 HWPX 484개 중 ZIP 거부 6개와 암호화 2개를 제외한 476개 문서의 header 루트는 모두 2011 `head`였고, spine의 section 루트 544개도 모두 2011 `sec`였습니다. 이 corpus에는 2021/2024 루트 실파일이 없어 **해당 버전의 읽기 정확도는 실파일로 검증되지 않았습니다**. 합성 ZIP에서는 2011 header+2021 section, 2021 header+2011 section을 각각 오류로 확인했고, 직접 section 파서는 2021/2024 URI와 비슷하지만 일치하지 않는 URI를 구별했습니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

2026-09-24 적대적 재검증에서 독립 조사기가 중도 손상 파일의 header를 허용 문서로 잘못 계수하지 않도록 header 루트 합계와 허용 문서 수의 일치 검사를 추가했습니다. 재실행 결과는 허용 476·암호화 2·ZIP 거부 6, header 루트 476·section 루트 544였고, 제품 구조 조사도 같은 476문서·544섹션에서 통과했습니다. 기본 테스트 2,166개, HWPX 전용 141개, 새 경계 테스트 Debug·ReleaseSafe·ReleaseFast 각 3개가 통과했습니다. 이 결과는 기존 2011 corpus의 회귀 검증이지 후속 버전의 실제 파일 호환성 증거가 아닙니다.
