# 연쇄 SUM 숫자 입력의 독립 검증

## 원본과 경계

대상은 참조 `issue5543_carried_anchor_ladder.hwpx`이며 SHA256은 `6adca8d39bdcf51e8791d8afa1e584b9570eb8b15df901e74ce61cfd500cdb4a`입니다. 원본의14개 SUM은7행에서 `B:D → E`, `E:F → G`로 연결됩니다. 숫자 입력28곳 중21곳은 직접/후속 결과 둘을, 나머지7곳은 결과 하나를 바꿉니다. 병합 머리글은 계산 입력이 아니며 변경하지 않습니다.

일반 문자 prefix가 InvalidFormulaNumber로 거부된28곳을 읽기 전용으로 취급하지 않고 유효한 숫자로 별도 검사합니다. [수동 결과14곳](hwpx-manual-result-reference-audit.md)의 표시 전용 편집과도 다른 경로입니다. 임의 수식·병합 셀 집계·방향 집계·실수 반올림 전체를 다루는 한글 계산 엔진은 아닙니다.

## 책임과 SSOT

`tools/hwpx-cascaded-sum-input-oracle.py`는 정확한 원본 바이트·14개 정의/결과 주소·28개 단일 입력 셀을 확인합니다. 원래 cache/Command/표시값을 먼저 Decimal 계산과 대조한 뒤 의존 그래프를 재평가합니다. 원본에 없는 입력이나 순환/누락 의존값은 추측하지 않습니다. 새 제품 수식 파서를 만들지 않고 기존 독립 reference parser·정수 출력 포맷·필드 결과 선택·XML signature를 재사용합니다.

기대 출력은 선택한 입력 hp:t와 실제로 바뀐 직접/후속 SUM의 LastResult/Command/dirty/표시만 수정합니다. 전체 section XML signature·ZIP 목록/CRC/comment·메타데이터·비대상 payload를 대조합니다. 같은 숫자처럼 보인다는 이유로 다른 문단/스타일/병합 구조 변경을 정규화하지 않습니다.

`tests/hwpx/cascaded-sum-input-corpus.test.mjs`는 독립 inventory를 native paragraph snapshot과 대조하고 원본부터 각 입력을 편집합니다. normal/-O 양쪽 oracle·undo·잘못된 문자 입력의 거부/revision/redo 보존·redo·저장 재열기·원본 파일/후보 버퍼/후보 파일 불변을 검사합니다. 결과 변화의 분모21/7도 강제합니다.

첫 입력은 정상 재직렬화 ZIP이 통과함을 확인한 뒤 입력·직접 결과·후속 결과·cache·Command·dirty·다른 payload·ZIP 메타데이터8종 변조를 거부합니다. 다른 유효 문단·Boolean 문단 번호·범위 밖 치환값·다른 원본 바이트 네 요청도 status1/signal=null과 정확한 오류로 거부해야 합니다. timeout이나 임의 프로세스 실패를 올바른 거부로 세지 않습니다.

## 검증 기록

새 후보 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`의 최초 실제28입력 검사는1/1·fail/cancel/skip0·exit0입니다(`/tmp/hwpjs-native-postfix-main.33GojG/ladder-numeric-first.log/.stderr`,28290ms). 제품 파서/편집 허용 코드를 바꾼 결과가 아니라 기존 숫자/연쇄 재계산 경로의 독립 증거를 보강한 것입니다.

tree `6d99dc21c83b4d8a027832267b6923d65fba8440`의 분리 사본 `/tmp/hwpjs-cascaded-clean.KFXqfo`에서 잘못된 요청 반례까지 포함한 새 회귀와 기존 병합 SUM15입력 회귀는2/2·exit0·stderr0입니다(`cascaded-and-merged-tests.log/.stderr`,114215ms). 이후 후보 버퍼/파일 해시 확인을 추가한 최종 `cascaded-and-merged-final.log/.stderr`도2/2·fail/cancel/skip0·exit0·stderr0(114605ms)입니다. 최종 새 회귀는28입력 전체와21/7분모·양 Python 모드의8변조/4잘못된 요청을 포함합니다. 여러 실행의 좌표/성공 수를 합산하지 않습니다.

최종 등록/검사/독립 oracle 세 코드 파일이 커밋용 tree `4bc1bb65e99189497d8b1cb2a6cbf3416763758e`와 바이트 일치함을 확인했습니다. 선택한 build의 fmt --check·build --help(exit0/stderr0)와 JS 구문·diff 검사도 통과했습니다. 기존 사용자 build/명령 문서 수정은 제외하고 HEAD에 이번 등록 한 줄과 명령 한 문단만 더했습니다.

기존 merged-SUM 회귀 옆에 한 번 등록하며 현재 실행 중인 이전108파일 gate에는 새 파일이 포함되지 않습니다. 별도 집중 통과를 최신109파일 전체 gate 성공으로 합산하지 않습니다. 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다. 실제 브라우저·OS 입력·원본 조판·모든 편집 명령·기본 WASM 승격은 별도입니다.
