# 여러 표의 SUM·ABOVE 숫자 입력

## 원본과 검증 범위

대상은 참조 `issue3637/regulatory_impact_nested_table_escape.hwpx`이며 SHA256은 `e7b147f7cea66c97bed79085a3d89c2656037e0f711232f659ed3c7344984f62`입니다. 원본55개 표 중37/39/48번 표에 수식이 하나씩 있습니다(표 번호는0기반). 앞뒤의 `SUM(B?:G?)` 입력6개씩과 가운데 `SUM(ABOVE)` 입력10개, 총22곳을 검사합니다. 서로 다른 표의 같은 주소를 하나의 입력으로 합치지 않습니다.

ABOVE 결과 셀은 `(6,11)`이며 위의 숫자 행1~10만 더합니다. 행0은 두 문단의 비숫자 머리글이고, 결과 아래 행12의 `2.48`은 피연산자가 아닙니다. 이 관측을 다른 모든 방향/병합 수식의 일반 규칙으로 확대하지 않습니다. [수동 결과 편집](hwpx-manual-result-reference-audit.md)의 표시 변경과도 별도 경로입니다.

## 책임과 실패 대조

`tools/hwpx-nested-sum-input-oracle.py`는 고정 원본의 표 소속·셀 주소·단일 숫자 leaf를 독립 XML에서 선택하고 Decimal로 계산합니다. 정수/소수 출력 포맷·필드 결과 leaf 선택·전체 XML signature는 기존 독립 oracle을 재사용합니다. 제품 parser/evaluator나 저장본에서 기대 피연산자를 가져오지 않습니다.

기대 변경은 선택 입력과 해당 표의 결과 LastResult/Command/dirty/표시뿐입니다. 다른 두 수식·전체 section XML·다른 ZIP payload·항목 순서/CRC/comment·일곱 metadata 필드를 대조합니다. 각 표의 첫 입력에서 정상 재직렬화 대조 후 입력/결과/다른 표/캐시/명령/dirty/결과 아래 값/다른 payload/metadata의9종 변조를 거부합니다.

`tests/hwpx/nested-sum-input-corpus.test.mjs`는 원본부터22입력을 각각1로 치환하고 normal/-O oracle·독립 입력과 native snapshot 일치·undo/redo·잘못된 숫자 거부 시 revision/원본/redo 보존·저장 재열기·원본/후보 불변과 `[6,10,6]` 분모를 확인합니다. 세 표 각각에서 다른 표의 유효 문단/Boolean 문단/결과 아래 비대상 문단/범위 밖 치환/다른 원본 요청도 정확한 오류·status1/signal=null로 거부해야 합니다. timeout이나 임의 crash를 올바른 거부로 세지 않습니다.

추가로 머리글 두 문단891/892와 결과 아래 문단979는 일반 문자·이모지 prefix를 허용해야 합니다. 기존 독립 전체 section/비대상 payload oracle로 세 수식이 그대로인지 확인하고 각 경계의 undo/redo/재열기도 검사합니다. 숫자 입력 보호를 표 전체로 넓혀 안전하게 거부하는 것만으로 통과하지 않습니다.

## 검증 기록

명시적 후보 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`로 실제22입력의 저장 성공을 먼저 관측했습니다. 이어 `/tmp/hwpjs-native-postfix-main.33GojG/nested-numeric-first.log/.stderr`의 최초 독립 회귀는1/1·fail/cancel/skip0·exit0·stderr0(74265ms)입니다. 단순 저장 성공과 독립 XML 검증 결과를 구분합니다.

tree `d4bc0636fa8ba09ca7724e05351056ab8d54b391`의 분리 사본 `/tmp/hwpjs-nested-sum-clean.rCzmZb`에서 반례 오류 문구까지 강제한22입력과 기존 연쇄28/병합15입력 세 회귀를 직렬 실행했습니다. `numeric-three-final.log/.stderr`는3/3·fail/cancel/skip/todo0·exit0·stderr0(190610ms)입니다. 이 사본에는 이후 추가한 머리글/결과 아래 일반 입력 세 경계가 아직 없습니다. 그 최종 추가 경계는 별도 사본으로 검증하며 이전 결과에 소급하지 않습니다.

최종 테스트 코드·독립 oracle·선택 build는 tree `a12b4386161e52236a92bfceca9ca5d87e134ef5`의 `/tmp/hwpjs-nested-boundary-clean.GDb80b`에 분리했습니다. 선택 build의 fmt --check·build --help와 JS 구문 검사가 exit0이며, 등록은 HWPX109파일(중복0)·별도 WASM export1파일입니다. 사용자 build/명령 문서 수정은 제외하고 HEAD에 새 등록 한 줄과 명령 한 문단만 추가합니다. 기존 동결108파일 gate나 다른 실행 결과를 최신110파일 전체 성공으로 합산하지 않으며 전체 편집/실제 브라우저/OS 입력/원본 조판·기본 승격은 별도입니다.

같은 최종 사본의 `nested-boundary-final.log/.stderr`는22숫자 입력과 일반 입력3경계를 포함해1/1·fail/cancel/skip/todo0·exit0·stderr0(82381ms)입니다. 실행 종료 후 사본의 추적7,201개 blob과 원본 Git tree를 전수 대조하고 최종 테스트/oracle이 작업 트리와 바이트 일치함을 재확인했습니다. 숫자/ABOVE 기능을 새로 허용하는 제품 코드는 바꾸지 않았으며, 기존 구현의 실제 원본 검증 공백을 줄인 결과입니다.
