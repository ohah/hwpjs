# HWPX 숫자 수식의 정확한 문자열 검사

기존 `hwpx-numeric-arithmetic-oracle.py`는 수치 관계를 Decimal로 대조하되 출력 반올림에 대해 상대 허용 오차0.00001을 사용합니다. 이 결과만으로 저장 결과 문자열이 동일하다고 주장하지 않습니다.

별도 `hwpx-numeric-exact-oracle.py`는 기존 원문/수치/필드 identity 검사를 유지하고, 관측 `%g,`·`%.2f,` 출력의 LastResult와 실제 문단 표시를 Python 독립 포맷의 문자열과 정확히 비교합니다. 미지 ResultFormat은 거부하며 허용 오차로 fallback하지 않습니다. chart 픽스쳐의48숫자 입력을0으로 바꾼13수식만 대상으로 하며 모든 수식/부동소수 반올림/문서 의미의 증거가 아닙니다.

## 2026-10-10 재검증

깨끗한 통합 소스 tree의 ReleaseSafe WASM SHA256 `0942a2c1e40692d02c3500aa58f13399041049b314b92a5e02950755ae8acb63`로 `tests/hwpx/numeric-exact-corpus.test.mjs`가1/1·skip0·exit0입니다.48입력 각각의13결과를 Python 일반/-O 모드에서 검사했습니다. 첫 입력의 결과 캐시·표시·command를 모두0.000001 증가시킨 부정 대조는 기존 허용 오차 검사가 통과하는 것을 먼저 확인한 뒤, 정확 비교가 `exact result spelling mismatch`로 거부하는지 확인했습니다. timeout·실행 실패를 거부 성공으로 세지 않습니다.

```sh
HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/numeric-exact-corpus.test.mjs
```

같은 후보의 기존 숫자 입력·수식 정의·Worker 검사는3파일4/4이며, 정의13개와 입력48개의 저장/이력을 다룹니다. 이전 `deb854e3` 후보의 전체 공개 회귀와 합산하지 않습니다. 전체 공개574파일 검사는 별도 실행 중이며 새 정확 비교 파일은 그 시작 때 선택한 목록에 포함되지 않습니다. 기본 데모 WASM 교체와 전체 조판 완료도 아닙니다.
