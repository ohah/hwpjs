# 숫자 편집 독립 oracle의 ZIP/XML 봉투

`tools/hwpx_numeric_package.py`는 병합·연쇄·여러 표/ABOVE·BELOW 네 실제 원본 oracle의 공통 ZIP/XML 보존 계약을 소유합니다. 제품 코드나 수식 계산기는 아니며 원본 SHA256·입력 소속·기대 변경·Decimal 계산은 각 원본 oracle이 계속 소유합니다. 공통 검증을 복사하거나 저장본에서 기대 위치를 추론하지 않습니다.

`expectation(before, after, part)`는 ZIP 항목 순서/중복/전체 comment·모든 항목 CRC·압축 방식/시각/extra/항목 comment/external_attr/internal_attr/create_system·대상 외 모든 payload 바이트를 대조합니다. 다음으로 comment/PI를 포함한 서로 독립적인 expected/actual XML 트리를 반환합니다. 공통 봉투를 통과해도 caller의 전체 XML signature 대조 전에는 편집의 정확성을 입증하지 않습니다. 대상 XML은 caller가 허용한 정확한 부분만 바꿉니다.

`parse`는 DOCTYPE/ENTITY 선언을 거부합니다. 이 파서를 제품 XML 파서나 전체 OWPML 의미 검증으로 사용하지 않습니다.

`tools/hwpx-numeric-package-self-test.py`와 `tests/hwpx/numeric-package-oracle.test.mjs`는 정상 사본·comment/PI 보존·기대/실제 트리의 변경 독립성을 검사합니다. 일곱 metadata 필드·항목 순서/누락/중복/전체 comment·비대상 payload·실제 central-directory CRC 손상의13변조와 두 XML 선언을 normal/-O 양쪽에서 정확한 오류로 거부해야 합니다. 검사를 생략하려는 CLI 인자도 status1/signal=null로 거부합니다. 임의 예외/timeout을 적절한 거부로 세지 않습니다.

초기 집중 실행은2/2·fail/cancel/skip/todo0·exit0이며, 원본 네 회귀 전체의 최종 재실행 결과는 [BELOW 원본 검증](hwpx-below-sum-input-corpus.md)이 소유합니다. 실행 명령은 [개발·검증 명령](development-commands.md)을 따릅니다.
