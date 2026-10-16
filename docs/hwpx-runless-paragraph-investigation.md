# Run 없는 문단의 입력 경로 조사

## main 복원 기준 재현 — 2026-10-16

메타데이터 전용 입력 복원 커밋 `4c06d617`의 WASM 후보 `204c62fe7477f8c91f024781a5dcb4b8cc77bda3da1c783d7d3091a7d2804b9f`로 추적된 `runless-paragraph-worker.test.mjs`를 실행했습니다.2개 모두 입력 전 글자 모양 조회에서 실패했습니다(actual=null, expected=[{start:0,end:0,charShapeId:2}]). 선행 문단 편집 뒤의 같은 조회도 동일하게 실패합니다. 로그는 `/tmp/hwpjs-metadata-fix.zyoNkb/runless-before.log`, exit1·skip0이며 아래 로컬 후보의 과거 성공을 현재 main 지원으로 보지 않습니다. 복원 대상은 원본 스타일 참조→현재 Sites/서식→저장/이력 경로이며 차트·필드 passthrough 등 무관한 미게시 변경은 함께 가져오지 않습니다.

## 현재 실측

### 4c06d617 기반 분리 복원 후보

동일 후보의 기존 formula Worker와 AVG split Worker 회귀도2/2·skip0·exit0(54.183초), stderr0입니다(`runless-formula-regression.log`). 최종 ReleaseSafe 재빌드는5/5 cached이며 WASM SHA256은 아래와 같습니다. 새 runless Worker를 정규 hwpx-text-audit 목록에 등록합니다. 전체 규제분석 장시간 Worker·전체 공개 묶음·실제 브라우저는 이번 실행에 포함하지 않았습니다.

`/tmp/hwpjs-runless-fix.70e4a3`는 main `4c06d617`의 archive에서 시작해 명시적 스타일 해결·새 run 직렬화·Sites 현재값·세션 거래·서식 조회/변경·저장 연결만 복원했습니다. 차트 자원, 필드 원문 passthrough, 다른 문단 구조 정책 변경은 포함하지 않습니다. ReleaseSafe build5/5·fmt 통과, WASM SHA256 `9d935e8bd2714492b3501a433e9d8b62d413431f5d584e30e9386d7fbc411ef5`입니다. 기본 제품 WASM은 그대로 유지했습니다.

native 필터는 root 포함9/9·실패/로그/누수0·자원 감시 exit0입니다(`native-runless.jsonl`, 바이너리 `813de3e0efb57858437de6364ca84a4da439d048222d1e1a39a408fec687a361`, 관측 physical peak569,180,928바이트). sparse 스타일 ID/누락/중복/foreign 참조·정확한 namespace·실제28번 문단·부분 서식·재입력·재열기·체크포인트 및 각 준비/직렬화/query의 전체 할당 실패를 검사했습니다. 전체 세션 입력 거래의 실패 원자성은 별도 새 회귀로 검사하며 이9개에 포함됐다고 보지 않습니다.

앞서 main 후보에서 실패한 Worker2개와 메타데이터 Canvas1개는 같은 후보로3/3·skip0·exit0(21.684초), stderr0입니다(`runless-public.log`). 입력 전/선행 편집 뒤 스타일2·본문 입력·12pt 변경·독립 XML/ZIP normal/-O·잘못된 기대값 거부·선행 문단 보존·분리 이력/거부 후 redo를 확인했습니다. DOM/Canvas 대역이며 실제 브라우저·모든 runless 문서·전체 gate 완료 근거는 아닙니다.

별도 새 `runless_paragraph_transaction_tests`의 root 포함2/2·실패/로그/누수0·감시 exit0을 확인했습니다(`native-runless-transaction.jsonl`, 바이너리 `2b00cfba4d26277f2a1974a1d1e946e93b5d66490f54779651ecead9c93c3ad3`, 관측 physical peak146,325,960바이트). 첫 입력의 모든 실패 할당에서 구조 모델 미설치·원본 저장 byte-exact를 확인하고, 성공 시 구조 모델의 Sites1개만 본문을 소유하는지 검사합니다. 원본 세션·불변 source도 유지됩니다. 전체 코어 검사는 앞선 metadata 후보의 컴파일 자원 중단 이후 미완료 상태이며 이 집중 결과로 대체하지 않습니다.

2026-10-13 후보 SHA256 `a6b30bb986825a08e720035019b5a66e9d6bbf0f735df612255ee3fa5922372f`로 다음 읽기 전용 조사를 실행했습니다.

```sh
node tools/reference-hwpx-prefix-query-audit.mjs --wasm=zig-out/verification/section-metadata-source-affinity/bin/hwpjs.wasm --root=reference/rhwp/samples/hwpx/opengov
```

21파일 모두 조회, 파일 읽기 실패0, 문단2614개 중 plain1642·anchored123·field846·거부3입니다. 종료코드1은 남은 거부를 나타내며 실제 편집·저장·브라우저·조판 지원 완료가 아닙니다. 거부는 36386761의28번, 36388711의1번, 36389301의26번 문단이며 모두 최종 조회 오류 UnsupportedFieldLabelRange입니다.

## 36386761의28번 문단 원인

독립 Python ZIP/XML 읽기로 section0의28개 문단을 대조했습니다. 대상은 hp:p 아래에 linesegarray만 있고 hp:run과 hp:t가 없습니다. 따라서 단순히 빈 t나 빈 run이 있는 기존 입력 경로와 다릅니다. text_sites.collect는 t·빈 run·검증된 metadata-only run에만 사이트를 만들고, paragraph_site_owner.resolve는 사이트가 없는 문단에 MissingTextSite를 반환합니다. 최종 필드 경로의 오류 이름만으로 문서에 필드가 있다고 해석하면 안 됩니다.

대상 문단의 styleIDRef는0이며 header.xml의 style0은 charPrIDRef2를 참조합니다. 직전 문단의 빈 run은 charPrIDRef10입니다. 임의0 또는 직전10을 사용하면 원문 스타일의2와 달라집니다. 이 문단의 정확한 글자 모양 선택에는 기존 스타일 참조 읽기와 새 run 생성의 계약이 필요합니다.

## 구현 경계

현재 이 문단의 입력 지원은 미완료입니다. 안전한 구현은 문단 원문 소유권·명시적 스타일 참조 검증·namespace에 맞는 run/t 생성·기존 lineseg 캐시 무효화·실패 원자성을 함께 처리해야 합니다. 읽기 때 원본 ZIP을 자동 수정하거나 모든 MissingTextSite를 허용하는 방식은 사용하지 않습니다. 자기 닫힌 문단, 주석/PI, 외래 자식, 미지 스타일, 중첩 소유권도 별도 반례로 다뤄야 합니다. 전체 XML/ZIP 독립 비교·입력/서식/undo/redo/재열기와 실제 Canvas 검증 전에는 지원 완료로 계수하지 않습니다.

## 스타일 참조 연결의 로컬 구현

`src/hwpx/paragraph_style_character.zig`는 기존 header_tree와 header_resources.Table을 재사용해 명시적 스타일 ID의 charPrIDRef를 조회합니다. head/refList/styles의 직접 style만 인정하고, ID를 배열 인덱스로 취급하지 않습니다. 참조 누락·글자 모양 누락·중복 스타일·외래 namespace·잘못된 중첩은 거부합니다. 기존 xml_values의 정수 파서와 트리 attributeValue/디코더를 재사용하며 원본이나 테이블을 수정하지 않습니다.

`zig test src/paragraph_style_character_regression_test.zig -O ReleaseSafe --test-filter 'paragraph style character'`의1개 회귀는6개 구조/참조 사례와 조회의 전체 실패 할당을 검사합니다. 추가 파일 및 root 등록의 fmt 검사를 통과했습니다. 입력 거래 연결과 실제 run 생성은 아직 없고, 이 native 변경은 최신 전체 검증을 기다리는 로컬 변경입니다. 문서 커밋만으로 native 구현이 원격에 배포됐다고 해석하지 않습니다.

## 분리된 run XML 생성기

후속 로컬 `runless_paragraph_xml.zig`는 검증된 run 없는 문단에만 새 run/t를 직렬화합니다. 호출자가 확정한 글자 모양 ID를 받고 문단 원문 접두어를 사용하며, 본문 이스케이프와 소스 조립은 기존 공통 XML writer를 재사용합니다. 자기 닫힌 문단과 기존 linesegarray가 있는 문단을 처리하고 오래된 linesegarray는 제거합니다. run/외래 자식/비공백 불투명 gap이 있는 문단은 이 경로로 덮어쓰지 않습니다.

같은 진입점에 두 필터 'paragraph style character', 'runless paragraph XML'을 전달한 ReleaseSafe 집중 검사3/3 exit0입니다. 합성2형태의 정확한 XML, 한도 거부, 생성기의 전체 실패 할당과 실제36386761의28번 문단 생성·전체 section 재파싱을 확인했습니다. 실제 원본 세션은 수정하지 않아 save가 원본과 바이트 단위로 같았습니다. fmt도 통과했습니다. 이는 생성기 검증이고 공개 편집 세션의 입력·저장·history가 아닙니다. 다음은 명시적 스타일 조회와 생성기를 원자적 세션 거래에 연결하는 작업입니다. native 코드는 아직 로컬이며 전체 gate 전에는 커밋하지 않습니다.

## 명시적 스타일과 생성기 연결

생성기의 writeWithStyle은 대상 문단의 unprefixed styleIDRef를 기존 정수 파서로 해석하고, 선택된 header tree/글자 모양 ID inventory를 통해 글자 모양을 확정합니다. 실제 픽스쳐 검사는 이제 숫자2를 호출자가 주입하지 않고 원본 style0의 참조에서 얻습니다. 기본 namespace의 새 run/t, sparse style7→character19, 없는 스타일/속성·외래 속성 거부 및 결합 경로의 전체 실패 할당을 추가한 집중 검사는4/4 exit0, fmt 통과입니다.

세션 전체를 save→open으로 바꾸는 방식은 사용하지 않습니다. editor_checkpoint는 불변 원문 트리/ZIP을 세션에 유지하고 현재 편집값만 교환하므로, 재열기로 원문을 교체하면 기존 undo/redo 스냅샷의 소스 귀속과 충돌합니다. 후속 연결은 기존 현재값 모델의 소유권·clone·예산·조회·save를 함께 확장해야 하며, 위 생성기 검사는 이 세션 거래나 UI 지원을 입증하지 않습니다.

## 현재값 후보 모델

Paragraph에 선택적 synthesized_run_character_id를 추가하고 기존 clone이 이를 보존합니다. 본문은 기존 Sites의 한 항목만 소유하며, 별도 XML/텍스트 캐시는 두지 않습니다. runless_paragraph_current.prepare는 원본에 run이 없음을 공통 생성기로 검증하고 후보만 생성합니다. write는 가상 사이트의 문단 귀속·오프셋·표식을 검증해 공통 생성기를 호출합니다. 구조 분할/병합·서식/필드/객체 귀속이 섞인 후보는 아직 이 경로로 처리하지 않고 거부합니다.

ReleaseSafe 집중5/5 exit0, 후속 현재값 필터1/1 exit0에서 원본 불변·clone의 글자 모양과 텍스트 독립 소유·공통 UTF-16 splice·서로게이트 거부·기존 byteSize 예산·prepare/clone/write 전체 실패 할당을 검사했습니다. fmt도 통과했습니다. 공개 세션·공통 save/표시·이력 교환 연결은 아직 없으므로 canEdit을 켜지 않았습니다. native 변경은 전체 gate 전의 로컬 상태입니다.

## 공통 구역/ZIP 저장 및 체크포인트 교환

paragraph_structure_save의 원문 귀속 검증에 좁은 synthesized run 분기를 연결했습니다. 기존 원문 사이트가0개이고 문단/source ordinal·가상 사이트와 run 없는 원문이 검증된 경우에만 허용합니다. 공통 구역 writer는 새 문단 XML로 해당 문단만 교체하고 다른 원문 사이트 검증은 유지합니다.

공통 저장 회귀1/1 exit0은 전체 구역의 정확한 기대 문자열, 다른 본문/주석 보존, 사이트 귀속 위조 거부, 저장 전체 실패 할당을 검사했습니다. 별도 실제36386761 원본 세션 회귀1/1 exit0은 기존 collect에서 만든 현재값 후보를 내부 설치한 뒤 ZIP save→재열기28번 본문 확인·checkpoint exchange로 원문 ZIP 복원/수정본 byte-exact 복원·session.source 불변을 확인했습니다. fmt도 통과했습니다.

이는 내부 후보 설치와 체크포인트 계약 검사입니다. 공개 splice/canEdit·Worker 표시·서식/구조 거래·공개 History/UI 지원은 아직 연결하지 않았고, 실제 ZIP 결과의 독립 전체 XML oracle은 남습니다. native 변경은 계속 로컬 전체 gate 대기 상태입니다.

## Native 공개 입력 거래 연결

runless_paragraph_session은 기존 display_current_paragraphs/collect·헤더 스타일 조회·현재값 clone·공통 구역 writer를 재사용해 후보를 먼저 검증한 뒤 교환합니다. Session.canEdit/splice/anchorText에 연결했고, 첫 입력·후속 입력의 텍스트는 같은 Sites만 소유합니다. 불변 source는 교체하지 않습니다. 전체 구역/문서 텍스트 예산을 검사하며 초기 빈 입력은 no-op입니다. 필드 envelope 우회를 막기 위해 원문 fieldBegin/fieldEnd가 있는 구역의 새 run 생성은 현재 거부하며, 생성 표가 대기 중인 경로도 기존 거래 정책을 유지합니다. 이 제한은 완성 지원 범위가 아니라 남은 연결 작업입니다.

ReleaseSafe 집중7/7 exit0 후 실제 세션 필터1/1 exit0 재검사에서36386761의28번 문단 canEdit·초기 빈 본문 조회·잘못된 시작 위치 거부·첫 입력·후속 추가 입력·서로게이트 분할 거부·동일 치환 no-op·본문 조회·ZIP save/재열기·checkpoint 원문/수정본 복원을 확인했습니다. fmt도 통과했습니다. 공개 History 객체 및 WASM/Worker/Canvas, 서식·문단 구조, 공개 거래 전체 실패 할당과 독립 실제 ZIP oracle은 별도 검증이 남습니다.

후보 ReleaseSafe 빌드는 zig-out/verification/runless-paragraph-input 경로에서 시작했으며, 이 기록 시점에는 완료 결과가 없습니다. native 구현은 전체 검증 전 로컬 변경으로 남고, 기존 제품 WASM을 승격하지 않았습니다.

## WASM·Canvas 컨트롤러·Worker 검증

후보 빌드6/6 exit0, SHA256 `5c774216d5b7865cc01ad302b774fd8a739834dcc48dba559f8d5b98fa545170`입니다. 첫 Worker 검사에서는 빈 anchorText의 길이0 버퍼를 복사할 때 Invalid typed array length가 재현됐습니다. 빈 WASM 할당의 sentinel 포인터를 길이0 Uint8Array 생성에 사용한 공통 JS 경계 문제였으며, createMemory.copy는 길이가 정확히0이면 역참조 없이 빈 사본을 반환하도록 수정했습니다. 실제 길이가 있는 범위 밖 포인터·음수 길이는 계속 거부합니다.

빈 버퍼·기존 signed-high pointer/secret wipe·runless Canvas Worker·기존 metadata Canvas 회귀4/4 exit0입니다. runless 회귀는 컨트롤러 선택과 beforeinput/input 이벤트를 실제 Worker/WASM으로 전달하고 본문·save·undo 원문/redo 수정본을 확인합니다. DOM은 하네스이므로 실제 Chromium/IME/포인터 검증은 아닙니다.

독립 Python hwpx-runless-input-oracle는 원본 헤더의 styleIDRef→charPrIDRef에서 기대 run을 만들고 대상 section 전체 XML·나머지 ZIP payload·inventory/comment를 비교합니다. normal/-O와 잘못된 본문을 넣는 부정 대조까지 추가한 회귀1/1 exit0이며, 실제 참조 ID2도 확인했습니다. ZIP 압축 바이트/모든 엔트리 metadata 동일성 검사는 아닙니다. 두 회귀를 기본 build 목록에도 로컬 등록했습니다. 제품 WASM 승격·최신 전체 native/public gate·전체 픽스쳐/브라우저 완료는 남습니다.

## 선행 편집 순서 반례와 수정

5c774216 후보에서 다른 문단을 먼저 입력한 뒤28번 빈 문단을 입력하면 MissingTextSite로 실패했습니다. 선행 입력이 structure_values를 설치한 뒤, runless eligibility가 synthesized_run_character_id가 없는 모든 현재 문단을 거부한 것이 원인입니다. 새 후보에서는 현재 모델의 원본 run 없는 빈 문단도 소유권/소스/스타일 검증을 거쳐 후보 생성하도록 수정했습니다. 이미 생성된 run의 검증 및 필드 envelope 거부는 유지합니다.

ReleaseSafe 후보 빌드6/6 exit0, SHA256 `1969c4120eceda1c3b9757fb8350796a34c8c4ce40ca32157c436981977a5dab`입니다. 공개 Canvas Worker2사례·빈 버퍼·기존 metadata Canvas 합계4/4 exit0, native 집중7/7 exit0, 전체 build.zig/src fmt 검사 exit0입니다. 두 번째 Worker 사례는 선행 본문 보존·독립 전체 XML normal/-O·각 history 항목의 undo/redo byte-exact와 실패한 입력 뒤 redo 유지까지 확인합니다. 일반 브라우저/임의 서식·구조 지원으로 확대 해석하지 않습니다.

이 후보를 명시한 새 전체 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`을 시작했고 로그는 zig-out/verification/runless-prior-edit/full-gate/build-test.log입니다. 기록 시점은 실행 중이며, 이전 후보의 장시간 전체 실행 결과와 섞지 않습니다. native 수정은 이 전체 gate 완료 전 로컬에 남고 문서/회귀 테스트만 별도 게시합니다.

## 새 run의 서식 조회

1969c412 후보의 Worker에서 새 본문 characterRanges가 SourceBindingMismatch로 실패했습니다. 원문에 run 노드가 없는 현재 Sites를 기존 원문 run 조회기에 전달한 것이 원인입니다. character_style_snapshot은 검증된 synthesized run의 글자 모양 ID와 Sites의 현재 UTF-16 길이로 detached 범위를 만들도록 수정했습니다. 입력 전과 선행 편집 뒤의 빈 문단은 헤더 스타일에서 길이0 범위를 조회하며, 캐시나 새 텍스트 소유자는 만들지 않습니다.

입력 전 조회는 기존 수식 projection의 원문 사이트 검사에 먼저 걸려 MissingTextSite가 재현됐습니다. 검증된 runless 경로를 먼저 처리하고 나머지 문단은 기존 수식 조회를 유지하도록 순서를 조정했습니다. 실제 native 세션 회귀1/1 exit0에서 입력 전 id2/길이0·입력 후 id2/길이6·조회 전체 실패 할당·본문/저장/체크포인트 불변을 확인했습니다.

최종 ReleaseSafe 후보 빌드6/6 exit0, SHA256 `87679e9ad3026ee66347c520f457e3fa4b1506dd20096ac5079063d47e81c535`입니다. runless Worker2사례·기존 regulatory formula Worker·metadata Canvas 합계4/4 exit0이며, 별도 runless2/2도 통과했습니다. 첫 빈 상태·선행 편집 뒤 빈 상태·입력 상태의 정확한 글자 모양 범위를 검증합니다. 전체 fmt도 exit0입니다. 실제 서식 변경 거래·브라우저 도구 모음·현재 후보의 최신 전체 gate는 미완료이며, 앞서 시작한1969c412 전체 gate를 이 새 후보의 완료 증거로 사용하지 않습니다. native 코드는 계속 로컬입니다.

## 서식 변경과 이후 입력

87679e9a 후보의 실제12pt 변경 명령은 SourceBindingMismatch로 실패했습니다. character_style_session이 새 run의 가상 사이트를 원문 run 위치 파서에 전달한 것이 원인입니다. 새 run의 기본 Span을 만든 뒤 기존 character_style_paint와 리소스/거래/이력 경로를 재사용하도록 연결했습니다. 서식 구간이 생긴 후에는 character_styles만 현재 서식을 소유하고 synthesized_run_character_id는 기본값/출처로 남습니다. 본문은 여전히 Sites 하나만 소유합니다.

runless serializer는 각 서식 구간의 본문 슬라이스를 기존 XML 이스케이프로 직렬화하며, 이후 입력은 공통 character_style_splice.splicePositions로 서식과 본문을 함께 재배치합니다. 새 전용 서식 변경기나 별도 텍스트/서식 캐시는 추가하지 않았습니다.

ReleaseSafe 후보 빌드6/6 exit0, SHA256 `54f3a37b86b2da8996fc1ee4a835415097378c1371a347f0462634d0a312ceff`입니다. native 집중8/8 exit0에서 실제 부분12pt 변경·추가 입력·저장 재열기 후 동일 구간 조회·체크포인트 복원을 확인했습니다. 세 run으로 분할하는 합성 사례는 Unicode 경계 거부·prepare/clone/paint/write의 전체 실패 할당·원본 불변을 검사했습니다. Worker2사례와 기존 metadata Canvas 합계3/3 exit0은 실제 전체12pt 변경의 표시 shape.height·독립 XML/ZIP normal/-O 및 미변경 결과 거부·서식 undo/redo byte-exact까지 포함합니다. 전체 fmt도 exit0입니다. 실제 브라우저 도구 모음·공개 거래 전체 OOM·다른 글자 속성/문단 구조·현재 후보 전체 gate는 남습니다.

같은 후보로 opengov21파일2614문단 prefix 조회를 재실행했습니다. plain1643·anchored123·field846·거부2, 파일 읽기 실패0이며 종료코드1입니다.36386761의28번 거부는 해소됐고 남은 거부는36388711의1번과36389301의26번입니다. 조회 적격성 조사이지2614문단의 실제 편집/저장 완료 증거는 아닙니다. native 수정은 계속 로컬 전체 검증 대기 상태입니다.
