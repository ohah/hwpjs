# 차트 예제의 숫자 입력 48곳

## 실제 숫자 셀 Canvas·메뉴 왕복

`numeric-input-browser-audit.mjs`는 기존 공유 문서 메뉴 flow의 numeric-input 사례를 실행합니다. 대상은 아래 참조 원본 문단19의 `328` 전체를 실제 브라우저 키보드로 선택해 `1`로 치환하는 명령입니다. native 사전 표시와 trusted beforeinput/input, 메뉴 U/R/S, 다운로드, 기존 독립 숫자 oracle의 SUM/전체 XML·ZIP normal/-O, 잘못된 대상 문단 거부, 재업로드 후 현재 숫자 표시를 검사합니다. 별도 편집 명령/독립 계산기를 만들지 않습니다.

`/tmp/hwpjs-zig017-current-fixtures.xouwd1/numeric-reference-browser-bounded.jsonl/.stderr`는 작업 트리 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`에서 exit0·stderr0·verified=true·cleanup.success=true입니다. 저장본 SHA256은 `f5a9d6dec957ad09bb31923724a5bf38c5080ad0f6bd2871ed2da965ad7e1f4f`입니다. agent-browser 스킬의 격리 세션/실제 키보드 입력/종료 확인을 사용했습니다.

앞선 `numeric-reference-browser.jsonl`과 `numeric-reference-browser-final.jsonl`은 저장/독립 비교 뒤 재업로드 검색 대기에서 실패했습니다. 짧은 검색어 `1`이 다른 셀에 먼저 걸렸으며 문단 창도 표 소유 문단/셀을 함께 포함합니다. 최종 검사는 실제 다음 찾기를 최대50회로 제한하고 정확한 입력값을 확인하며 실패를 성공으로 숨기지 않습니다. 중간 `numeric-reference-browser-fixed.jsonl`의 BrowserClickTargetCovered는 열린 문단 창을 다시 접은 검사 오류였습니다. 모든 실행은 소유 세션/서버를 종료했고 실패 로그를 보존합니다. 이 검사는 한 셀의 UI 경로이며 전체12/48위치의 브라우저 검증·물리 IME·원본 조판 동치 완료가 아닙니다.

후보 트리 `f851c44725becfcf60d198cca05cde8e5863dae9`를 `/tmp/hwpjs-numeric-browser-clean.3GPpGW`에 추출해 게시 소스 Zig0.17 WASM `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`에서도 숫자 입력·수동 결과·기존 plain 세 경로를 직렬 검사했습니다. `numeric.jsonl/.stderr`·`manual.jsonl/.stderr`·`plain.jsonl/.stderr` 모두 verified=true·cleanup.success=true·stderr0이고 wrapper exit0입니다. 잘못된 진입 인자 guard는10/10·fail/cancel/skip0·exit0입니다. 세 경로가 공유 flow 변경 후에도 동작하는 증거이며 전체 fixture/명령 gate가 아닙니다. 기본 WASM·외부 데모는 보존합니다.

## 추가 참조 원본의 숫자 입력 12곳

`reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx`의 일반 prefix 거부12곳은 독립 XML inventory의 숫자 입력12곳(문단19–21·24–26·29–31·34–36)과 일치합니다. 수식 결과3곳과 구분하며 과거 일반/전용 prefix 결과의15거부를 성공으로 바꾸지 않습니다.

기존 numeric-input 회귀를 두 원본으로 매개화했습니다. 독립 oracle은 원본 SHA256 `1ee1e9045be4334fb9f940d7226cfda2884df9fecac6fa7fca76fb81c08a4a81`에 수식 분모3을 결합하며, 기존 chart 해시/분모13도 유지합니다. 임의 입력 파일이나 호출자가 정한 분모를 허용하지 않습니다. 첫 실행은 이 원본의 HYPERLINK1곳까지 FORMULA로 가정해 `Observed field kind`로 실패했습니다. 수식 ordinal은 기존 수동 결과 oracle과 동일하게 FORMULA만 세도록 바로잡았으며, 비수식 필드는 전체 XML 비교의 보존 대상입니다. 첫 실패 로그는 `/tmp/hwpjs-zig017-current-fixtures.xouwd1/numeric-reference-12.log/.stderr`에 남깁니다.

각 숫자를1로 치환해 실제 의존 SUM·표시/Command/LastResult·dirty·전체 XML/비대상 ZIP payload를 normal/-O로 검사합니다. 첫 좌표에서는 정상 재직렬화와8종 변조 거부도 검사합니다. undo 뒤 잘못된 문자 prefix가 InvalidFormulaNumber로 거부되고 revision·원본 저장이 그대로인지, redo가 살아 있는지도 두 원본 모두 검사합니다. 새 원본의 결과 입력3곳은 [수동 결과 감사](hwpx-manual-result-reference-audit.md)의 별도 경로가 소유합니다. 실제 브라우저/모든 위치/조판 지원 증명은 아닙니다.

같은 디렉터리의 `numeric-reference-final.log/.stderr`는 작업 트리 Zig0.17 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`에서 두 원본의48+12좌표를2/2·fail/cancel/skip0·exit0·stderr0으로 검사했습니다. `numeric-reference-clean-wasm.log/.stderr`는 게시 소스 후보 `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`에서 새12좌표를 집중1/1·오류/skip0·exit0·stderr0으로 검사한 별도 결과입니다. 기본 제품 WASM/외부 데모를 교체하지 않았습니다.

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
