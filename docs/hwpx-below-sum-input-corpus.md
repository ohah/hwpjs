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
