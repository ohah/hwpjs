# 배율 값의 String/Double 선택 필드

## 실제 반례와 수정 범위

[TextBlock 기반 클래스 조사](hwp5-chart-value-text-evidence.md)의 두 번째 Axis 한 개에서 발견한 VtDouble은 **ValueBlock 타입 다음 첫 선택 값(reference)**에 있습니다. 라벨이나 서식 코드가 아닙니다. `chart-value-prefix-evidence.mjs`의 이 필드만 null/String/Double로 확장하고 라벨·서식 코드는 String 제한을 유지합니다.

새 숫자는 ID, VtDouble v1, 원시 u64 비트, u16 trailer, VtValue v1, VtObject v1 순서입니다. 기존 제품 `chart/cell_value.zig`의 관측 배치와 대조했습니다. Float 연산을 하지 않으며 결과는 kind=number, 16자리 bitsHex, trailer, introduced, 시작/끝입니다. 선택적 priorNumbers의 숫자 재참조는 ID 네 바이트만 소비합니다. 호출자 사전은 복제하며 숫자를 String 사전에 넣지 않습니다. 같은 ID가 이전 String/Double 사전에 동시에 있거나 숫자를 라벨에서 재참조하면 명시적으로 거부합니다.

기존 String 결과 형태는 유지합니다. 이번 변경은 독립 조사기이며 제품 Zig ObjectTable의 숫자 참조나 전체 ValueBlock 파서가 아닙니다. 전역 비문자열 객체 충돌·전방 참조·전체 그래프 검증은 범위 밖입니다.

## 두 번째 Axis 실측

`chart-second-axis-value-survey.mjs`는 첫 값의 기반 클래스 끝 이후 +54/+78 **진단 후보**에서 다음 Axis 제목·배율 헤더를 검사합니다. 성공 후보가 정확히 하나인 것을 확인하고 이전 타입/String을 이어 두 번째 값을 읽습니다. 예상한 일반 오류 외에 호스트 예외나 trap은 삼키지 않습니다. 두 길이 선택을 제품 파싱 규칙으로 확정하지 않습니다.

이 제한 아래 34개 모두 두 번째 값의 TextBlock 기반 클래스 끝까지 관측했습니다. 숫자 표본은 Contents 위치 3267에서 시작하는 새 객체 **ID 70**, 타입 ID 7의 VtDouble v1입니다. bitsHex=`409f400000000000`, trailer=65535, 끝 위치 3293입니다. 이전 실패 위치 3275는 숫자 타입 참조를 읽은 직후이므로 라벨 이후 꼬리 오류와 구분됩니다. 입력 SHA-256과 관측 결과는 survey JSON에 남습니다.

## 적대적 검증

- 합성 숫자 테스트 2개와 기존 값/본문 테스트 5개, **총 7개 통과**. ±0, ±무한대, signaling/quiet NaN payload, 최소 subnormal, 모든 비트 1을 숫자 변환 없이 보존합니다. offset 0/1/17/257, 새/기존 타입, 새 값/숫자 재참조, u16 trailer, 모든 잘림, 클래스/버전 변형, 숫자 라벨·모호한 종류 거부, 끝 뒤 데이터, 입력/사전 변경 후 결과 수명도 검사합니다.
- 두 번째 Axis 34개의 잘림 **13,107건**을 정확한 일반 Error로 거부하고 원본 재관측 결과 일치를 확인했습니다.
- 첫 Axis 회귀: 값 접두부 **3,875 cuts/51 versions**, TextBlock 기반 클래스까지 **12,855 cuts/51 versions**도 다시 통과했습니다.
- `/tmp/hwpjs-chart-value-number-mutants.kF2r0X`의 숫자 비트 삭제, trailer 폭 축소, 숫자 사전 조회 누락, 종류 검사 생략, 버전 검사 생략, 기반 타입 뒤 cursor 4바이트 후퇴 **6종**을 구문 검사 후 런타임 테스트 실패(종료 코드 1)로 검출했습니다.

```sh
node --test tests/hwp5/chart-value-number-evidence.test.mjs tests/hwp5/chart-value-prefix-evidence.test.mjs tests/hwp5/chart-value-text-evidence.test.mjs
node tests/hwp5/chart-second-axis-value-survey.mjs --verify
node tests/hwp5/chart-value-prefix-survey.mjs --verify
node tests/hwp5/chart-value-text-survey.mjs --verify
```

이번에는 제품·공통 Axis 조사기·정규 audit 경로를 변경하지 않았습니다. 직전 단계의 세 모드 전체 audit를 이번 변경의 재실행 결과로 주장하지 않습니다. 다음 과제는 숫자/문자열 값과 전역 객체 사전의 제품 통합, 가변 꼬리 선택 조건과 전체 축 경계 규명입니다.
