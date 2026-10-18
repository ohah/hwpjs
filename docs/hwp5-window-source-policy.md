# 구간 조회 응답의 원본 편집 정책

## 계약

`queryHwp5WindowContent`는 문단/소유 context를 준비하는 함수입니다. Worker의 최종 HWP5 조회 응답은 기본 표시·활성 구간 표시와 같은 `hwp5Display`를 거쳐야 합니다. native 원본 텍스트 편집 적격성의 결과는 기존 `hwp5-text-source-policy`가 한 응답 안에서 구역별로 판정합니다. 조회 전용 분기에서 별도의 editable/정책 cache를 만들지 않습니다.

정책 조회가 실패하면 해당 문단의 입력 가능 표시를 닫고 오류를 명시합니다. 정책 ABI가 없는 구형 모듈은 기존 호환 동작을 유지하되 `textSourcePolicyAvailable=false`로 확인되지 않은 상태임을 표시합니다. 이 필드는 편집 활성화나 native 쓰기 검증의 대체가 아닙니다. 조회는 활성 구간·원문·undo/redo를 바꾸지 않고, context의 비선택/비편집 조건도 유지합니다.

## 재현과 검증

실제 `charshape.hwp`와 native WASM에서 정책 export만 잘못된 구역 번호로 호출하도록 주입했습니다. 문자열 오류를 가짜로 반환하지 않고 native의 실제 `InvalidSection` 응답을 사용했습니다. 수정 전 기본 표시/enable은 readOnly=true였으나 `query-edit-window`는 editable=true·정책 capability/오류 누락을 반환했습니다(`policy-probe-before.log`). 원본이 잘못된 파일이거나 실제 쓰기 검증을 우회했다는 뜻이 아니라 조회 응답의 정책 전달 누락입니다.

새 `window-source-policy.test.mjs`의 두 반례는 수정 전 모두 실패했습니다(`before.log`). 조회 두 종류를 공통 표시 경로에 연결한 뒤 정확한7파일은12/12·실패/취소/건너뜀0·exit0입니다(`after-focused.log`). native 정책 실패·ABI 부재·활성화 전 거부·다른 구간 조회 후 활성 구간 유지·원문 저장 불변·실제 pending redo와 numeric revision/비어 있지 않은 revision 목록·오류 해소 후 입력 가능 표시 복원을 확인합니다. 기존 Worker 구간/정책 API/Canvas/부분 표 fallback/HWPX 구간 controller도 함께 검사했습니다.

JS 후보는 `/tmp/hwpjs-window-policy-publication.4iv7ic/source`, 주입 native는 별도 소속 인덱스 후보 `02392a100fd6598bdb93d3291fabc8013e83be185cb2304231682c1f364a223b`입니다. native 함수/원본 fixture는 변경하지 않습니다. 이 집중 결과는 최신 합성 소스의 전체 정규/native/실제 OS IME gate나 기본 데모 승격 완료가 아닙니다.

소속 조회 개선이 게시된 `15957015` 위의 `/tmp/hwpjs-window-policy-publication.4iv7ic/final-source`에서도 같은7파일이12/12·fail/cancel/skip0·exit0으로 종료됐습니다(`final-focused.log`). 오류 해소 뒤 native 편집/재열기 없이 재조회만 해도 정상 정책 표시가 복원되고, 원래 redo가 남아 있는지까지 확인했습니다. 이 두 새 검사는 정규 편집 묶음에 등록하지만 최신 합성 소스 전체455개의 완료 판정은 별도입니다.

## 게시 소스의 전체 회귀와 실제 Worker 확인

`482927a7`의 추적 소스와 일치하는 위 `final-source`에서 `zig build hwp5-editor-audit -Doptimize=ReleaseSafe -j1 --summary all`이 종료됐습니다. `final-editor-full.log` 기준455/455·실패/취소/건너뜀0, 빌드7/7단계 성공입니다. 이 산출물의 SHA-256은 `57444ae68a357b70528c6da5394f009060de4c09fcf61af3fa91fb755a708637`입니다. 전체 native 코어나 HWPX 전체·조판 완료를 뜻하지 않습니다.

같은 산출물과 실제 `charshape.hwp`를 실제 Chromium의 DedicatedWorker 두 개에 각각 연결해 수정 전/후 조회 분기를 대조했습니다. 테스트 전용 wrapper는 실제 native 정책 함수에 잘못된 구역 번호를 전달하며, 원본·native 함수·제품 코드는 바꾸지 않습니다. 수정 전에는 enable이 읽기 전용인데도 두 조회 응답의 정책 필드가 **누락**되고 editable=true였습니다. 수정 후에는 두 조회 모두 readOnly=true·editable=false·정책 available=true·오류 `InvalidSection`을 반환했습니다. 활성화 전 편집 조회 거부, context 비편집, revision=0, 저장 바이트 불변도 확인했습니다.

근거는 `/tmp/hwpjs-browser-policy-fault.wHp4QV/result-corrected.log`입니다. 첫 실행은 누락된 readOnly를 false로 예상한 테스트 가정 때문에 실패했으며, 누락과 false를 구분하도록 고친 실행이 통과했습니다. 브라우저 세션과 임시 서버 종료도 확인했습니다. 이는 실제 Worker 프로토콜 검증이며 실제 키보드 입력·OS IME·시각적 조판 검증이나 기본 데모 배포는 아닙니다.
