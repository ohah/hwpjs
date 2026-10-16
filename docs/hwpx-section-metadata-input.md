# 구역 설정만 있는 문단의 원문 입력

## main 기반 분리 재검증 — 2026-10-16

`e1148914` 기반 격리 소스 `/tmp/hwpjs-metadata-fix.zyoNkb`에서 metadata collector/서식 지원만 복원한 첫 후보는 native9개 중1개 실패(누수4건), 공개 검사5개 모두 실패했습니다. 입력 위치 허용만으로 충분하지 않았으며 실제 XML 순서 변경과 UnsupportedPageAreaOwnership을 재현했습니다. `metadata_source_splice.eligible`을 적용해 page-area/column 구조 변환 전에 기존 plain 거래를 사용하는 후보는 ReleaseSafe build5/5입니다. WASM SHA256은 `09b72613f3312488c14cd5bf0bd7d0bcc295edc4b672e23a2bda8cbbc8e63d50`이며 기본 설치 산출물은 교체하지 않았습니다.

집중 native는 root 포함9/9·실패/로그/누수0·자원 감시 exit0입니다(`native-metadata-routed.jsonl`, 바이너리 SHA256 `70c23d6a97220afa1003bf204197dcbbcb4a0b8f2808ab260ca1d75ad140b5c8`). 이 짧은 실행의 메모리 peak0은 샘플 부재이며 메모리 사용0을 뜻하지 않습니다. 실제4파일13위치의 normal/-O 전체 XML/비대상 ZIP·오류 기대값 거부·undo/redo·재열기 검사는4/4 통과했습니다. 함께 실행한 Canvas 검사는 입력·저장 이후 서식 oracle 파일이 격리 트리에 없어 실패했으므로 최초 공개 묶음은4/5·exit1 그대로 기록합니다(`metadata-routed-public.log`). 미추적 `tools/hwpx-character-property-oracle.py` 의존성을 명시적으로 연결한 Canvas 재실행은 별도 결과로 판정하며, 전체 native/public·기본 WASM 승격·브라우저 조판 완료 근거로 사용하지 않습니다.

Canvas 재실행은1/1·skip0·exit0(15.942초)이며 stderr0입니다(`metadata-routed-canvas.log`). 같은 WASM으로 실제 Worker 입력·원문 XML 보존·이력·입력 후12pt 변경·독립 서식 XML 양성/음성 대조·저장 재열기까지 확인했습니다. DOM/Canvas는 대역이므로 실제 브라우저 검증으로 세지 않습니다. 검증 의존성의 Git 추적/등록을 포함한 게시 준비는 남아 있습니다.

### 구조 저장 회귀를 포함한 최종 후보

메타데이터 fallback의 문맥 의존성을 처리하는 `run_current_xml` 순서 수정과 실제 텍스트 누락 거부2개·진짜 fallback 투영1개 반례를 함께 적용했습니다. 원본 사이트 대응 검사 이후에만 사이트0개의 run을 보존하며, 새 collector가 단독 wrapper에 만든 가상 사이트를 원본으로 오인하지 않습니다. 최종 WASM `204c62fe7477f8c91f024781a5dcb4b8cc77bda3da1c783d7d3091a7d2804b9f`는 ReleaseSafe build5/5·fmt 통과입니다. 실제13위치/Canvas/기존 pageNum·autoNum·note 앵커 공개 검사8/8·skip0·exit0(38.509초), stderr0입니다(`metadata-final-public.log`).

최종 metadata 필터 native11/11·실패/로그/누수0·감시 exit0(`native-metadata-final.jsonl`, 바이너리 `c95d77da9210fffd1acf13f5a576848853f358a7edea0fc02844f08f0556c685`)와 run writer·실제 다단 병합/소유권 native11/11·동일 오류0·감시 exit0(`native-metadata-normalization.jsonl`, 바이너리 `67b82f65a601f6a504a4af64d70ed0c23e1120e99a962821cedf191d5be57e86`)을 확인했습니다. 필터 간 중복 선언이 있으므로22개 고유 사례로 합산하지 않습니다. 후자의 관측 physical peak는528,188,160바이트이며 전자는 짧아 peak 미관측입니다. 같은 격리 트리의 전체 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`은 별도 `native-full-build.log`/stderr/result.json으로 실행하며 자식 트리 RSS 합계3GiB 초과 시 종료합니다. 최종 결과 전 전체 통과·커밋/푸시·제품 승격은 주장하지 않습니다. 게시용 private index는 무관한 작업을 제외한12파일로 분리했고 원래 사용자 staged patch SHA256은 `f032dec15504dcb1791e4e1d8b822bcf0ccc7199e96961f70acf73f43a533d1a` 그대로입니다.

전체 build 실행은 자식 RSS 합계3,592,528KiB에서 감시가 SIGTERM으로 중단했습니다(`native-full-build.result.json`: code=null, guardStopped=true). root test 출력 파일이0바이트인 상태였고 전체 테스트 실행 완료 증거가 없습니다. 컴파일러를 포함한 프로세스 트리의 RSS 합계이므로 제품 실행 메모리·native 누수·특정 테스트 오류로 해석하지 않습니다. 전체 gate는 **미완료**이며 집중 검증 통과와 구분합니다. 해당12파일의 소스/검증 의존성 복원만 게시 대상으로 유지하고 제품 WASM 교체는 하지 않습니다.

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
