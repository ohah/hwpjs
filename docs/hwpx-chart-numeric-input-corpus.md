# 차트 예제의 숫자 입력 48곳

## 대상과 독립 기대값

대상은 `legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx` 원본 SHA25685699a2e906525f4118c8dcc3f426f7896ae1dd9fa39b3ee2ef790d6b04abdde입니다. [일반 본문 감사](hwpx-plain-prefix-verification.md)의 문자 prefix가 거부된48좌표와, 독립 XML 수식 inventory에서 선택한 결과 셀 이외의48숫자 입력이 정확히 같음을 대조했습니다. 거부를 읽기 전용이나 지원 성공으로 세지 않고 유효 숫자 변경을 따로 검사합니다.

`tests/hwpx/chart-numeric-input-corpus.test.mjs`는 제품 좌표 목록이 아니라 기존 Python `hwpx-formula-fixture-oracle.py --structure-inventory`의 입력 셀 소속을 사용합니다. 각 원본 문단의 텍스트를 native 조회와 대조한 뒤 전체 숫자를1로 치환합니다.48곳 모두 원래 값이1이 아니므로 no-op이 아닙니다. 매 사례는 원본을 새로 열어 이전 편집이 다음 기대값에 섞이지 않도록 합니다.

`hwpx-chart-numeric-input-oracle.py`는 원본 바이트와 관측13개 수식 inventory를 확인합니다. source XML의 셀 주소·범위를 기존 독립 reference parser로 해석하고 Decimal로 SUM/AVG를 계산합니다. 관측된 `%g,`·`%.2f,` 범위만 기대값으로 만들며 제품의 f64 formatter나 저장기를 호출하지 않습니다. 다른 수식·일반적인 한글 계산 규칙까지 입증하는 엔진은 아닙니다.

기대 XML은 입력 hp:t와 그 입력에 의존하는 정확히 한 필드의 표시 결과·LastResult·Command 캐시·dirty만 변경합니다. 전체 XML 서명과 ZIP 목록/CRC/comment·비대상 payload를 대조하고, 저장본의13개 계산식 캐시/표시값도 독립 산술과 다시 비교합니다. ZIP의 모든 메타데이터나 임의 편집 모드의 검증으로 확대하지 않습니다.

## 검사 범위

후보2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c에서 실제48입력의 변경·독립 비교(normal/-O)·원본 undo·저장 redo·저장본 재열기/재저장 동일성을 검사합니다.13개 식은 SUM10/AVG3이며,48입력은 SUM36/AVG12입니다. 모든 문단/원본 파일의 바이트를 덮어쓰지 않습니다.

첫 대상의 oracle 자체 검사에서는 재직렬화한 정상 ZIP도 먼저 통과해야 합니다. 이후 입력·표시 결과·LastResult·Command·dirty·다른 텍스트·다른 part·ZIP comment를 각각 변조한8종을 일반/-O 모두 거부해야 합니다. Python assert에 의존하지 않으므로 최적화 모드에서도 이 검사를 유지합니다.

임시 진단 `chart-numeric-probe.jsonl/.stderr`는48/48·exit0·stderr0입니다. 이 결과를 전제로 만든 공개 회귀도 `chart-numeric-corpus-resource-safe.log`에서1/1·fail/skip/cancel0·exit0(23,049.83ms)이었습니다. 원본 바이트 pin을 추가한 최종 코드는 `chart-numeric-corpus-pinned.log`에서1/1·같은 오류0·exit0(23,255.22ms)을 확인했습니다. 근거 디렉터리는 `/tmp/hwpjs-title-group-native.6U4qUw`이며 최종 실행의 정상/최적화 양쪽 반례도 완료됐습니다. 세 실행은 같은48좌표의 재검증이며 합산하지 않습니다.48개는 한 선언 내부의 실제 사례이며 단위 테스트48개라는 뜻이 아닙니다.

재현은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/chart-numeric-input-corpus.test.mjs`입니다. 비동기 oracle 입력·실패/종료 계약은 [일반 본문 검증](hwpx-plain-prefix-verification.md)이 소유합니다. 실제 브라우저·OS IME·원본 조판·전체 native gate나 기본 WASM/데모 승격의 완료가 아닙니다.
