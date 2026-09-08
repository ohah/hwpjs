# JPEG DQT·DHT 내용 검사

## 근거와 책임

[ITU-T T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf) B.2.4.1/Table B.4, B.2.4.2/Table B.5, Annex C를 참조했습니다. 외부 소스 코드나 의존성을 추가하지 않았습니다.

- `table_cursor.zig`: 비어 있지 않은 테이블 세그먼트 payload, 바이트/테이블 수 한도, 공통 nibble selector와 성공 시 커서 반영을 소유합니다.
- `quantization.zig`: DQT 정의를 순서대로 반환합니다. 64개 원값을 wire zig-zag 순서로 보존하며 8/16비트·destination 0~3·값 0 금지를 검사합니다. 래스터 순서로 재배열하지 않습니다.
- `huffman_lengths.zig`: 길이 1~16의 코드 공간을 검사합니다. 초과 배정과 all-ones 코드 배정을 거부하며 미사용 16비트 코드 공간을 반환합니다.
- `huffman.zig`: DHT class/destination·16개 길이 개수·심볼 원문과 경계를 소유합니다. 길이의 유효성을 심볼 의미나 실제 복호화 완료로 해석하지 않습니다.

공통 binary.Reader를 사용하며 코어 파서는 할당하지 않습니다. 반환 view는 입력을 빌립니다. 실패하면 커서·성공한 테이블 수를 변경하지 않습니다. 같은 destination이 반복돼도 중복 오류나 자동 병합 없이 정의 순서를 보존합니다.

## 한도와 미완료 범위

기본 payload 한도는 65,533바이트, 테이블 수는 4,096개입니다. DHT의 기본 심볼 개수 한도 256은 명시적 자원 정책이며 조정할 수 있습니다. 심볼 중복/프로세스별 심볼 의미를 검증하지 않으므로 한도를 늘려 파싱한 결과를 표준 코드북 완료로 인증하지 않습니다. 0개 심볼 정의도 별도로 표현되며 실제 디코더가 사용할 수 있다는 뜻은 아닙니다. `symbol_semantics_deferred`를 유지합니다.

정의와 사용 제약을 분리합니다. DQT의 `validateForFrame`은 lossless 사용을 거부하고, 모든 8비트 DCT 프로세스에서 16비트 양자화 테이블 사용을 거부합니다. DHT의 `validateForProcess`는 baseline destination 제한·lossless class 제한·Huffman 프로세스 여부를 검사합니다. 정의 Iterator는 이 사용 제약을 자동 적용하지 않습니다.

[테이블 설치와 스캔 선택](jpeg-table-selection.md)이 설치·선택 계층과 해당 사용 제약의 호출을 소유합니다. 스캔 간 수명과 복호화 완료 여부는 해당 문서의 경계를 참조합니다. HWP JPEG 지원 완료로 집계하지 않습니다.

## 검증 기록

- 새 네이티브 9개 테스트: selector 전체 바이트, 64개 위치 각각의 모든 8비트 값, 모든 16비트 값, Huffman 길이 위치×개수 전체 조합, 잘림·반복 정의·예산·borrowed view·프로세스별 사용 제약 검사.
- ReleaseSafe/ReleaseFast JPEG 필터 각각 root·기존 테스트 포함 23/23 통과. 전체 Debug 네이티브 739/739 통과.
- 테스트용 mode 247에서 독립 JS와 세 모드 WASM 각각 비교 4,959건·거부 2,380건 통과. JS는 코어의 단계별 슬롯 계산 대신 고정 분모 Kraft 합을 사용합니다.
- 실제 HWP JPEG 참조 8건과 참고 `s1.jpg`의 DQT/DHT 원값을 세 모드 WASM에서 대조했습니다. 기존 경계·헤더 검사도 유지했으며 정규 audit에 연결했습니다. 픽셀 복호화 결과를 비교한 것은 아닙니다.
- Debug/ReleaseSafe/ReleaseFast 전체 audit가 각각 20/20 단계·739/739 네이티브 테스트·7,011,283건 검사로 통과했습니다. 이 수치는 전체 회귀 검사 합계이며 JPEG 지원 범위나 전체 문서 구현 완성도를 뜻하지 않습니다.

### 추가 적대적 검증

제품 소스와 분리한 복사본 두 개에 각각 결함을 주입했습니다. `quantization.zig`의 검사 범위를 `0..64`에서 `0..1`로 줄인 경우와 `huffman_lengths.zig`의 `count >= slots`를 `count > slots`로 바꾼 경우 모두 Debug/ReleaseSafe/ReleaseFast에서 JPEG 테스트 23개 중 1개가 `TestExpectedError`로 실패했습니다. 컴파일 오류가 아니라 잘못 허용된 입력을 기존 테스트가 검출한 결과입니다. 원본에는 이 변경을 적용하지 않았습니다.

재현은 별도 소스 복사본에 위 변경 하나를 적용한 뒤 `zig test <copy>/src/root.zig -ODebug --test-filter JPEG`를 실행하고 ReleaseSafe/ReleaseFast로 반복합니다. 양자화 값 검사는 첫 원소에만 편향되지 않으며, Huffman 검사는 초과 배정뿐 아니라 정확히 꽉 찬 코드 공간도 구분합니다.

WASM mode 247 출력에만 결함을 주입하는 별도 검사도 수행했습니다. DQT 출력 오프셋 0/4/8/12/16, DHT 출력 오프셋 0/4/8/12/16/20/24/40의 첫 바이트를 각각 XOR 1로 변조한 후 `jpegTablesEdges`를 실행합니다. 세 모드 각각 13종 모두 독립 비교 assertion으로 검출했습니다. 이는 출력 대조 민감도이며 위 소스 결함 주입과 별개입니다.
