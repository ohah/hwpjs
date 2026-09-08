# ICC 확장 TRC 역변환 연결

## 구현 계약

`trc_inverse.selectWide(precision,curve,target)`는 u512 정규화 목표를 받아 u1024 유리수 또는 기호근 입력 좌표를 반환합니다. 기존 `select`의 u128 입력 계약은 유지합니다. 두 진입점은 `selectFor`를 공유하며 목표 검증을 곡선 분기보다 먼저 수행합니다.

identity는 목표 분자·분모를 그대로 확장합니다. 샘플 곡선은 기존 `sampled_inverse.invertWide`에 위임하고 결과 필드를 손실 없이 옮깁니다. 감마는 기존과 동일하게 `gamma_parametric.curve`로 변환한 뒤 파라메트릭 역변환을 사용합니다. 감마 전용 수학 규칙을 이 계층에 복제하지 않습니다.

파라메트릭 경로의 selected 좌표, undecided, unattained, ambiguous와 오류를 그대로 전달합니다. 곡선 전체의 단조성·평탄부·최근접 출력 선택은 [확장 파라메트릭 역변환](icc-extended-parametric-inverse.md)이 소유합니다. 이 진입점은 signed 입력 클리핑이나 프로파일 의미 검증을 수행하지 않습니다.

## 진행 중인 검증

신규 네이티브 테스트는 최대 u512 identity 보존, u512를 넘는 샘플 결과, 감마/파라메트릭의 정확한 제곱근, 큰 목표의 동률, 목표 검증 우선순위, 잘못된 감마·비단조 샘플 거부를 검사합니다. 결과 union과 optional 태그를 먼저 검증합니다.

확장 행렬 역변환 연결과 제품 JS API는 포함하지 않습니다. 이 변경의 완료된 검증은 아래에 기록합니다.

## WASM 직접 대조

테스트 mode236(v2)/237(v4)는 기존 mode213/214와 입력 파싱·출력 serializer를 공유합니다. 확장 입력은 precision 4바이트, 분자·분모 각 64바이트, 채널 4바이트, 원시 태그 순서입니다. 결과는 채널·의미 보류 플래그 8바이트 뒤 상태 payload이며 selected는 288바이트, ambiguous는 216바이트, unattained/undecided는 4바이트입니다.

Debug 직접 대조는 기존 selected=722/rejected=232, 확장 selected=722/rejected=424이며 각 경로에서 unattained/ambiguous/undecided 각 1건을 추가 확인했습니다. 큰 분모의 증가·감소 샘플 보간을 독립 분수식으로 검사합니다. 유리수 좌표 상위 비트 삭제, ambiguous/undecided를 unattained로 변경, 채널을 0으로 변경한 네 출력 변형은 모두 ERR_ASSERTION으로 검출했습니다. 이는 테스트 민감도 검사이며 실제 소스 변형 검증이나 전체 모드 감사 완료를 의미하지 않습니다.

전체 네이티브는 685/685로 통과했습니다. 세 모드 전체 감사 결과는 아래 최종 감사 기록을 참조합니다.

## 임시 소스 변형·실제 프로파일

임시 복사본 `/tmp/hwpjs-wide-trc-mutant.NpNDBM/icc`에서 identity 분자를 u128로 잘라 반환하도록 변경했습니다. Debug·ReleaseSafe·ReleaseFast 모두 신규 테스트 3개 중 1개가 TestExpectedEqual로 실패했습니다. 안전 검사 panic에만 의존하지 않고 실제 값 불일치를 검출했습니다. 제품 소스는 변형하지 않았습니다. 로그는 `/tmp/hwpjs-wide-trc-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

macOS 시스템 ICC의 curv 감마 TRC 10개에서 원시 태그를 mode237로 전달하고, 최대 u512 분모의 목표 0/1에 대한 정확한 좌표와 채널·의미 보류 플래그를 독립 검사했습니다. 20건이 통과했습니다. 이 수동 검사는 정규 audit 건수에 포함하지 않으며, OS 색상 엔진이나 HWP 렌더링과의 일치 검증은 아닙니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 순차 전체 audit가 모두 종료 코드 0, 20/20 단계, 네이티브 685/685, WASM checks=6,987,904로 완료됐습니다. 이전 6,986,563에 기존 경로의 큰 샘플 보간 192건과 확장 경로 1,149건이 추가됐습니다. 로그는 `/tmp/hwpjs-wide-trc-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. ReleaseSafe·ReleaseFast 실제 감사 산출물에서도 기존/확장 직접 대조 및 네 출력 변형 검출이 통과했습니다.

최종 소스 검토에서는 목표 검증 선행, 분기별 기존 수학 모듈 재사용, 분자·분모 손실 없는 전달, 상태와 오류 보존, 채널·판본 정책 분리, wire 전체 초기화와 임시 버퍼 해제를 확인했습니다. 이번 범위에서 추가 결함은 발견하지 못했습니다. 변경 Zig 포맷·JS 문법·diff 공백·문서 로컬 링크 6개를 확인했습니다. 전체 HWP/HWPX 문서 검증·편집·저장·렌더링 완료를 의미하지 않습니다.
