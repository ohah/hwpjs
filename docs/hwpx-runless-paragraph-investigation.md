# Run 없는 문단의 입력 경로 조사

## 현재 실측

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
