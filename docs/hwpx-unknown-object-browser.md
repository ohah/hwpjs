# unknownObj 바깥 텍스트의 실제 브라우저 검증

## 책임 분리

`tools/browser/document-menu-roundtrip.mjs`가 실제 입력·메뉴U/R/S·다운로드·독립 oracle·재업로드·소유 세션/서버 종료를 공통으로 소유합니다. `document-menu-cases.mjs`는 문서·좌표·목격값·oracle·포트만 소유하며 공개 두 실행기는 각각 plain/unknown-object를 선택합니다. 별도 편집 명령·앱 상태·fixture별 상호작용 복사본을 추가하지 않습니다. 잘못된 case/prototype 이름·추가 CLI·암묵 기본 WASM을 브라우저 시작 전에 거부합니다.

## 2026-10-18 실측

`34b8a8e6`의 JS/web을 동결한 `/tmp/hwpjs-unknown-browser-current.baYCgo`에서 도구 분리만 적용했습니다. 원본은 [보호 앵커 계약](hwpx-unknown-object-anchors.md)의 cgmp_evaluation_table.hwpx 문단932이며 WASM SHA256은 `eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f`입니다. HTTP로 제공된 WASM 해시도 일치합니다. 기본 산출물/외부 데모는 교체하지 않았습니다.

최종 `unknown-browser-delete-history.jsonl/.stderr`는 exit0·stderr0·verified=true·cleanup=true입니다. 실제 검색 선택에서 키보드로 커서를 접고, 첫 표 다음의 unknownObj 위치1에서 Delete를 입력했습니다. 실제 Worker 요청은 section0/paragraph931/start1/end2이며 ProtectedInlineControl로 거부됐습니다. 입력값은 보호 앵커6개 그대로이고 실제 메뉴U의 응답도 changed=false/revision0여서 빈 이력을 확인했습니다.

이어 신뢰된 beforeinput/input으로 `브라우저보존개체😀<&`를 입력하고 실제 U→원문·R→편집문·S→저장 요청을 확인했습니다. 거부를 포함한 splice 요청2회, 빈 이력 확인을 포함한 undo2회, redo/save 각1회입니다. 메뉴 다운로드 파일은 독립 normal/-O 전체 XML/비대상 ZIP 비교를 통과했고 틀린 prefix 기대값은 정확히 exit1·complete XML mismatch로 거부됐습니다. 실제 파일 입력으로 재업로드·편집 시작·편집문 찾기를 확인하고 reopened.png를 직접 확인했습니다. 개체 여섯 개는 보호 표식이며 unknownObj 자체의 그리기나 한글 조판 동치를 보여주는 것은 아닙니다.

출력은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-unknown-browser-Y0tZUo`입니다. 원본 SHA256은 `0f03119d6ac3e19f74fc9fcec5315ac6ed436bab5abffd0804e9cf3350dd747a`, 다운로드는 `42b310d57daa65eb0d03103afd9a39d40c9b45fa49748b96c5c3e492c9d3c4f0`입니다. 고정 원본의 unknownObj 태그 raw slice4개도 저장 파일과 순서대로 byte-exact였습니다. 각 SHA256은73a02c54…959310de/272fa124…17d2008/2b6e609d…48ede5/495b1924…87b7cc입니다. 이 추가 고정-fixture 비교를 일반 XML raw 추출기나 전체 ZIP 메타데이터 동일성으로 확대하지 않습니다.

최초 Delete 추가 전 실행도 성공했습니다. 뒤의 `unknown-browser-delete.jsonl`은 빈 이력에서 취소 버튼 disabled=true를 기대한 하네스 단언으로 실패했고 cleanup=true입니다. 실제 history-controls는 준비 상태로 버튼 활성화를 정하므로 이 기대를 제품 이력 결함으로 분류하지 않았습니다. 위 최종 실행은 버튼 상태 추측 대신 실제 undo 응답을 검사하며 실패와 합산하지 않습니다.

같은 최종 공통 소스로 plain 사례도 기존 기본 WASM `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`에서 다시 통과했습니다(`plain-final-default-browser.jsonl/.stderr`,exit0·stderr0·verified/cleanup=true). 출력은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-menu-browser-4m5Miq`이고 기존 저장 SHA256 ee2e1133…0f7c1b와 같습니다. 후보 unknown 검사와 합산하지 않습니다. 최종 공통 흐름/설정의 SHA256은 각각60d93fbd…8e465fb/ae21b130…98cf9ba이며 전체 UI/tool/oracle 해시는 각 JSONL에 기록했고 실행 전후 불변입니다.

두 세션 hwpjs-unknown-anchor-8b5e368cca5f/hwpjs-menu-mnemonic-8b5e368cca5f는 종료 후 별도 조회에서도 active=false·pid/runtime=null이며58863/58864 listener가 없습니다. agent-browser 스킬의 실제 입력·클릭 도달·준비 대기·소유 세션 종료 절차를 사용했습니다. 관측기는 명령을 실행하거나 편집 상태를 설치하지 않습니다.

실행은 소스 루트에서 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/unknown-object-browser-audit.mjs`입니다. 기존 plain 실행 명령은 유지합니다. 메뉴 관련10파일31개 회귀는 `node --test tests/hwpx/document-menu*.test.mjs`이며 실제 브라우저나 전체 fixture/gate의 대체가 아닙니다.
