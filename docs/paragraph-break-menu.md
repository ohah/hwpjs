# 쪽·단 나누기 메뉴

## 현재 범위

삽입 메뉴에서 쪽 나누기와 단 나누기를 호출합니다. [native·WASM 계약](paragraph-flow-break-edit.md)을 재사용하며, 고정된 `/tmp/hwpjs-flow-publish.3IvUJZ`의 이전 UI에는 이 후속 변경을 복사하지 않았습니다. 앞선 정규581/377 결과에 이 메뉴 변경을 소급 포함하지 않습니다.

기본8080 서버는 주 작업본 UI를 직접 제공하므로 메뉴 노출은 재시작 없이 바뀔 수 있습니다. 기본 WASM/서버 프로세스는 교체하지 않았고, 선택 ABI가 없는 기본 WASM에서는 새 메뉴가 비활성화됩니다. 이번 직접 실행은0619 후보를 명시했습니다.

## 책임과 거부

삽입 리본의 `#paragraph-break-tools`도 같은 두 명령을 노출합니다. `paragraph-break-controls.mjs`는 기존 메뉴 registry를 구독해 enabled를 투영하고 클릭 순간 다시 검사한 뒤 execute만 위임합니다. 별도 native capability/선택/History를 소유하지 않고 검색 registry에 중복 명령도 등록하지 않습니다. 종료 시 구독·리스너를 해제하고 두 버튼을 비활성화합니다. 리본 컨트롤은 기존 DOM 이동/복원 계약을 유지합니다.

`canvas-editor.mjs`의 `canInsertParagraphBreak`와 `insertParagraphBreak`가 기존 선택·입력 상태를 검사하고 기존 private split을 호출합니다. 메뉴와 단축키가 별도 native 명령·선택 복사본·이력을 만들지 않습니다. kind 검사는 Worker와 같은 순수 `paragraphBreakIntent`를 재사용합니다.

메뉴 대상은 완료된 단일 본문 선택뿐입니다. ABI/구조 capability 부재·중첩/생성 셀·다중 문단·조합/처리 중·드래그·미반영 입력·종료 상태는 비활성/거부합니다. 입력/분할 허가가 필요한 범위는 기존 허가 상태를 따릅니다. 메뉴 포커스 이동은 원래 Canvas 선택을 소비하지 않습니다.

app의 가상 target은 기존 문서 메뉴 제어기에 조회/실행만 위임합니다. 같은 레지스트리를 사용하는 명령 검색에도 이름·허가가 전달되며 독립 명령 목록은 추가하지 않습니다. 문서 메뉴의 키보드·mnemonic·popup 수명은 기존 모듈이 계속 소유합니다.

## 검증

UI 포함 HWPX 정규115파일도381/381·fail/cancel/skip0·child/wrapper exit0·signal=null·stderr0으로 종료했습니다(1395950.425083ms).0619 후보와9e75 baseline을 명시해 기존 차트 baseline 검사도 건너뛰지 않았습니다.7,106입력 전후 해시가 동일하며 `clean-ui-full-hwpx.log` SHA256은 `881f82e38f2ecd424e3e4b2e126ae973aaddebdec410f95a474044ca40bf39a7`입니다. HWP5 전체610개·UI 회귀308개·실제 브라우저16경로·신규 빌드 직접62개와 각각의 범위를 구분합니다. 제품 기본 산출물 승격·전체 참조 편집/원본 조판의 완료를 뜻하지 않습니다.

분리 사본에서 `nice -n10 mise exec -- zig build -Doptimize=ReleaseSafe -j2 --prefix /tmp/hwpjs-flow-ui-publish.367rSf/final-install` 제품 재빌드가exit0·stderr0으로 완료됐습니다. 새 WASM SHA256은 `bacf2ef3cd5ed1b2cf5b2ffc9d50f755ae08092d4a52c9ccf6a264e936a7a9fc`입니다. engine Module 검증 뒤 section 길이/ULEB 경계를 검사해0619와 모든 non-custom 바이트 및338exports가 정확히 같음을 확인했습니다(runtime SHA256 `a560e12bc61d6e13633fd8523edf403afc629964637296737c4e7f57ec2f4742`). `clean-ui-runtime-parity.json` SHA256은 `9ebdb5f533ca740bc091b3f4a81886d1732c0d7f6975a0572ea972a48002b241`입니다. 전체 파일 해시나 debug custom section이 같다는 뜻은 아닙니다. 새 파일을 직접 명시한 API/adapter/editor/menu/Worker/owner/followup7파일의 `clean-ui-built-wasm-regression.log/.stderr`도62/62·fail/cancel/skip0·exit0·stderr0입니다(로그 SHA256 `4a7be4651c9ec50bc954656147887b6091c93ee54ab1a75877638c735f21c213`). 앞선610개 전체/실제 브라우저는0619로 실행했으며 새 전체 해시로 직접 재실행했다고 소급하지 않습니다. 기본 산출물·서버는 교체하지 않았습니다.


Git 조회 환경을 보완한 UI 포함 정규 HWP5 전체105파일은610/610·fail/cancel/skip0·child/wrapper exit0·signal=null·stderr0으로 완료했습니다(970487.748542ms).7,102입력과 후보0619의 전후 해시가 동일합니다. `clean-ui-full-hwp5-git-context.log` SHA256은 `c2fcb8ead52cd14386d14bb52e7aadb19ee14c288d09f349cebea77dce463a02`이며 최종 identity 행도 확인했습니다. 최초609/610 실패 실행과 구분합니다. 이어 HWPX 정규115파일을 같은 사본/0619 후보·명시적9e75 baseline으로 시작했습니다. `clean-ui-full-hwpx-wrapper.jsonl`은7,106입력 고정을 보고하며 목록 추출 helper의 공통 WASM 폴더 누락 수정본도 외부 입력으로 포함합니다. 이 helper/기존 정규 회귀의 수정은67420e7f로 별도 게시됐고 실제 UI 사본의 다른 입력은 변경하지 않았습니다. HWPX 전체 종료·native 전체 종료·기본 WASM 승격은 아직 남았습니다.


첫 UI 포함 정규 전체 실행은610개 중609pass/1fail·skip0·child/wrapper exit1로 종료했습니다. 실패는 `table-content.test.mjs`의 실제 Worker fixture 전수 검사가 archive 사본에서 `git ls-files -z`를 호출하며 Git 저장소 부재로 중단된 것입니다. 제품 오류로 바꾸거나 누락 검사를 건너뛰지 않았습니다. 시작/끝7,101입력 해시는 모두 같고 최초 전체 로그 SHA256은 `a86aae372073d071aa13880ea6629250fb741ab9c3061f99d12b45440ec45d33`입니다. 고정 게시 index·사본 worktree를 Git 조회 환경으로 주입한 `clean-ui-table-git-context.log/.stderr`는3/3·skip0·exit0·stderr0입니다. 이어 전체105파일을 `clean-ui-full-hwp5-git-context.log/.stderr`로 재시작했습니다. index도 포함한7,102입력 manifest SHA256은 `2bb5222a485af30451600a246d33aaaab7458e0a0fc371fc0ad6a1f9c98d8293`입니다. 첫 전체609개와 집중3개를610/610 전체 통과로 합산하지 않습니다. 재실행 종료와 입력 재대조가 남았습니다.


최신 분리 UI 사본의 HWP5 정규 전체105파일을0619 후보·Node24.20.0·nice10·직렬 TAP으로 시작했습니다. `/tmp/hwpjs-owner-native-proof.MXzTXm/clean-ui-full-hwp5-wrapper-retry.jsonl`의 start는7,101개 비Markdown 소스/fixture·참조 inventory·WASM·wrapper 입력과 manifest SHA256 `813258622a1120b35ca4825eb8b758b6ebfb75a365fe8f9226c058e0bf7fd8d4`를 고정합니다. 로그는 `clean-ui-full-hwp5.log/.stderr`이며 종료와 입력 전후 대조까지 전체 gate 완료로 계수하지 않습니다. 최초 사전 검사는 폴더를hwp5로만 제한한 목록 추출이 정규 등록의 공통 HWPX UI1파일을 빠뜨려104/105에서 중단된 도구 준비 오류였습니다. 테스트를 실행하거나 범위를104개로 줄이지 않고 정규105개 전체를 포함해 재시도했습니다.


별도 UI 사본의 실제 브라우저4모드(리본/메뉴/검색/키보드)는 각각 양 형식×양 종류4경로, 총16경로를 직렬로 완료했습니다.0619 후보·각 실행 source/artifact 전후 대조·독립 저장/이력/재업로드·exit0·stderr0이며 `clean-ui-{ribbon,menu,search,keyboard}-browser.log/.stderr`에 있습니다. 로그 SHA256은 순서대로 `b1c76f3455ba57a168eca9ed260185891509777d1d532e705dfffdd026f76903`, `81a9a1a968af606d007cb43ba8c8eb76fb9ac946d6b13204e73b2afcd197f803`, `6be62db4fc2020ef075860cd33e61052c38a5f596ec6ca43d4f8c902442c7307`, `ef688a12668ed27bdaf35c4e2296f83969a87c08b6d686b4afb1c584dab1c85e`입니다. agent-browser 스킬로 소유4세션의 inactive/pid=null과58879 listener 부재를 확인했고 리본 PNG도 직접 확인했습니다. 같은 사본15파일 UI 회귀 `clean-ui-combined.log/.stderr`는308/308·fail/cancel/skip0·exit0·stderr0(SHA256 `fc0059e9a90c576d31f4746799e77f60c6016731189638d0243be35730d5f442`)입니다. 전체 native·전체 fixture UI/조판·기본 WASM 승격의 증거로 확대하지 않습니다.


리본 추가 후 기존 Canvas·쪽/단 메뉴·인자·단축키·메뉴 registry/disclosure/keyboard/mnemonic/popup/wiring·리본·검색15파일의 `flow-ribbon-combined.log/.stderr`는308/308·fail/cancel/skip0·exit0·stderr0입니다.0619 후보를 명시한 primary UI 회귀이며 publication 동결 소스의 전체 gate와 합산하지 않습니다.

리본 연결 단위 회귀9/9와 인자 guard5/5·skip0을 확인했습니다. `flow-ribbon-browser.log/.stderr`는0619 후보의 양 형식×양 종류4경로·실제 삽입 탭/버튼 클릭·신뢰된 이벤트·정확한 단일 Worker split·1→2측정페이지·이력·독립 저장·다운로드/재업로드·source/artifact 전후 동일·exit0·stderr0입니다. SHA256은 `9360ef18209aded33072cf8b3266a2bff703648cea7e26409d253650145c6b91`입니다. PNG를 직접 확인하고 agent-browser 스킬로 소유 `hwpjs-flow-ribbon-35c54947528a`의 inactive/pid=null과58879 listener 부재를 확인했습니다. 기본 WASM은 교체하지 않았으며 전체 fixture·OS IME·원본 조판 검증과 구분합니다.

명령 검색 실제 Chromium 왕복 `menu-search-browser.log/.stderr`는0619 후보에서 양 형식×쪽/단4경로·exit0·stderr0으로 완료했습니다. Ctrl+Shift+P·한국어 검색 입력·유일하고 활성인 결과·신뢰된 Enter·단일 split의 정확 좌표·1→2측정페이지·undo/redo·다운로드·독립 Section/XML/ZIP·재업로드를 검사했습니다. SHA256은 `6afba16ba3f653389ede050e58aeb92bc112b180676b9d5c494ec54d6deb56b4`입니다. `hwpx-column-search.png`를 직접 확인했고 agent-browser 스킬에 따라 소유 `hwpjs-flow-search-35c54947528a`의 inactive/pid=null과58879 listener 부재를 확인했습니다. 인자 guard도 새 검색 진입점을 포함해4/4·skip0입니다. 이전 메뉴/키보드4경로씩은 변경 전 공통 도구의 결과이며 이번 검색 실행으로 그 둘의 재실행을 소급하지 않습니다. 실제 OS IME/조판 동치·전체 fixture/UI 완료는 별도입니다.

문서 교체 수명 회귀를 추가한 `menu-lifetime-regression.log/.stderr`는 메뉴24·검색6·인자3의33/33·fail/cancel/skip0·exit0·stderr0입니다. SHA256은 `c15ec3f3f6c775e00aea60c4214cfdbeba44781ee0d402f79709a8ea47baa400`입니다. 열린 registry를 유지한 채 HWP5/HWPX로 재로드하고 enable해도 옛 선택이 복원되지 않고, 양 메뉴가 거부되며 새 파일/빈 이력이 보존되는지 확인했습니다. 새 선택 후에는 정상 실행됩니다. 실제 OS 파일 선택 이벤트의 대체가 아닌 Worker/Canvas 상태 전환 검사입니다.

로그는 `/tmp/hwpjs-owner-native-proof.MXzTXm`에 있습니다. 처음 모사 Window에 event API가 없어 실패한 것은 검사 기반 문제로 보존했고, 공통 Worker/Canvas harness의 Window를 EventTarget으로 맞췄습니다. native/메뉴 코어의 거부를 무시하도록 바꾸지 않았습니다.

- `menu-regression.log/.stderr`: 실제 Worker/WASM을 포함한 메뉴6경로와 기존 Canvas·메뉴/키보드/registry9파일268/268·fail/cancel/skip0·exit0·stderr0. SHA256 `6d5e31b70f308cd2ad993ca979dc3cb061441573218a8f5fb2067b937b2d51ca`.
- `menu-unit-final.log/.stderr`: 메뉴6·브라우저 인자/모드 guard3, 총9/9·fail/cancel/skip0·exit0. 잘못된 kind·조합·ABI 부재·close·중첩 header·단일 이력·독립 Section/XML/ZIP 보존을 검사합니다. SHA256 `2667a3b0a1e4b5dbc91260cc91d03188a9321f83e76163d5e2a232ae665fa2f1`.
- `menu-command-search.log/.stderr`: 기존 검색 위임·늦은 disabled·IME/Escape·비동기 registry 회귀4/4·fail/cancel/skip0·exit0입니다. 새 메뉴의 실제 검색 입력 브라우저 검사를 대신하지 않습니다.
- `menu-search-worker-regression.log/.stderr`: 실제 메뉴 registry를 연결한 쪽/단 검색 위임2경로를 추가해 기존 검색4·Worker/Canvas 메뉴6·브라우저 인자3을 직렬 재검사했습니다.15/15·fail/cancel/skip0·exit0·stderr0이며 SHA256은 `9311db4d329cf6412062d93e1e301a331e0891ca8b846bd199fa7cdb284cf88a`입니다. 검색 결과의 단일 실행·대기 중 재실행 차단·registry 종료 뒤 거부를 검사합니다. 모사 DOM 검색 통합이며 실제 브라우저 검색 입력/전체 fixture 완료로 확대하지 않습니다.
- `menu-selection-retry.log/.stderr`: HWP5 실제 charshape의 중간 caret `[1,1)`과 선택 삭제 `[1,3)`·`[0,2)`를 양 종류 메뉴로 실행하는6경로를 추가했습니다. 기존6개와12/12·fail/cancel/skip0·exit0·stderr0, SHA256 `a5a6dadb87b48f511ca6693689790c5b3bd22d91fdbb6edb2fe7a045973f2d06`입니다. 정확 Worker 좌표·독립 전체 Section/비대상 stream/metadata·단일 undo·동일 redo·재열기 저장을 확인했습니다. 첫6실패는 재로드 후 editor enable 없이 save를 호출한 새 검사 오류였고 원래 로그를 보존했습니다. 제품 코드를 바꿔 우회하지 않았습니다. HWPX 비영점 선택·서로게이트·전체 fixture 조합 검증은 이 결과의 범위가 아닙니다.
- 후속 `menu-both-selection.log/.stderr`는 양 형식×양 종류×4좌표(`[1,1)`·`[1,3)`·`[0,2)`·`[2,4)`)16경로와 기존6개를22/22·fail/cancel/skip0·exit0·stderr0으로 완료했습니다. SHA256은 `70466367f0496b8a886cfb63d41373643b491409d08180eaa731c73e97090763`입니다. HWPX는 두 서식 run의 경계를 가로지르는 선택을 포함합니다. 새 `tools/hwpx-flow-selection-oracle.py`는 공통 package expectation과 기존 scalar-style signature를 재사용하며 원문 텍스트/문단 topology를 고정하고 양쪽 문자·서식·문단 속성·새 ID·쪽/단 값·줄 geometry 제거·비대상 XML/ZIP을 검사합니다. normal/-O 모두 정상 저장을 허용하고 반대 종류 기대값을 거부했습니다. 이는 plain styled charshape 선택의 의미/보존 검사이며 모든 run 분할 직렬화가 바이트 동일하거나 중첩 개체·서로게이트·전체 fixture가 검증됐다는 뜻은 아닙니다. 동결 publication/native 입력은 바꾸지 않았습니다.
- `menu-browser-final.log/.stderr`: 실제 Chromium에서 양 형식×쪽/단4경로, 신뢰된 메뉴 클릭·정확한 Worker 좌표·1→2측정페이지·이력·독립 Section/XML/ZIP·다운로드 재업로드·선택 UI/도구 source와 HTTP WASM hash를 검사했습니다. exit0·stderr0·cleanup 성공, SHA256 `8428433b7d986f44c341d93ff4d7db0d30ceb022b21444554c86f7a7cc3da453`.
- `menu-keyboard-regression.log/.stderr`: 같은 공통 도구의 기존 신뢰된 Ctrl+Enter/Ctrl+Shift+Enter4경로도exit0·stderr0·cleanup 성공입니다. SHA256 `a19387360a937929ca49df9730e954f2fa8a0adcd85c83f9431ac2ddd1030de6`.

메뉴를 연 HWP5-page/HWPX-column PNG를 직접 확인했습니다. agent-browser 스킬로 `hwpjs-flow-menu-35c54947528a`와 `hwpjs-flow-break-35c54947528a`의 소유 세션·58879 전용 서버를 종료했습니다. 전체 fixture UI·원본 한글 조판·물리 IME·실제 Cmd 키의 동치 검사는 아닙니다. 이번0619 후보의 전체 SHA256은 `0619a0fea08941e6bd1548bb93ef4292d3328fbcf01e5b34dc912fdd974d27ca`입니다.
