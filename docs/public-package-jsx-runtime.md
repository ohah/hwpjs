# 공개 패키지 JSX 런타임

공개 패키지 producer는 소비 앱의 개발·프로덕션 모드와 무관하게 사용할 수 있는 production JSX 함수를 출력합니다. 공통 Bun build 설정의 `process.env.NODE_ENV` define을 production으로 고정합니다. React 런타임은 기존처럼 외부 의존성으로 둡니다.

실제 RN 시뮬레이터에서 기존 패키지의 `jsxDEV` 호출이 production React의 미정의 export를 호출해 시작에 실패했습니다. Bun 1.4.4에서는 producer 환경이 development일 때 `jsx.development: false`만으로 이 출력을 막지 못했습니다. 수정 후보는 producer 개발·프로덕션과 실제 React 소비자 개발·프로덕션의 네 조합을 검사합니다. 기본 출력의 실제 실패도 음성 통제로 유지합니다.

정규 검사는 실제 producer 설정을 읽어 작은 TSX를 Bun으로 빌드하고, 실제 React 런타임에서 요소 생성을 실행합니다. 자식 프로세스의 cold start를 고려해 각 테스트의 실행 예산은 30초입니다. 명령은 [개발·검증 명령](development-commands.md)의 공개 패키지 JSX 회귀를 따릅니다.

별도 실제 패키지·Metro 비교에서는 RN Canvas 출력 하나가 변경되고 나머지 83개 출력은 동일했습니다. 이는 iOS Canvas 표시·입력·저장 성공을 증명하지 않습니다. 수정 패키지를 사용하는 실제 시뮬레이터 검증은 별도 단계입니다. npm publish는 수행하지 않았습니다.
