# 차트 셀 이후 경계 조사

## 범위

이 문서는 읽기 전용 관측이며 제품 파서 계약이 아닙니다. 기존 독립 셀 조사기가 순차 계산한 cellEnd를 출발점으로, 그 뒤 26바이트와 이어지는 객체 ID·타입 ID·길이 포함 이름·버전을 기록합니다. 문자열 검색으로 cellEnd를 정하거나 Backdrop 전체 객체 끝을 추정하지 않습니다. 입력 선별에 쓰는 VtChart 마커도 일반 형식 인식기가 아닙니다.

`tests/hwp5/chart-grid-tail-evidence.mjs`는 지정 위치의 원시 바이트와 완전한 선언 후보만 반환합니다. 이름·버전·원시 값의 의미는 검증하지 않습니다. 불완전한 선언은 null이며 잘못된 호출자 offset은 명시적 RangeError입니다. 결과는 입력 변경에 영향을 받지 않습니다. 조사 호출·집계는 별도 `chart-grid-tail-survey.mjs`가 담당합니다. 정규 audit 또는 제품 WASM에 연결하지 않았습니다.

## 실측

2026-09-13, 기존 OLE corpus의 차트 Contents 43개를 다시 조사했습니다. 재현 출력은 `/tmp/hwpjs-chart-grid-tail-survey.json`입니다. 각 행은 내부 Contents SHA-256과 cellEnd를 포함합니다.

- 43/43에서 cellEnd+26의 객체 ID 뒤에 VtBackdrop NUL 종료 이름과 버전 1의 선언 후보가 있습니다.
- 타입 ID는 8이 41개, 7이 2개입니다. 타입 ID 7인 두 표본에는 수치 셀이 없습니다. 8을 상수로 강제할 수 없습니다.
- cellEnd+4의 u16은 열 수−1, +6의 u16은 행 수−1과 43/43 일치합니다. 필드의 정식 의미나 다른 버전의 동일성을 증명하지 않습니다.
- 후속 객체 ID는 마지막 non-null 셀 ID+1과 43/43 일치합니다. 일반 객체 ID 연속성 제약으로 강제하지 않습니다.
- 앞의 원시 26바이트는 10가지입니다. 일부에는 끝부분 `0058d4450058d445`가 있어 모두 영인 패딩으로 버릴 수 없습니다.

공식 [차트 revision 1.2](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_%EC%B0%A8%ED%8A%B8_revision1.2.pdf)의 3.11 Backdrop Object 표는 Frame·Fill·Shadow 속성을 설명합니다. 이 API 표만으로 직렬화 순서, 각 필드 폭, 객체 경계를 확정할 수 없습니다. 이 조사에서는 해당 객체 본문을 파싱하지 않습니다.

## 검증과 다음 경계

네 개 Node 테스트가 통과했습니다. 위치 0/1/17/256, 타입 ID 0/7/8/FFFFFFFF, 입력 변경 이후 결과 유지, 선언 앞 모든 바이트 잘림, 이름 길이 0/65535, 뒤쪽 정상 마커로 복구하지 않음, 임의 이름·버전 보존, 잘못된 offset 오류를 검사합니다. 별도 소스 변형으로 타입 ID=8 강제·원시 바이트 삭제·offset=0 강제·버전=1 강제를 주입했고 네 변형 모두 실제 assertion 실패로 검출했습니다.

실제 조사 결과의 43개 수, 타입별 41/2개, 이름·버전, 치수·객체 ID 상관관계도 독립 assertion으로 확인했습니다. 제품 Zig 코드와 기존 정규 audit는 변경하지 않았으며 이번 단계에서 전체 audit를 재실행한 것으로 보고하지 않습니다.

26바이트의 소유 객체와 의미는 아직 미확정입니다. 후속 조사로 추가한 명시적 관측 구현의 경계는 [Backdrop·빈 Picture 계약](hwp5-chart-backdrop.md)에 둡니다. 이번 결과를 모든 버전의 고정 26바이트 skip 규칙, 전체 차트 구현 완료 또는 편집·저장 지원으로 해석하지 않습니다.

루트에서 제품 WASM이 빌드된 상태로 재현합니다.

```sh
node --test tests/hwp5/chart-grid-tail-evidence.test.mjs
node tests/hwp5/chart-grid-tail-survey.mjs
```
