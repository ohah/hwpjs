# 참조 HWP5 표의 숫자 입력과 SUM

## 실제 원본과 범위

전체 참조 입력 감사에서 `reference/rhwp/samples/143E433F503322BD33.hwp`는50문단 중38개 문자 prefix가 통과하고12개는 `InvalidFormulaNumber`로 거부됐습니다. 원본 SHA256은 `1bcdc7a2de38680cdb715556f40c8477f8242131d28de949b09e945022bf35fa`입니다. 거부를 파서 오류나 임의 문자 편집 성공으로 바꾸지 않습니다.

기존 독립 CFB.js·raw DEFLATE·레코드/셀 주소 검사기에서0기반 문단18/19/20/23/24/25/28/29/30/33/34/35가 SUM의 숫자 의존 입력임을 확인했습니다. 실제 명령은 `SUM(?2:?5)` 세 개이며 캐시는4,319/500/516입니다. native 거부 목록으로 독립 기대 inventory를 만들지 않습니다.

`numeric-formula-corpus.test.mjs`에 참조 원본 두 규모 회귀를 추가했습니다. 각12입력을500계열·1,000,000계열 값으로 별도 원본 세션에서 치환합니다. 세 SUM의 독립 산술·명령 캐시/표시값, 전체 stream inventory·비대상 stream bytes, 거부 뒤 저장 불변·undo/redo·거부 뒤 redo 유지·저장본 재열기/텍스트·무변경 재저장 bytes·원본/후보 불변을 확인합니다. 기존48입력/13수식 회귀도 유지하며 한 수식 평가를 새 문서 성공 수로 합산하지 않습니다.

## 실측과 제한

e9aa1141 제품 소스의 분리 사본 `/tmp/hwpjs-field-interior-browser.DVJV5s`에서 기존 숫자 검사 파일은 바꾸지 않고 새 테스트 내용의 별도 사본 `tests/hwp5/numeric-formula-reference-final.test.mjs`를 실행했습니다. WASM SHA256은 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`, Node24.20.0·nice10입니다. `numeric-reference-final.log/.stderr`는5/5·fail/cancel/skip/todo0·exit0·stderr0(805.439334ms)이며 로그 SHA256은 `c2a2904e43dd570e526137109d2dc4ec1a13bb54baf0765a2ecb18cbd154c7d4`입니다. 기존 등록 파일에 추가하므로 build 등록을 중복하지 않습니다.

초기 `numeric-reference-current.log/.stderr`는3pass/2fail·exit1입니다. 실패는 재열기 후 전체 save 객체를 비교해 세션 로컬 `layoutRequiresReflow`까지 같다고 가정한 검사 오류였습니다. 최종 검사는 편집 세션의true와 새 무변경 세션의false를 각각 명시하고 저장 bytes를 대조합니다. 이false는 재조판이나 한글 페이지 동치의 증거가 아닙니다. 기본 저장의 명시적 stale-layout 동의 계약을 완화하지 않았으며 기본 WASM·외부 데모도 변경하지 않았습니다. 실제 브라우저 숫자 입력/전체 최신 gate/전체 명령과 원본 조판은 별도입니다.
