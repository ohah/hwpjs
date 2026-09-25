# HWP5 BinData PCX 선택 검사

## 계약과 단일 출처

HWP5 [표 17~18](../legacy/rust/documents/docs/spec/hwp-5.0.md)은 BinData 항목의 형식 이름·스트림 ID·항목별 압축 정책을 정의하고 그림 확장자로 jpg/bmp/gif를 예시합니다. PCX를 공식 열거 목록에 추가했다고 가정하지 않습니다. 실제 `복학원서.hwp`의 EMBEDDING 항목에는 `PCX` 형식 이름이 있으며, CFB `/BinData/BIN0001.PCX`를 정확히 조회한 뒤 문서 기본 압축 정책에 따라 raw-DEFLATE를 해제합니다. 경로·압축은 기존 `container/binaries.zig`가, PCX 헤더·RLE 규칙은 [공통 PCX 검사기](pcx-structure.md)가 각각 소유합니다.

`container.Options.images`와 그 안의 `pcx`는 기본 null입니다. 둘 다 명시적으로 켜야 검사하며, 미선택 PCX는 `unhandled_binaries`로 남습니다. PNG/JPEG/BMP/GIF의 기존 우선순위는 유지합니다. 그 다음 UTF-16LE 확장자 `pcx`(대소문자 무관) 또는 공통 PCX 후보 바이트가 있으면 검사합니다. 다른 확장자의 PCX 바이트는 `extension_disagreements`로 세고, 선언 PCX의 손상 바이트는 오류로 전파합니다. 앞선 형식으로 선언된 바이트가 그 검사에 실패했을 때 PCX로 fallback하지 않습니다. 외부 LINK는 여전히 가져오지 않습니다.

`container/pcx_images.zig`는 공통 검사기의 스칼라 결과를 `Report.pcx`의 images·decoded_bytes·encoded_bytes·palette_images·extension_disagreements로 집계합니다. 같은 물리 스트림을 둘 이상 참조하면 각 BinData 항목의 압축 정책과 검사 결과를 별도로 셉니다. `max_total_pcx_decoded_bytes`는 기본 256MiB이며, 각 항목의 한도와 남은 문서 예산 중 작은 값을 전달합니다. 모든 검사·가산이 성공한 뒤에만 누적 보고서를 교체합니다. PCX plane·팔레트 버퍼는 보유하지 않습니다. `semantics_deferred`는 유지되며 픽셀 값·색상·렌더링·편집·저장과 전체 HWP 유효성은 검사 범위 밖입니다. 제품 JS 공개 API는 여전히 CFB 중심이고, 이 선택 검사는 네이티브 HWP5 컨테이너 계층입니다.

## 독립 실측

선택 로컬 `reference/rhwp/samples/복학원서.hwp`의 PCX 항목은 1개입니다. 독립 Node CFB·DocInfo·raw-DEFLATE 조사에서 스트림 압축 바이트는 12,165, 해제 바이트는 41,315, SHA-256은 `72140b43b43f5cfc4f1dc10f43480587a0ed4743cddbb795da8f276520582d1a`입니다. 짝 `복학원서.hwpx`의 `BinData/image1.PCX`를 `unzip -p ... | shasum -a 256`으로 확인하면 해제된 HWP와 같은 해시입니다. 이 동치는 두 컨테이너에 같은 PCX payload가 있다는 증거이지 두 문서의 전체 표현·레이아웃 동치 증거는 아닙니다.

선택 Zig 실파일 검사 `zig test src/hwp5_pcx_known_survey.zig -O ReleaseFast --test-filter 'HWP PCX known'`는 기본 이미지 옵션에서 PCX가 unhandled 1건으로 남고, PCX를 선택하면 images 1·RLE 출력 110,110바이트·인코딩 41,187바이트로 이동함을 확인합니다. 정확한 출력 한도보다 1 작게 설정하면 `LimitExceeded`로 거부합니다. 이 조사에는 Git에 포함되지 않는 로컬 rhwp 샘플이 필요하므로 기본 audit에는 넣지 않습니다.

## 검증·적대적 재검토

`zig test src/root.zig --test-filter 'HWP PCX'`는 형식 선택·확장자 불일치·실패 원자성·개별/누적 예산을, `--test-filter 'HWP container PCX'`는 DocInfo→CFB→BinData→공통 PCX 검사 연결·반복 참조·할당 실패를 검사합니다. `node tests/hwp5/pcx-corpus.mjs`는 실제 CFB 읽기 뒤 별도의 JS DocInfo/압축 정책으로 스트림 해시와 크기를 고정 대조합니다.

적대적 검토에서는 기존 PNG/JPEG/BMP/GIF 선택 순서를 바꾸지 않았는지, PCX 확장자만 믿고 손상 바이트를 성공 처리하지 않는지, 예산 실패 뒤 보고서가 바뀌지 않는지, 같은 스트림의 반복 참조로 합계 예산을 우회하지 않는지 확인합니다. 독립 조사는 CFB 바이트 조회에 제품 CFB WASM을 재사용하므로 CFB 구현까지 독립적으로 입증한 것은 아니며, PCX 내용의 색상 의미를 검증하지 않습니다.

최종 Debug `zig build test --summary all`은 2,472/2,472, ReleaseSafe `zig build audit -Doptimize=ReleaseSafe --summary all`은 40/40 단계·2,511/2,511 테스트가 통과했습니다. PCX 전용 필터는 ReleaseSafe·ReleaseFast 각각 4/4, 컨테이너 연결 필터는 각각 2/2, 선택 실파일 검사는 ReleaseFast 1/1 통과했습니다. `zig fmt --check build.zig src`, 변경 JS 문법 검사, `git diff --check`, 제품 ReleaseSafe WASM 빌드 5/5도 통과했습니다. 전체 테스트와 이 선택 검사는 PCX 픽셀·색상 결과나 HWP/HWPX 문서 전체 의미의 동치를 증명하지 않습니다.
