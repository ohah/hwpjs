# SUM(BELOW) 실제 숫자 입력

## 원본과 경계

참조 `issue6298/copay_cap_tac_table_leading.hwpx`의 SHA256은 `fa00fae4aec5f80175898734ea4d06b82f4c80df7e32b69a7370328c770ab60f`입니다. 원본20개 표 중4/14/15번에 BELOW 수식5개가 있고 각각8/10/10/11/11개, 총50개 숫자 입력이 연결됩니다(표 번호0기반). 각 결과는2번 행이고 그 아래 행부터 해당 표의 마지막 행까지 집계합니다. 다른 표·다른 열의 같은 주소를 섞지 않습니다.

뒤의42개 입력 셀은 숫자와 괄호 비율 설명이 두 문단으로 나뉩니다. 첫 문단만 계산하고 설명은 그대로 보존합니다. 원본 첫 수식의 캐시는184.9이지만 필드 내부 표시 leaf는100이며, fieldEnd 뒤에 독립 텍스트 `.0`이 있습니다. 이 차이를 손상으로 단정하거나 원본을 자동 정리하지 않습니다. 숫자를 편집하면 해당 수식의 표시·캐시·명령만 재계산하고 필드 밖 `.0`은 유지해야 합니다. 다른 네 수식의 원본 표시는 캐시와 일치합니다.

## 독립 검증과 SSOT

`tools/hwpx-below-sum-input-oracle.py`는 고정 원본 XML에서 표·열·행·첫 문단·설명 소속을 선택하고 Decimal 합계를 계산합니다. 원래 다섯 캐시/명령을 먼저 검증합니다. 관측된2백만 미만의 정수 합계는 쉼표로 구분해 모든 자릿수를 보존하고, 작은 소수는 기존 독립 숫자 formatter의 제한 범위를 재사용합니다. 제품 f64 formatter를 기대값으로 호출하거나 일반적인 모든 `%g` 규칙을 입증하는 것은 아닙니다.

전체 ZIP/XML 보존은 [공통 숫자 oracle 봉투](hwpx-numeric-oracle-envelope.md)의 단일 구현을 사용합니다. 필드 결과 leaf 선택과 XML signature도 기존 독립 oracle을 공유합니다. 수정 대상 입력과 그 수식의 LastResult/Command/dirty/표시 이외의 변경은 허용하지 않습니다.

`tests/hwpx/below-sum-input-corpus.test.mjs`는 원본부터50곳을 각각1로 바꾸고 normal/-O 독립 XML/ZIP·native snapshot 소속·undo·잘못된 숫자의 거부/revision/redo 보존·redo·재열기·원본/후보 불변과 `[8,10,10,11,11]` 분모를 검사합니다. 네 숫자 열의 비율 설명 한 곳씩에는 일반 문자·이모지 prefix를 넣어 수식이 그대로이고 이력·재열기가 유지됨도 확인합니다. 안전한 표 전체 거부로 통과하지 않습니다.

각 수식의 첫 입력에서 정상 재직렬화 대조 후 입력/결과/다른 수식/캐시/명령/dirty/필드 밖 suffix/설명/다른 payload/metadata의10변조를 정확한 오류로 거부합니다. 다른 수식의 유효 입력·Boolean 문단·설명 문단·범위 밖 치환·다른 원본 요청도 정확한 오류와 status1/signal=null이 필요합니다. timeout/crash를 올바른 거부로 세지 않습니다.

## 검증 기록

후보 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`의 최초 `/tmp/hwpjs-native-postfix-main.33GojG/below-numeric-first.log/.stderr`는50숫자 입력·설명4곳·반례·이력·재열기를 포함해1/1·fail/cancel/skip/todo0·exit0·stderr0(131577ms)입니다. 공통 봉투 분리 이전 결과이며 이후 최종 실행과 합산하지 않습니다.

tree `df6b0fc8ee8694c31b6962ea3b16620d47f5f7ca`의 분리 사본 `/tmp/hwpjs-below-sum-clean.insWP5`에서 같은 후보로 공통화된 네 원본 숫자 회귀와 봉투 normal/-O 회귀를 직렬 실행했습니다. `numeric-four-final.log/.stderr`는6/6·fail/cancel/skip/todo0·exit0·stderr0(329590ms)입니다. 네 원본은 각각 BELOW50/연쇄28/병합15/여러 표22입력을 검사하며, 이전 실행의 입력 수나 테스트 수와 합산하지 않습니다.

실행 종료 뒤 추적7,208개 blob이 선택 tree와 일치하고 최종8개 테스트/독립 oracle 코드 파일이 작업 트리와 바이트 일치함을 확인했습니다. 선택 build의 fmt --check·build --help·JS 구문 검사도 exit0이며, 등록은 HWPX111파일(중복0)과 WASM export1파일입니다. 사용자 build/명령 문서 변경은 제외하고 HEAD에 새 등록 두 줄과 명령 한 문단만 추가했습니다. 관련5문서의 내부16링크도 누락0입니다.

제품 parser/evaluator·편집 허용 정책을 바꾼 것이 아니라 실제 원본의 검증 공백과 oracle 규칙 중복을 줄였습니다. 기존 native/108파일 gate나 다른 후보 결과를 최신112파일 전체 gate 성공으로 합산하지 않으며 전체 문서 편집/실제 브라우저/원본 조판·기본 승격은 별도입니다. 기본 WASM과 외부 데모 서버는 변경하지 않았습니다.

## 연속 숫자 편집과 현재값 SSOT

`tests/hwpx/below-sum-sequence.test.mjs`는 두 입력을 원본으로 되돌리지 않고 순서대로 편집합니다. 같은 수식89/95, 같은 표의 다른 열548/550, 서로 다른 표의 같은 열548/710, 수동 표시 수식과 다른 표89/712의 네 쌍을 정방향/역방향으로 실행합니다. 여덟 경로이며50입력의 모든 쌍/임의 길이 편집을 전수 입증하지는 않습니다.

독립 oracle은 기존 원본/봉투/Decimal 규칙을 그대로 사용하고 `edits` 한두 개를 모든 계산 전에 반영한 뒤 영향받는 결과 집합을 한 번 평가합니다. 단일 입력 요청은 기존 모양을 계속 허용합니다. 단일/배열 요청의 혼합·중복/빈/세 개 이상 입력·잘못된 타입을 거부하고, 한 입력만 반영한 기대값으로 두 입력 저장본을 통과시키지 않습니다. 제품 계산기나 이전 편집 결과를 기대값으로 복사하지 않습니다.

각 단계의 전체 XML/ZIP normal/-O·중간 스냅샷별 undo/redo·거부 후 redo 보존·과거 분기에서 다시 편집할 때의 새 revision/redo 제거·두 입력의 재열기를 검사합니다. 최초9e75 후보의 `/tmp/hwpjs-native-postfix-main.33GojG/below-sequence-first.log/.stderr`는1/1·fail/cancel/skip/todo0·exit0·stderr0(46686ms)입니다.

tree `744fcb95bfb44575c2938c06b31c132c37a1f391`의 분리 사본 `/tmp/hwpjs-below-sequence-clean.HcaCcs`에서 확장한 oracle의 기존50입력·여덟 연속 경로·공통 봉투 normal/-O를 직렬 실행한 `below-sequence-final.log/.stderr`는4/4·fail/cancel/skip/todo0·exit0·stderr0(177920ms)입니다. 두 입력 중 하나를 누락한 기대값·중복/빈/세 개/Boolean/요청 모양 혼합의 여섯 요청 반례도 양 모드에서 정확한 오류/status1/signal=null로 거부했습니다.

종료 후 선택 소스의7,212개 blob과 최종 테스트/oracle의 바이트 일치를 확인했습니다. 선택 build의 fmt --check·build --help·JS 구문 검사와 새 회귀의 유일 등록(HWPX113파일·별도 WASM export1파일)도 통과했습니다. 사용자 build/명령 문서 변경은 제외하고 HEAD에 등록 한 줄과 명령 한 문단만 추가합니다. 제품 파서/수식/이력 구현을 바꾼 결과가 아니라 현재값/분기 결합 검증을 보강한 것입니다. 실행 중인 bd75e76b의113파일 gate에는 이 후속 회귀가 없으므로 최신114파일 전체 통과로 합산하지 않습니다.

## 실제 Canvas 왕복과 위치 편향 수정

픽스쳐 허용 목록의 `below-formula-reference.hwpx`는 위 원본 하나를 가리킵니다. `tools/below-sum-input-browser-audit.mjs`는 공유 메뉴 flow의 별도 사례로 문단89의30.1을 신뢰된 키보드 입력으로1로 치환합니다. 메뉴 실행 취소/재실행·저장·normal/-O 전체 XML/ZIP·다른 유효 숫자 문단95 반례·다운로드·실제 파일 선택 재업로드를 검사합니다. 변경 수식 ordinal은 정확히 `[0]`이어야 하며 필드 밖 `.0`도 보존합니다. 전체50곳의 브라우저 검사는 아닙니다.

최초 tree `7f49452c717d337a7c0b11b9e36c50ef66cc2e68`의 `/tmp/hwpjs-below-browser-clean.do4HkV/below-browser.jsonl`은 verified/cleanup true였지만 캡처를 보면 재업로드 후 선택이 기존 첫 열의1이었습니다. 독립 다운로드 XML 검사는 유효하나, 값만 같은 다른 셀로 재업로드 확인이 통과할 수 있어 이 실행을 편집 위치 보존 증거로 세지 않습니다. 초기 가드 실행의 누락 import도 고친 뒤34/34였으며 최종 가드와 합산하지 않습니다.

`tools/browser/numeric-target.mjs`는 값과 Canvas의0기반 section/paragraph/caret를 함께 확인합니다. 공유 flow는 최초 선택과 재업로드 모두 같은 판정을 사용하고, 결과에1기반 원본 문단과 실제 Canvas caret를 남깁니다. `document-menu-browser-target.test.mjs`는 같은1이 있는 다른 문단/다른 구역·다른 값·잘못된 caret/주소를 거부합니다. oracle 및 공통 ZIP/XML·숫자/필드 결과·원본 순회 의존 파일도 시작/종료 해시에 포함합니다.

최종 tree `ee9dad9e692405f75df2b39e8628e5061f5d2e4b`의 `/tmp/hwpjs-below-browser-target-clean.UDLqgQ`에서 `below-browser-target.jsonl/.stderr`는 exit0·stderr0·verified=true이며 `reopenedTarget={section:0,paragraph:89,canvasCaret:"0:88:1"}`입니다. 저장 SHA256은 `97d66cc9b002054c8f5899a3851b869d8150b7a853b55c4dc649536a2efb6084`입니다. 캡처/다운로드는 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-below-sum-browser-JL6VWP`에 보존합니다. 캡처도 수정한 비율 열의1이 선택됨을 확인했습니다. 같은 소스의 연쇄 SUM 왕복도 별도 통과했으며 상세는 [연쇄 기록](hwpx-cascaded-sum-input-corpus.md)을 따릅니다.

두 브라우저는 직렬 실행했고 cleanup.success=true·별도 session info의 active=false/pid=null·소유 포트58869/58868 종료를 확인했습니다. 스킬의 격리/실제 입력/캡처 검토/종료 확인을 적용했습니다. 최종 단위 가드는36/36·fail/cancel/skip/todo0·exit0·stderr0이며 등록/fmt --check/build --help/JS 구문 검사도 통과했습니다. 종료 후 선택 tree의7,211개 blob을 Git과 전수 재대조했습니다. 원본 조판·OS IME·외부 서버/기본 WASM 승격은 여전히 별도입니다.

## 기본 WASM과 후보의 차이

같은 최종 사본에서 기본 cbaa 후보를 문단89/548 두 숫자 입력으로 독립 대조한 `default-below-independent.jsonl/.stderr`는 양쪽 모두 status1/signal=null·Complete BELOW SUM XML mismatch입니다. 프로브 wrapper exit0은 이 verified=false를 수집한 결과이지 호환성 통과가 아닙니다. 첫 단순 API 저장 성공을 독립 검증 성공으로 세지 않습니다.

`default-below-diff-final.jsonl/.stderr`는 기본이7자리 원래 합계1,749,831을1.74983e+06으로 바꿔 비대상 수식에도 dirty=1을 게시함을 보여 줍니다. 문단548을1로 바꾼 합계는 후보의1,224,858과 달리 기본은1.22486e+06입니다. 후보9e75는 대상만 수정하고 다른 수식의 원문/dirty를 유지합니다. 수정 정책은 이미 main의 `a2fb33f7`·`src/hwpx/formula_output.zig`에 있으며, 사용자 미커밋 공통 formatter 변경을 끌어오지 않았습니다. 기본/외부 데모 산출물 교체는 아직 하지 않았습니다. 최초 `default-below-diff.stderr`의 Buffer.trim 오류는 임시 진단 도구 오류로 보존하고, encoding을 명시한 최종 진단 exit0/stderr0과 구분합니다.
