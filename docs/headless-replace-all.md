# 전문서 리터럴 전체 바꾸기

현재 main과 공개 웹 데모에서 지원한다. npm 설치 패키지에는 이번 변경을 게시하지 않았다. 기존 한 곳 바꾸기와 별도이며, HWP5/HWPX 전체 의미·모든 owner의 편집 완료도 아니다.

## 책임과 실행

`packages/core/src/commands/replace-all.ts`는 현재 불변 관측의 리터럴 일치를 KMP로 계획한다. 계획의 `executionAuthority:false`는 실행 권한이 없다는 뜻이다. `REPLACE_ALL_COMMAND`는 기존 FIFO에서 처리하고 문서·view token과 `stateVersion`을 읽기 준비 전후 및 Runtime mutation admission에서 재검사한다. 별도 편집 큐나 History를 만들지 않는다.

`web/preview/replace-all-transaction.mjs`는 matching owner를 Map으로 묶고, HWP5 현재 source reference를 요청 내부 window에서 대조한다. 본문 전용 서식 guard를 중첩 문단에 재사용하지 않는다. 실제 쓰기 권한·원문 기대값·보호 영역은 Native 서비스가 검사한다. HWP5 문단은 구역별 0-based이고 HWPX는 전체 문서 1-based Native 좌표이므로 표시 좌표에서 한 번만 변환한다.

단순히 표시 문단 수와 Native 수가 같다고 완전한 범위로 승인하지 않는다. 계획은 일치가 없는 행까지 모든 문단 좌표를 포함하고, 어댑터는 Native의 구역별 수·총수·pending 생성 셀을 포함한 범위와 비교한다. 누락된 문단 대신 범위 밖 좌표를 넣거나 중복 좌표로 수를 맞춘 요청도 쓰기 전에 거부한다. 0건 검색도 이 검사를 거치며 History를 변경하지 않는다.

Native가 발급한 binding·각 owner ref·beforeUnits와 원문 기대값을 하나의 `applyIndependentText`에 전달한다. 반복 splice로 내리지 않는다. Native의 실제 completion은 기존 공통 판정기를 사용한다. 적용 후 표시 문서는 한 번 재생성하고, 이후 실패하면 `committed-refresh-required`로 남긴다. 같은 편집을 재시도하지 않는다. 알려진 거부·no-op은 미적용 상태를 유지하고 불확정 적용은 History 복구 경계를 사용한다.

## 공개 API와 UI

`getReplaceAllCapabilities({token?})`는 기존 Runtime admission에서 현재 엔진의 기본 가용성과 개행 지원 여부를 조회한다. 읽기 관측이며 실행 권한·모든 owner의 쓰기 보장이 아니다. 구형 ABI·읽기 전용·불완전 snapshot은 비가용으로 표시한다. 명령 실행 때에는 별도로 현재 source/coverage/기대값을 다시 확인한다.

모두 바꾸기 버튼은 창을 열 때 기존 입력 barrier를 반영하고 가용성 응답을 받은 뒤 활성화한다. 처리 중에는 다시 누를 수 없고, 닫힌 창·바뀐 문서에 늦은 응답을 적용하지 않는다. 실행 시에도 입력 barrier 이후 최신 state/token으로 `REPLACE_ALL_COMMAND` 하나를 보낸다. 검색 방향은 다음/이전 찾기에만 사용하며 모두 바꾸기는 문서 전체 범위다. 아래 최종 결합 번들과 별도로 공개 GitHub Pages에서도 실제 Worker·Native를 거치는 UI 실행을 확인했다.

## 제한과 비용

정규식·문단을 가로지르는 검색은 포함하지 않는다. 삽입 개행은 변형하지 않고, 현재 Native capability에서 미지원이므로 요청 전체를 거부한다. 필드·수식·추적 변경·생성 셀 등은 실제 어댑터/owner 정책에 따른 제한이 남아 있으며 지원하지 않는 일치를 조용히 제외하지 않는다. 표시 snapshot이 window/limited/clipped이면 요청을 거부한다.

계획 예산은 기존 `REPLACE_ALL_PLAN_LIMITS`, wire 예산은 Native capability가 소유한다. 새 JS 경로는 텍스트·일치·문단·구역에 대해 선형 순회를 사용하고 Map/Set으로 소유자를 색인한다. Native policy·구조 검사·기존 save/History 비용까지 전체 O(n)이라고 주장하지 않는다. HWP5 다구역의 요청 내부 정책 재사용을 검증했다. 16/32/64개 구역에서 query 정책 호출은 16/32/64회, apply 전체는 32/64/128회였다. 이는 정책 검사 계측이며 전체 편집기 비용의 선형성 증거가 아니다.

## 확인한 결과와 남은 검증

HWP5 실제 Core→Runtime→SDK→전체 WASM에서 두 위치 교체와 한 번의 undo/redo를 확인했다. Noori 65문단의 ‘국민’을 ‘시민’으로 바꾸고 undo한 저장 바이트가 이전 저장과 일치했다. 독립 Git 기준 MIT CFB reader·Node raw-DEFLATE·레코드 해석으로 61개 text record의 교체 4곳과 나머지 12개 stream의 보존을 대조했다. 이는 실제 브라우저·한글 프로그램의 원본 조판 동치 근거가 아니다.

HWPX도 실제 Core에서 합성 문서·emoji·Noori를 검사하고 저장 ZIP/XML을 독립 대조했다. Noori의 관측값과 Native는 모두 65문단이고 4곳 교체에 한 revision을 사용했다. pending 생성 셀은 전체 범위를 숨기지 않고 거부했다. 비어 있지 않은 교체 문자는 첫 교체 문자의 현재 전체 서식을 상속한다. HWPX의 이전 왼쪽 site 상속으로 Noori 자간이 -2에서 -7로 바뀌던 반례를 수정했다. 기존 single splice·zero-width·일반 bulk 기본값은 유지한다. 원래 한글 프로그램의 모든 서식 동치를 입증한 결과는 아니다.

최종 결합 Native `d3369b3b66d9b40d1ec7ea59c29f1e2cca6046adac0d2057b1e5c4517814e8e6`와 해당 JS의 후보 번들에서 Vanilla·React·Svelte 각각 HWP5/HWPX를 열고 실제 모두 바꾸기 버튼으로 4곳을 교체했다. 다운로드 파일의 독립 CFB/XML 대조는 원문 비대상 내용·서식과 첫 교체 문자 서식을 검사했다. 단일 undo/redo 저장 바이트 복원, 실제 Node Worker 데이터 경로 49개와 등록 Native profile 경로 14개도 확인했다. 브라우저·임시 서버는 종료했다.

소스 커밋 `981286118`과 자산 커밋 `249158bd6`을 main에 반영했다. GitHub Actions의 JavaScript Quality·CLI TypeScript·Docs 배포가 성공했고, 공개 manifest·WASM·활성 Worker 및 세 framework HTML의 HTTP 응답을 검증 후보와 바이트 단위로 대조했다. 공개 manifest는 `f36eee830190109e7428a66f3f707e643179952c9ab1be1c1be999a530ac9a24`다.

실제 공개 GitHub Pages에서 Vanilla·React·Svelte × HWP5/HWPX 여섯 사례를 실행했다. 각 Noori 파일의 ‘국민’ 네 곳을 UI로 교체하고, 다운로드 파일의 독립 텍스트 대조와 한 번의 undo/redo에 따른 정확한 저장 바이트 복원을 확인했다. 소유 브라우저는 종료했다. 이 공개 실행은 앞서 로컬 후보에서 수행한 전체 서식 오라클과 구분한다. 전달 근거는 `zig-out/verification/independent-text-transaction-r1/main/g05-source-promotion-r1/`의 `live-delivery-http.json`과 `public-browser-r1/report.json`이다.

npm 게시는 하지 않았다. 구형 WASM에서는 기능 가용성을 거부하고 반복 setter로 대체하지 않는다. 원래 한글의 전체 조판·모든 owner·OS IME 동치와 나머지 미지원 기능의 완료로 해석하지 않는다.

재현 원자료는 `zig-out/verification/independent-text-transaction-r1/main/runtime-connect-r1/`에 보존한다. 실패했던 source-Node JSON import 실행과 stale 관측을 사용한 초기 probe도 성공 증거로 합산하지 않는다.

### 새 HWPX에서 첫 입력 후 전체 바꾸기

새 HWPX의 첫 본문에는 단일 단을 선언하는 고정 접두부가 있습니다. 독립 텍스트 편집은 원본 위치와 왼쪽 고정 경계가 일치하는 이 단일 단 선언을 허용하며, 삽입·교체 시 선언을 보존합니다. 다단 설정, 손상된 경계, 권한을 확인할 수 없는 생성 셀은 기존대로 거부합니다. WASM과 브라우저 저장 파일에서 첫 입력 `A😀A`의 두 위치가 바뀌며 나머지 ZIP 파트와 `secPr`·`colPr`가 보존됨을 독립 XML 비교로 확인했습니다.

전체 바꾸기의 다시 실행 결과에는 커서가 없을 수 있습니다. 해당 이력 revision이 확인되면 Canvas는 선택 없는 상태에서 저장과 다시 선택을 허용합니다. 연속 이력은 순서를 유지합니다. 먼저 적용할 대기 텍스트의 위치가 확정되지 않은 경우에는 해당 입력을 보존합니다.
