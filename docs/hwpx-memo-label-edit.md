# HWPX 메모 표시 라벨 편집

## 계약과 책임

`field_label_marker_policy.zig`가 라벨 전용 허용 조건을 소유합니다. 기존 `field_text_kind.zig`의 구조 편집 허용 목록에는 MEMO를 추가하지 않습니다.

- 원본 문단 소속을 확인한 source 경로에서만 허용합니다. 생성·구조 변경 상태나 중첩 메모에는 권한을 부여하지 않습니다.
- 명시적 `editable=true`, parameters 1개, 주석 subList 1개가 필요합니다. 알 수 없는 속성·자식과 metaTag는 거부합니다.
- 라벨은 fieldBegin 전체 주석 subtree 뒤부터 연결된 fieldEnd 앞까지입니다. 주석 본문과 작성자는 라벨 텍스트가 아닙니다.
- `field_label_session.zig`는 기존 연결·문단·구간 검증을 유지하고 정책을 소비합니다. `field_nested_ownership.zig`는 선택된 메모 자신의 dirty 상태만 허용합니다.
- 주석 본문의 현재 편집값은 기존 text sites가 소유합니다. 원본 subtree의 별도 캐시로 현재값을 덮지 않습니다.

기존 `fieldLabels`·`spliceFieldLabel`·저장·history API를 재사용합니다. 새로운 export나 메모 구조 생성 API는 추가하지 않습니다. 이전 WASM에 기능이 자동으로 생기지 않습니다.

## 검증

`src/hwpx/memo_label_session_tests.zig`는 실제 aift.hwpx의 구역2 전역 문단3008/3011과 합성 입력을 검사합니다. 주석 subtree 보존, 저장·재열기·재저장, 전체 부분 할당 실패 시 원자성을 확인합니다. 정책 음성 대조는 정책 모듈의 단위 테스트입니다.

`tests/hwpx/memo-label.test.mjs`는 공개 API·주석과 라벨의 연속 편집·UTF-16 경계·메타데이터/연결/중첩 반례8종·실패 후 redo 보존을 검사합니다. `tools/memo-label-oracle.py`는 제품 코드 없이 ZIP inventory·순서·검사 대상 metadata·비대상 payload와 대상 전체 XML 의미를 대조합니다. Python 일반/`-O` 양쪽과 잘못된 기대값 거부를 확인합니다. 압축 ZIP 전체 바이트 동치와 구분하며 undo/redo 저장 결과는 별도로 바이트 비교합니다.

`tests/hwpx/memo-label-canvas.test.mjs`는 실제 Worker/WASM과 모의 DOM/Canvas 입력·권한·저장·이력을 검사합니다. 실제 Chromium·OS IME·한글 조판 동치 증거가 아닙니다.

같은 실제 aift 원본의 메모와 구분되는 필드 바깥 입력 회귀도 위 Canvas 파일에서 검사합니다. 구역1·전역 문단196은 plainEditable=false이지만 시작 범위의 native query-edit-range는 true입니다. 원본 XML 구역1 로컬 문단9와의 좌표 차이를 명시하고 Canvas 선택·범위 조회·Unicode/XML 문자 입력 뒤 독립 Python 일반/-O 전체 XML·비대상 ZIP payload, undo 원본/redo 편집본 바이트 일치와 원본 불변을 확인합니다. 게시 소스 Zig0.17 후보 `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`에서 해당 새 회귀1/1·fail/cancel/skip0·exit0, 약57.9초입니다. 제품 코드 변경 없이 기존 범위 권한 경로를 확인한 것으로, 메모 라벨 자체나 전체6,343문단 검사의 추가 완료 수로 합산하지 않습니다.

게시 커밋 `48bd48fd`를 `/tmp/hwpjs-aift-canvas-clean.qCv1H8`에 추출한 독립 소스에서도 같은 집중 회귀1/1·fail/cancel/skip0·exit0, 약59.2초입니다. 복사한 실제 reference 원본과 작업 트리 원본의 SHA256은 모두 `5e27ee51825d10f0f51bd04935f0f9f8fc24f930a010367d822638964fefd491`입니다. 작업 트리의 미커밋 Worker/Canvas 코드 없이도 통과하며 실제 브라우저 증거로 승격하지 않습니다.

반영된 작업 트리의 ReleaseSafe 집중 바이너리 a26947dba0dec547c529e1249b2e4640c19fb301819e72d54628bcd294f7b376은6/6·fail/skip/log/leak0·exit0입니다. root/XML 익명 등록3개와 메모 assertion 테스트3개를 포함합니다. resource guard 중단 없이 관측 peak footprint78,840,240바이트입니다. 로그는 `/tmp/hwpjs-memo-label-probe.GvEcmM/memo-integrated-guard.jsonl`입니다. 전체 native gate 완료와 구분합니다.

별도 동결 출판 소스의 집중 native 바이너리4fa42f147c8a9e2eb4fb5ceedf605d810fa88751604dad7c614eb43ec58c9a3a도4/4·fail/skip/log/leak0·exit0입니다(root 등록1개+메모 assertion3개). 관측 peak footprint84,738,480바이트이며 `memo-published-guard.jsonl`을 따릅니다. 작업 트리6개와 출판 소스4개는 서로 다른 inventory이므로 합산하지 않습니다.

최종 제품 후보8fa832f0776a4f6c9d3a5110a7724079a61625357203f169925886f906d0be2f의 ReleaseSafe 빌드는 exit0이고 기존6dd와 export 이름·종류334개가 같습니다. signature·전체 동작 동치를 뜻하지 않습니다. 이 후보로 본 작업 트리 공개 API4/4·fail/skip/cancel0·exit0을 확인했습니다(`memo-final-main-api.log`,52,261ms). 기존 실험00c5의 결과를 이 후보 결과로 바꾸어 기록하지 않습니다.

같은 최종 후보로 동결 출판 JS의 기존 필드 회귀27/27·fail/skip/cancel0·exit0을 확인했습니다(`memo-final-field-regressions.log`,101,022ms). 전체 편집 audit나 실제 브라우저 검사는 아닙니다.

같은 최종 후보의 본 작업 트리 Canvas/Worker 검사도1/1·fail/skip/cancel0·exit0입니다(`memo-final-main-canvas.log`,284,313ms). native 권한 조회·직접 입력·독립 XML/ZIP oracle·undo/redo 저장 바이트를 검사했습니다. 모의 DOM/Canvas이며 실제 브라우저나 성능 개선 완료 증거가 아닙니다.

## 남은 제한

실제 Chromium의 메모 라벨 입력·독립 저장·재업로드와 종료 검증은 [실제 브라우저 왕복](hwpx-memo-browser-roundtrip.md)을 따릅니다. 아래 과거 후보 기록의 브라우저 미검증을 모든 후속 후보의 상태로 해석하지 않습니다.

로딩 반복 조회의 후속 후보·실측·남은 검증은 [계산 결과 조회 후보 최적화](hwpx-formula-result-query-batching.md)를 따릅니다.

기본 WASM과 외부 데모는 아직 교체하지 않았습니다. 실제 브라우저와 전체 native gate는 별도입니다. 실험00c5 후보의 native-export profile에서 aift 편집 활성화111,770ms 중91,810ms가 계산 결과 대상 조회111회에 쓰였습니다. 정확성 통과를 실사용 성능 완료로 해석하지 않습니다. `/tmp/hwpjs-memo-label-probe.GvEcmM/memo-native-profile.log` 완료 행을 따릅니다.
