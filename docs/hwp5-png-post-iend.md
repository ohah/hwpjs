# HWP5 BinData PNG의 IEND 뒤 0 패딩

## 계약과 SSOT

[PNG 3판 명세](https://www.w3.org/TR/png-3/)는 IEND가 데이터스트림의 마지막 청크이고 그 뒤에 다른 내용이 없어야 한다고 규정합니다. 0 바이트라도 IEND 뒤에 있으면 적합한 PNG 데이터스트림이 아닙니다. 따라서 PNG 공통 `structure.inspect`의 기본 정책은 계속 `TrailingData`입니다.

`src/image/png/structure.zig`만 IEND 위치·CRC를 확정하고 `Options.post_iend`의 `reject` 또는 `{ .zero_padding = max_bytes }`를 적용합니다. 후자는 길이가 명시 한도 이내인 **전부 0인** 바깥 꼬리만 허용하며, `Report.post_iend_zero_bytes`에 비적합 바이트 수를 남깁니다. 0이 아닌 꼬리·추가 PNG·잘못된 IEND CRC는 허용하지 않습니다. 입력 전체는 기존 `chunks.max_bytes` 한도에 포함됩니다. `pixels.decode`는 첫 구조 순회로 전체 입력과 꼬리를 검증한 뒤, 두 번째 메타데이터/IDAT 순회를 IEND에서 끝냅니다. 미검증 꼬리로 픽셀 파서를 우회하지 않습니다.

HWP5 `container.Options.images.png.structure.post_iend`를 명시적으로 선택하면, 기존 정확한 BinData 경로와 항목별 압축 정책 뒤에 이 공통 PNG 옵션을 전달합니다. `max_total_png_post_iend_zero_bytes`는 기본 64MiB이며, 항목 한도와 남은 문서 한도 중 작은 값을 사용합니다. `Report.images.png_post_iend_zero_images`와 `png_post_iend_zero_bytes`는 반복 참조를 매번 집계하고 모든 검사·가산 성공 뒤에만 보고서를 교체합니다. 기본값에서는 둘 다 0입니다. 이 통계는 호환성 진단이지 PNG 적합성 통과나 렌더링 완료 표식이 아닙니다. 제품 JS 공개 API는 여전히 CFB 중심입니다.

확장자 `png`인데 JPEG 선두 바이트가 나온 항목은 PNG 선택이 우선하며 `InvalidPngSignature`로 거부합니다. JPEG 검사로 fallback하거나 형식 이름을 자동 수정하지 않습니다. HWPX도 PNG 코어의 기본 strict를 그대로 사용하며 이번 HWP5 선택을 자동 적용하지 않습니다.

## 실제 파일과 독립 조사

로컬 두 corpus의 HWP 후보 584개 중 strict CFB 관측 482개, CFB 거부 73개, 비CFB 29개였습니다. 관측 문서에서 보안 정책으로 제외된 7개를 뺀 475개 문서의 DocInfo 선언 PNG는 332건입니다. 독립 Node CFB·DocInfo·항목별 raw-DEFLATE·PNG 청크 CRC/경계 조사에서 328건은 정확히 IEND에서 끝나고, **1건만 0 패딩 1,740바이트**, 3건은 PNG로 선언됐지만 JPEG `ffd8ffe0` 선두 바이트였습니다. 이 조사는 IDAT 픽셀 값·PNG 메타데이터 의미까지 독립 검증하지 않습니다. CFB 바이트 조회는 제품 CFB WASM을 재사용합니다.

0 패딩 표본은 `reference/rhwp/samples/issue6060/30307_local_service_reform.hwp`의 `/BinData/BIN0002.png`입니다. 파일은 130,048바이트, SHA-256 `cc8668819b79ed51408a93c0ad7876569bf67e8fed56dbfb7febdd0c9a91cded`입니다. 해제 바이트 67,742개 중 유효 PNG 데이터스트림은 66,002바이트이며, IEND 뒤 1,740바이트가 모두 0입니다. Zig 전체 HWP 컨테이너 검사에서 기본 이미지 옵션은 `TrailingData`, 선택 한도 1,739는 `LimitExceeded`, 선택 한도 1,740은 PNG 픽셀 검사와 후속 WMF 구조 검사를 통과합니다. 성공 보고서에는 0 패딩 이미지 1개·1,740바이트와 placeable WMF 1개·77 record가 각각 남습니다. 이는 그 두 payload 경계에 관한 근거이지 문서 전체 의미·화면 결과 동치가 아닙니다.

나머지 3개의 JPEG-선두/PNG-선언 편차는 기본 정책에서 계속 오류입니다. 후속 [명시적 JPEG 검사](hwp5-png-declared-jpeg.md)를 선택한 경우에만 별도 진단하며, 그 문서들의 제작 경위·표시 결과·무손실 재저장 규칙은 확정하지 않았습니다.

## 검증과 적대적 재검토

`zig test src/root.zig --test-filter 'PNG post-IEND'`는 strict 기본값, 입력·항목의 정확/부족 한도, 비영 꼬리·추가 PNG·IEND CRC 손상, 행 복원 결과 동치 및 할당 실패를 검사합니다. `--test-filter 'HWP container PNG post-IEND'`는 DocInfo→CFB→BinData 반복 참조와 전체 한도·할당 실패를 검사합니다. `--test-filter 'HWPX picture image payloads keep post-IEND'`는 HWPX ZIP→그림 대상 연결의 기본 strict가 유지되는지 검사합니다. 독립 JS 경계 반례는 `node --test tests/hwp5/png-post-iend-evidence.test.mjs`이며 기본 audit에도 포함합니다. 선택 실파일은 `zig test src/hwp5_png_post_iend_known_survey.zig -O ReleaseFast --test-filter 'HWP PNG known zero tail'`, 전수 바이트 분포는 `node tests/hwp5/png-post-iend-survey.mjs`로 재현합니다. 뒤의 두 명령에는 Git에 포함되지 않는 로컬 rhwp clone이 필요하고 기본 audit에는 포함하지 않습니다.

적대적 검토에서는 IEND 이전 CRC 오류를 0 패딩 정책이 숨기지 않는지, 두 번째 PNG나 비영 데이터가 뒤따르는지, 패딩 바이트가 입력·개별·문서 전체 예산에 모두 포함되는지, 반복 참조의 합계 한도를 우회하지 않는지, 실패 뒤 보고서가 불변인지 확인합니다. 기본 strict·HWPX strict와 IDAT 내부의 별도 zlib 후미 진단을 혼동하지 않습니다.

최종 소스에서 Debug `zig build test --summary all`은 5/5 단계·2,481/2,481 테스트, ReleaseSafe `zig build audit -Doptimize=ReleaseSafe --summary all`은 42/42 단계·2,520/2,520 테스트를 통과했습니다. `zig build -Doptimize=ReleaseSafe --summary all`도 5/5 단계 통과했습니다. 새 PNG/HWPX 선택 반례는 ReleaseFast에서도 통과했고, 선택 실파일 HWP는 Debug·ReleaseSafe·ReleaseFast에서 각각 1/1 통과했습니다. 이 수치는 일반 HWP/HWPX 전체 문서 의미 검증 완료를 뜻하지 않습니다.
