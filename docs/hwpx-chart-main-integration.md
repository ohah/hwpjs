# HWPX 차트 포인트 편집 통합 후보

아래는 포인트 전용 후보의 기록이다. 후속 [계열 이름 통합 후보](hwpx-chart-series-main-integration.md)의 API·실측·남은 경계는 별도로 관리한다.

## 범위와 소유권

기존 기본 WASM에 존재하는 차트 조회·숫자/문자열 포인트 편집·명시적 OLE 호환 옵션의 7개 export를 main 기반 후보에도 유지한다. 포인트 현재값과 공유 리소스 연결은 native 세션이 소유한다. JS는 입력·optional ABI 검사와 응답 복사만 수행한다. 저장은 같은 소유 현재값을 XML 및 연결된 OLE 사본에 적용하고 checkpoint/history도 해당 소유값을 교환한다. 표시 캐시를 저장 SSOT로 쓰지 않는다.

기본 OLE 읽기는 strict다. 관측 편차 허용은 명시적 선택이며 손상된 모든 CFB를 허용하는 옵션이 아니다. conditional object의 기존 wire tag 19와 dutmal tag 20을 유지한다.

## 2026-10-18 후보 검증

- 기존 기본 WASM SHA256: `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`.
- 통합 후보 SHA256: `6ca7b0e8ebf0fc711017e8c343085cfbbc1e1ba697f7ed4906bd61e1c33a474d`.
- 앞선 후보에서 기존 차트 export 7개 누락을 발견했다. 통합 후 기존 311개 이름·종류 모두 유지, 후보 총 324개다. 이 검사는 함수 signature나 동작 동일성의 증명이 아니다.
- native 집중검사: Debug·ReleaseSafe 각각 소유권/부분 할당 실패/Session/CFB 경로 10개, 문자열 집중검사 각각 8개 통과. 두 집합의 공통 root 테스트 등을 독립 기능 수로 합산하지 않는다.
- 원본 차트 28문서의 숫자 포인트 289개, 문자열 포인트 297개를 편집했다. 독립 Python XML/ZIP/OLE 검사, 저장·재열기·undo/redo를 대조했다. 숫자 suite 29개, 문자열 suite 3개 통과, skip 0이다.
- optional ABI·바이트 한도·잘못된 옵션·실패 후 이력/redo 보존 및 export 검출기: 24개 통과, skip 0.
- 기존 기본 WASM과 후보의 28문서 조회 packet 전체를 비교했다. 본문 입력 28회와 차트 편집 56회 전후 및 undo/redo에서 노드·사이트·포인트 응답이 일치했다.
- 별도 공유 사본 테스트에서 포인트 관련 6개 항목이 통과했다. 같은 파일의 후속 계열 이름 API 3개 항목은 후보에 아직 없는 API 때문에 실패했다. 계열 이름 지원 완료나 해당 파일 전체 통과로 해석하지 않는다.
- 추가 회귀: HWP5 원본 입력 정책·Canvas 입력/편집과 HWPX 생성 표 내용·호스트 splice·독립 저장 검사 233개 통과, 실패/skip 0. Canvas 대역 테스트이며 이번 후보로 실제 Chromium을 다시 검사한 결과는 아니다.

## 남은 경계

위 결과는 차트 포인트 코어의 집중검사다. 차트 계열 이름/rich-text 공개 API, 일괄 편집, Canvas 차트 전체 조판, 실제 한글과의 픽셀 동일성을 완료했다고 주장하지 않는다. 전체 native gate 및 다른 편집 기능 회귀는 별도 완료 확인이 필요하다. 기본 WASM·외부 데모는 이 후보로 교체하지 않았다.

## 재현 명령

실행 명령과 환경변수는 [개발·검증 명령](development-commands.md)의 차트 포인트 통합 항목이 소유한다. 원본 reference가 없으면 관련 검사는 명시적으로 skip하며 실제 원본 통과로 세지 않는다.
