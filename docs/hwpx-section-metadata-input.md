# 구역 설정만 있는 문단의 원문 입력

## 원문과 경계

`reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx`의1/21/46/147/185/300/348/500/591/877번에는 secPr·colPr·책갈피만 있고 직접 hp:t가 없습니다. 기존 retained_run_metadata.runOnly가 secPr를 제외하여 빈 문단 fallback을 만들지 못했습니다.

로컬 fallback은 run 직접 secPr의 whitespace-only 원문 간격을 검사하고 기존 metadata-only 문단 규칙에 연결합니다. ctrl 분류나 일반 텍스트/앵커 정책의 supported 목록을 넓히지 않습니다. 기존 t/빈 run의 삽입 affinity와 그림/필드 문단 제외를 유지합니다.

## 독립 검사가 드러낸 후속 문제

첫82e76555 후보는 권한 조회를 허용했지만 실제 저장의 독립 전체 XML 검사에서 실패했습니다. 첫 문단 원문은 secPr/colPr/책갈피 순서였는데 다단 구조 편집 경로의 결과는 빈 t/책갈피/새 t/secPr/colPr로 바뀌었습니다. 기존 합성 검사는 metadata 개수만 검사하여 이 순서·affinity 변경을 잡지 못했습니다. 이 실패는 oracle를 느슨하게 바꾸어 통과 처리하지 않았습니다.

`metadata_source_splice.eligible`은 source 상태의 단일 missing_text metadata 사이트만 판정합니다. 기존 필드 외부 보호 준비 이후, page-area/column topology 재작성 전에 공통 plain_paragraph_edit 트랜잭션을 사용합니다. structure_values·여러 사이트·anchor boundary·기존 텍스트/객체/필드 host에는 이 단축 경로를 적용하지 않습니다. 원문 text site와 파생 구조 모델을 동시에 편집하는 것이 아닙니다.

## 검증

합성 권한 회귀는 수정 전1/1 실패를 재현했습니다. 수정 후 native3/3 exit0으로 secPr/단/책갈피 보존·정확한 새 t 순서·undo/redo 및 기존 텍스트/빈 run 선호·객체/필드 제외를 검사했습니다.

source affinity 후보 SHA256 `a6b30bb986825a08e720035019b5a66e9d6bbf0f735df612255ee3fa5922372f`는 ReleaseSafe6/6입니다. 실제10문단 회귀와 기존 쪽번호2문단 회귀2/2 exit0에서 전체 XML/비대상 ZIP payload normal/-O·잘못된 기대값 거부·저장/undo/redo/재열기·파일 불변을 확인했습니다. oracle의 metadata_run 모드는 알려진 metadata roots만 받고 기존 빈 run/텍스트/앵커를 이 경로로 보정하지 않습니다.

기본 검증 목록 등록·누락 방지1/1·전체 source fmt도 통과했습니다. 이 결과는 입력한12개 위치의 실제 편집이며, 문서 전체의 임의 선택/서식/구조 편집이나 한글 조판 완료가 아닙니다. 새 native source 경로의 추가 실패 할당·Worker/브라우저·최신 전체 gate와 core 커밋/제품 승격은 남습니다.

## 후속 실패 경로와 추가 원본

native3/3 exit0 재검사에서 실제 splice 준비의 모든 실패 할당 지점을 순회하고, 실패 후 텍스트 사이트·structure_values 부재·저장 원문 byte-exact를 확인했습니다. 성공도 source 상태를 유지합니다. 이는 합성 입력 트랜잭션의 할당 실패 검사이며 전체 open/저장·WASM 강제 OOM까지 포함하지 않습니다.

동일 a6b30bb9 후보로 실제 검사 범위를 issue3460/svg_picture_repro, issue5780/flow_image_page_background, issue6179/right_tab_footer_logo의 첫 문단까지 확장해4/4 exit0입니다. 총13개 위치의 입력·구역/머리말/꼬리말/쪽 숨김 원문·독립 전체 XML/비대상 ZIP normal/-O·잘못된 기대값 거부·undo/redo·재열기/재저장·파일 불변을 확인했습니다. 앞선 쪽번호2개는 별도 검사 결과이고13개에 중복 합산하지 않습니다. 추가 서식/구조·최신 전체 gate는 여전히 남습니다.

## Canvas Worker와 실제 브라우저

같은 후보의 section-metadata-canvas 회귀1/1 exit0에서 right_tab_footer_logo의 첫 빈 문단을 컨트롤러로 선택하고 beforeinput/input 이벤트를 실제 Worker/WASM까지 전달했습니다. 변경 문자열·독립 XML normal/-O·save·undo 원문/redo 수정본을 확인했습니다. DOM과 좌표 측정은 하네스이므로 실제 브라우저와 구분합니다.

실제 Chromium에서도 loopback8147에 동일 후보를 주입하여 파일 선택·편집 시작·Canvas 물리 클릭·키보드 입력·다운로드·undo/redo·각 다운로드를 확인했습니다. 최초 좌표는 가운데 정렬된 빈 행의 입력 영역 밖이라 선택되지 않았습니다. Worker 응답과 같은 레이아웃 함수를 관측해 유효한 행을 찾은 뒤 클릭했고, 이 과정에서 내용이나 편집 모델을 주입하지 않았습니다. 첫 문단0:0:0 선택 뒤 브라우저😀<& 입력과 splice 성공 응답을 확인했습니다.

다운로드 edited/redone SHA256은 모두 `327ca02201c2f6136934886f4896fb9c6da2dfc95a93f5082cfdca2725865b2d`, undone은 원본과 같은 `7e9bb96a5c1c62b09ec7446afa01b16f38bef22a5c8354af2b7fd46b31821ca4`입니다. edited 파일의 독립 전체 XML/비대상 ZIP normal/-O도 통과했습니다. 산출물과 meta-browser-after.png는 zig-out/verification/section-metadata-source-affinity 아래에 있습니다. 소유 브라우저와 임시 서버는 확인 후 종료했습니다.

화면은 UnsupportedPageFlow의 논리 fallback이며 실제 조판 완료가 아닙니다. 입력은 원본 charPrIDRef34의 height100, 즉1pt를 그대로 상속하여 매우 작게 표시됩니다. 성공한 입력/저장과 화면 가독성을 구분하고, 원본 서식을 임의로16px로 덮어쓰지 않았습니다. 해당 빈 문단의 사용자 지정 글자 크기·서식 UI를 후속 확인해야 합니다.

## 입력 후 명시적 크기 변경 검증

동일 후보의 Canvas Worker 회귀를 확장해 입력 문자열 전체에 기존 character-properties 명령으로 size1200(12pt)을 적용했습니다. 저장 파일을 독립 세션으로 다시 열어 모든 해당 characterRanges의 참조 shape.height가1200인지 확인했으며, 크기 변경 undo는 입력 직후 파일, redo는 크기 변경 파일과 바이트 단위로 같았습니다. 회귀1/1 exit0입니다. 원본1pt를 자동 교정하지 않으며 사용자 명령에 따른 변경만 검증합니다. 실제 브라우저 도구 모음 클릭·빈 문단에 입력하기 전 서식 지정·서식 변경 시 전체 XML 비대상 보존은 별도 검증이 남습니다.

후속 회귀1/1 exit0에서는 크기 변경 전후 파일을 기존 독립 character-property oracle의 anchor-properties 경로로 normal/-O 각각 대조했습니다. 글자 크기 변경·필드/구역 설정 위치와 XML·문단 속성·비대상 ZIP 항목 보존을 확인하고, 변경하지 않은 파일을 결과로 넣는 부정 대조는 두 모드 모두 거부했습니다. 따라서 위의 서식 변경 XML 비대상 보존 검증은 이 한 위치에 한해 완료됐으며, 실제 브라우저 도구 모음과 입력 전 서식 지정은 여전히 미검증입니다.
