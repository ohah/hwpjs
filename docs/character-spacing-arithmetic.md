# 글자 자간 산술 경계

`character-spacing-arithmetic.mjs`는 조판 단위의 정수 glyph advance와 signed %에서 간격 delta만 계산합니다. 명목 font height나 CSS em을 advance 대신 사용하지 않습니다. 1000/-5는 -50, 500/-5는 -25이고 10/-5의 -0.5는 -1입니다.

반올림·곱셈/나눗셈·int32 overflow 검사는 `integer-mul-div.mjs`가 소유합니다. 기존 HWP5 행간 모듈도 같은 함수를 import/re-export하므로 API를 깨지 않고 별도 구현을 제거합니다. 음수 절반값을 Math.round로 처리하거나 중간 곱을 32비트 bitwise로 자르지 않습니다. 자간 함수는 음수/비정수 advance·signed byte 밖의 percent·overflow를 null로 거부합니다. 명세 권장 범위 밖의 원래 signed byte도 산술적으로는 보존하며 표시 적용 정책과 구분합니다.

[상대 글자 크기](relative-font-size.md)도 같은 정수 산술을 소비합니다. 행간·자간 delta·상대 크기가 반올림을 서로 다른 사본으로 관리하지 않습니다. 기존 행간 음성 대조는 모듈 분리 뒤에도 실제 공통 의존성을 absolute URL로 연결해 세 변이의 오답을 계속 검사합니다.

이 함수는 아직 renderer 측정에 연결하지 않습니다. 마지막 glyph 뒤 간격 제거·줄바꿈·그룹 경계·제어 문자·결합 문자·언어 선택·실제 글꼴 advance 획득은 별도 계약이 필요합니다. CSS 측정 폭에 임의로 75를 곱해 원래 advance를 얻었다고 주장하지 않습니다. [원값 조회](character-font-metrics.md)·[장평](horizontal-font-scale.md)·[명목 높이](font-layout-metrics.md)의 완료 범위와 구분합니다.

테스트는 부호·절반값·advance 기준 차이·원값 범위·overflow 거부와 기존 행간 export의 함수 동일성, 0~1000 advance와 9개 percent 조합을 검사합니다. 이는 자간 표시·원본 조판 완료 검사가 아닙니다.

공통 함수의 절삭·음수 절반값·중간 곱 int32 축소 변이도 별도 음성 대조로 검출했습니다. 모듈 분리 과정에서 기존 data URL 변이 검사의 상대 import 기준이 사라지는 harness 오류를 먼저 확인해 absolute 의존성 연결로 수정했습니다. 제품의 반올림/오류 처리를 완화해 통과시키지 않았습니다. 관련 분리 JS 53개가 skip 없이 통과했으며 이전 49개 결과와 중복 합산하지 않습니다.
