# HWPX 차트 값 목록 UI

`web/preview/chart-point-table.mjs`는 현재 네이티브 chart 조회 응답의 값을 표로 표시하고, 선택한 point ordinal을 기존 차트 편집 폼에 전달합니다. 자체 수정본·값 캐시·XML 해석이나 native 명령을 소유하지 않습니다. 계열/역할 라벨은 기존 `chart-point-label`이 소유합니다.

값 목록은64개씩 페이지로 나눕니다. 원본 point ordinal과 값을 유지하고 미지원 종류도 읽기 전용으로 표시합니다. 선택은 현재 readiness와 point 종류를 다시 검사하고, 분리된 이전 row·잘못된 ordinal·닫힌 controller는 거부합니다. point 선택만으로 native 값을 변경하지 않습니다. 실제 변경은 기존 폼의 적용 버튼과 setter/history/save 경로를 사용합니다.

값은 textContent로 표시해 markup을 실행하지 않으며 pre-wrap으로 줄바꿈/탭을 보존합니다. UI 페이지 상태만 소유하고 getChart provider에서 현재 응답을 다시 읽습니다. 문서/차트 재조회 중에는 목록을 지우며 close에서 listener와 DOM을 정리합니다.

## 구현·검증 경계

후속 controller 통합 검사는 기존 Worker/Canvas 회귀와 함께10/10 exit0(1510.022917ms)입니다.130개 값의 두 번째 페이지에서65번 선택→폼 값/초점 이동→편집 요청 없음→적용 시 정확한65번 generic setter 요청→canonical 원값 불변→응답 재조회 중 표 제거→최신 값/같은 선택/페이지 복원·분리된 이전 row 거부·busy/close를 확인했습니다. DOM은 테스트 대역이며 새 표의 실제 브라우저 선택/저장 증거는 아닙니다.

통합 테스트의 의존성 범위를 다시 확인했습니다. 순수 chart-controls는 이미 공개한 chart-point-label/table만 import하고 native/Worker/app 모듈을 import하지 않습니다. 따라서 controller와 표 통합 테스트를 같은 커밋에 포함해 fresh checkout의 누락 import를 방지합니다. 데모 app/HTML 연결과 native ABI·기본 WASM 승격은 이 순수 UI 모듈 커밋에 포함하지 않습니다. 앞선 로컬 보류와 실제 데모 연결 완료는 구분합니다.

로컬 chart-controls/index.html에서 표를 기존 폼과 연결했습니다. UI 모듈·표 테스트의 독립 공개와 이 연결의 제품 반영은 구분합니다. 표는 계열 행렬을 추측하지 않으며 직접 다중 셀 편집·계열 추가/삭제·차트 렌더링을 구현한 것은 아닙니다.

`node --test tests/hwpx/chart-point-table.test.mjs tests/hwpx/chart-controls.test.mjs tests/hwpx/chart-current-canvas.test.mjs tests/hwpx/chart-current-worker.test.mjs`에 역할 후보 WASM SHA256 `50cabdb019974d12a6545d44281cf51cbabb86df5d987e185b41a11b3ccc2c24`를 명시한 실행은9/9 exit0(1443.050042ms)입니다. 표 검사는130값의 모든 페이지/마지막2개·미지원 값·분리된 row·빈/음수/분수/지수/범위 밖/불안전 ordinal·busy·현재 응답 교체·값 불변·close 반례를 포함합니다. 기존 실제 Worker/WASM 및 Canvas 대역 회귀는 통과했으나 그 검사는 새 표의 실제 브라우저 선택을 수행하지 않습니다.

JS 문법·diff 공백·정적491모듈 연결도 통과했습니다. 현재 후속은 새 표의 실제 브라우저 선택/저장·데모 app/HTML와 native 연결 코드 커밋·제품 승격이며 기존 폼의 browser 검증을 새 표 선택 증거로 확대하지 않습니다.
