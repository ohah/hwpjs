# 실제 중첩 표 문서의 전체 문단 입력 검사

## 검증 범위

같은 후보의 참조 HWP5/HWPX 전체 읽기는 [읽기 감사](field-display-candidate-read-audit.md)의 별도 검증 축입니다.

2026-10-13 현재 후보 `field-label-display-owned-api`의 SHA256은 `39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f`입니다. 기본 제품 WASM은 승격하지 않았으며 로컬 native 후보 결과를 원격 native 구현 완료로 소급하지 않습니다.

일반 경로는 `tools/hwpx-edit-corpus-audit.mjs --wasm=<후보> --fixture=<원본> --history`, 전용 경로는 `tools/hwpx-specialized-input-audit.mjs --wasm=<같은 후보> --fixture=<같은 원본>`으로 실행했습니다. 각 명령은 한 원본의 모든 문단을 검사하고 원본 해시 불변을 확인합니다. 두 파일의 네 실행 모두 최종 집계와 종료코드0을 확인했습니다.

| 원본 | 문단 | 일반 prefix 성공/원문 이력 복원 | 전용 앵커 prefix 성공/독립 XML | 최종 미처리 |
| --- | ---: | ---: | ---: | ---: |
| `legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx` | 490 | 472 | 18 | 0 |
| `reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx` | 168 | 166 | 2 | 0 |

입력 SHA256은 table-bug가 `1f5083c031380a2b2d70605b0417f12bc639b4cb36e711f510c423e5f1bbc28d`, 의료장비 파일이 `44df8d22f30621f01a88ce981dae1a4d89d9cc417b54623a0986f286905bb991`입니다. 공통 `combineEditCounts`로 각 실제 집계를 대조한 결과 두 파일 모두 `all_paragraph_prefixes_verified`, remaining=0입니다. 일반 거부20개를 전용 성공과 중복 합산하지 않습니다.

## 실제 확인한 동작

일반 경로는 매 문단 시작에 비숫자 Unicode/XML 특수문자/CR prefix를 입력하고 저장 reader projection, revision 변화, undo 원본 ZIP 바이트 복원, redo 저장 바이트 복원을 확인했습니다. 성공638문단 모두 이력을 복원했습니다. 일반 입력의 UnsupportedParagraphControl 거부는 table-bug18개·의료장비2개이며, 이 문단들은 전용 앵커 경로에서 처리됐습니다. 거부 시 이전 redo 보존은 각각18회·1회입니다. 첫 거부 전에 이전 성공이 없으면 redo가 없으므로 거부 개수와 보존 횟수가 항상 같지는 않습니다.

전용 경로20문단은 독립 Python ZIP/XML oracle을 일반 및 `-O` 실행으로 검사했습니다. 전체 대상 XML과 비대상 payload를 비교하고 저장본 native 재열기·undo/redo를 확인했습니다. 전용 경로의 최종 거부는0입니다.

## 아직 주장하지 않는 것

전체 문단 감사 결과는 **두 실제 파일의 모든 문단 시작 입력**입니다. 일반638문단의 전체 XML 독립 검사는 그 감사에 포함되지 않았습니다. 아래 별도 위치 표본 검사를 전체638문단에 소급하지 않습니다. 모든 표·도형 속성 명령, 모든 픽스쳐, 실제 브라우저 UI, 원본 한글 조판 동치, native 전체 빌드 gate 통과를 뜻하지 않습니다. 제목만 편집한 이전 회귀보다 범위는 넓지만 전체 목표 완료 증거는 아닙니다.

## 원문에서 선택한 위치별 독립 XML 검사

`HWPJS_TEST_WASM=<같은 후보> node tools/run-selected-node-tests.mjs tests/hwpx/table-fixture-splice-positions.test.mjs`는 독립 Python ZIP/XML로 직접 plain text leaf 문단을 먼저 분류합니다. 각 존재하는 body/cell/drawing 범주에서 문서 순서의 첫·중간·마지막 문단을 선택합니다. 빈 문단·인라인 제어·텍스트 내부 제어·run 없는 문단은 이 plain oracle 범위에서 제외하며 편집 미지원으로 판정하지 않습니다.

table-bug의 원문 표본 모수는 body42·cell232·drawing1문단이며 선택7문단에서48건을 실행했습니다. 의료장비의 모수는 cell40문단뿐이고 선택3문단에서21건입니다. 시작·중간·끝 삽입, 해당 grapheme 치환, 마지막 grapheme 삭제를 수행하며 중복 위치는 한 번만 검사합니다. 모든 저장본69개를 기존 `hwpx-plain-splice-oracle.py`의 일반 및 `-O` 실행으로 전체 XML·비대상 payload·ZIP 메타데이터까지 확인했습니다. 각 파일 첫 변경의 잘못된 기대 텍스트는 실제 Whole XML mismatch로 거부되며 인프라 오류를 통과로 취급하지 않습니다.

별도 native 편집기로 저장본 재열기/그대로 재저장, undo 원본 ZIP 바이트 복원, redo 저장 바이트 복원도69건 모두 통과했습니다. 정확한 테스트2/2, skip0, 종료코드0입니다. 최초 의료장비 파일에 일반 본문 표본이 있다고 가정한 harness 오류는 독립 inventory의 실제 cell-only 구조로 교정했습니다. 검사는 모수315문단 중 선택10문단이며 임의 위치의 전수 독립 검증으로 계수하지 않습니다.

페이지 배치·셀 밖 원문 폭 표시·제품 혼합 진입점의 증거는 [표 배치 계약](hwpx-table-anchor-refusals.md)이 소유합니다. 입력 감사 성공과 레이아웃 성공은 별도 축으로 유지합니다.

## 일반 문단 전체 위치 검사 모드

### 같은 후보의 추적 Worker 회귀

`HWPJS_TEST_WASM=<후보39c827ed> node tools/run-selected-node-tests.mjs tests/hwpx/worker-fixtures.test.mjs`는2026-10-13에1/1·skip0·종료코드0(171.742초)으로 종료했습니다. 추적46경로를 검사하며 일반 문단1278·앵커146·필드7·보호 계산 결과13개, 표시 문단1444개를 확인합니다. 별도 암호1파일은 passwordRequired 거부로 분리합니다. 앵커146개·필드7개 전부에 실제 Worker 명령을 보내 표시 갱신·저장·undo 원본 ZIP 바이트 복원·redo 저장 바이트 복원을 확인했습니다. 일반1278문단은 이 Worker 검사에서 모든 명령을 보낸 대상이 아닙니다. 전체 독립 XML·브라우저 E2E·암호 해제 완료 또는 기본 WASM 승격으로 해석하지 않습니다. 아래 위치별 전체 실행은 이 종료와 별개이며 아직 최종 결과가 없습니다.

`HWPJS_FULL_SPLICE_AUDIT=1 HWPJS_TEST_WASM=<후보> node tools/run-selected-node-tests.mjs tests/hwpx/table-fixture-splice-positions.test.mjs`는 같은 독립 inventory의 모든 비어 있지 않은 plain-leaf 문단을 선택합니다. 기본 모드는 여전히 범주별 첫·중간·마지막 표본입니다. 환경값은 미설정 또는 정확한 `1`만 허용하며 `0`/`true`/`yes`/빈 문자열은 artifact·fixture 읽기 전에 거부합니다.

시작 로그는 실제 scope·선택 문단 수·입력/후보 SHA256을 출력합니다. 전체 모드는25문단마다 성공한 문단/편집 수를 출력하며 이것은 최종 통과가 아닙니다. 선택 개수가 독립 inventory의 범주별 합계와 같은지 검사하고 매 문단 입력 버퍼 불변·종료 시 원본 파일/후보 hash 불변을 검사합니다. 범위는 모든 plain 문단의 시작/중간/끝 삽입·grapheme 치환·마지막 grapheme 삭제이며, 모든 문자 위치/보호 제어/빈 문단/객체 명령을 포함하지 않습니다.

2026-10-13 후보39c827ed의 전체 실행은2/2·skip0·종료코드0,730.094초로 종료했습니다. table-bug275문단/1876편집과 의료장비40문단/265편집, 합계315문단/2141편집이 독립 전체 XML/ZIP 일반 및 `-O` 검사·재열기·undo/redo·입력/artifact 불변을 통과했습니다. 모든 문자 위치·제어/빈 문단·모든 객체 명령의 전수 지원 완료는 아닙니다. 기본 모드2/2·69편집과 환경값 반례1/1도 별도 통과했습니다. 반례 harness의 NODE_TEST_CONTEXT 상속에 의한 자식 테스트 생략은 자식 환경에서 그 값만 제거해 교정했습니다. 위 Worker 회귀 당시의 위치 검사 실행 중 기록은 이 최종 결과로 대체합니다.

## 실제 Chromium의 table-bug Canvas 편집

2026-10-13 agent-browser 세션 `hwpjs-fixture-route`에서 loopback18477과 후보39c827ed를 사용했습니다. 파일 업로드가 아닌 데모 픽스쳐 선택(`table-bug.hwpx` id)→열기 경로를 실행했습니다. 잘못된 option value에 파일 경로를 넣으면 선택이 비어 있었으므로 실제 catalog id/value를 확인해 교정했습니다. 이는 파일 업로드 탭 응답 문제의 원인 확인이나 해결 증거는 아닙니다.

실제 Chrome의 시스템 글꼴 측정은19페이지·561행, measured-mixed-inline-body이며 pageLayoutError/수평 extent 오류가 없고 limited=false입니다. Canvas 편집 시작 후 화면의 제목을 실제 pointer로 클릭해0:2:4 캐럿과 textarea 활성화를 확인했습니다. 실제 keyboard inserttext로 `실측😀 `을 삽입한 뒤 Worker 완료와 화면 제목 변경을 확인했습니다. undo는 원래 제목을, redo는 수정 제목을 복원했습니다. 명령 직후에는 이전 textarea 값이 남아 있으므로 처리 완료 후 다시 조회한 값을 증거로 사용했습니다.

다운로드 버튼은 요청 완료를 표시했습니다. URL.createObjectURL에 전달된380379바이트 Blob을 같은 브라우저의 새 reader로 열어490문단과 `2026실측😀 학년도 자율(전공)동아리 개설 신청서`를 확인했습니다. 실제 디스크 다운로드 파일 검증은 아니며 Blob 재열기 증거입니다. 편집 후에도 Canvas 배치 오류가 없고561행·혼합 배치가 유지됩니다. 원본 한글의 페이지/글꼴 동치·모든 셀/도형 UI 편집·IME/클립보드 전수 검증은 아닙니다.

화면 증거는 agent-browser 로컬 screenshot-1791852990090.png(편집 전 Canvas), screenshot-1791853024639.png(직접 입력 후 Canvas)이며 시각적으로 확인했습니다. 소유 브라우저 세션을 close하고 정확한 서버PID32907을 확인해 종료했습니다. 기본 제품 WASM은 변경하지 않았습니다.

## 참조 예제의 데모 접근과 실제 중첩 셀 입력

명시적 demo allowlist에 `medical-exam-equipment.hwpx`(의료장비 — 중첩 표)와 `training-dutmal.hwpx`(직장훈련계획 — 덧말·중첩 표)를 추가했습니다. 기존 서버/정적 준비 경로가 같은 catalog를 사용하며 임의 파일 경로는 허용하지 않습니다. 원본·GET/HEAD·정적 준비·경로/크기/실패 반례8/8 종료코드0입니다. reference 원본이 없는 환경에서는 해당 예제를 제공할 수 없으며 외부 reference 파일 자체를 이 변경에 커밋하지 않습니다.

2026-10-13 실제 Chrome 세션 hwpjs-reference-cells/loopback18478/후보39c827ed에서 의료장비168문단이 measured-body·배치 오류 없음·limited=false·1페이지로 열렸습니다. 첫 클릭은 부모 표의 `년도` 문단5였으므로 중첩 셀 입력 증거로 쓰지 않았습니다. 다시 실제 pointer로 `과별`을 클릭해0:42:1 캐럿을 확인하고 독립 Worker 원문 소유 목록의 자식 표418(parent31)·문단42와 대조했습니다. keyboard inserttext `셀😀` 후 `과셀😀별`이 적용됐습니다. undo는 `과별`, redo는 변경값을 복원했습니다. 즉시 조회한 처리 중 값은 최종 성공값으로 사용하지 않았습니다.

다운로드용140098바이트 Blob을 새 browser reader로 열어168문단과 native 문단43의 `과셀😀별`을 확인했습니다. 저장 후 Canvas의 배치 오류는 없고 measured-body·168행이 유지됩니다(입력 직후의 일시적169행과 구분). 로컬 screenshot-1791853206925.png의 원본 Canvas를 시각 확인했습니다. 그림/표 글자의 겹침과 원본 한글 조판 동치를 해결했다는 의미는 아닙니다.

같은 실제 세션에서 새 training-dutmal id도 열려95문단·93행·1페이지·measured-body·limited=false·배치 오류 없음이 확인됐습니다. 단 그림 배치 후보2개 중 해독1/실패1이며 실패 원인은 아직 조사하지 않았습니다. 전체 그림 표시나 그 문서의 이번 UI 편집 완료로 계수하지 않습니다. 소유 브라우저를 close하고 서버PID61958을 확인해 종료했습니다. 기본 제품 WASM은 승격하지 않았습니다.
