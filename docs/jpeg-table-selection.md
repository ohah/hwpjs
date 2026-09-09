# JPEG 테이블 설치와 스캔 선택

## 근거와 책임

[ITU-T T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf) B.2.3/B.2.4와 G.1.2.1의 테이블 설치·재정의·progressive DC 보정 절차를 참조합니다. 외부 코드를 추가하지 않았습니다.

- `table_store.zig`: DQT 4개, DHT class별 4개 슬롯을 소유합니다. 정의 payload는 기존 DQT/DHT Iterator만 해석합니다. 같은 목적지의 마지막 정의가 선택됩니다. 세그먼트 전체가 유효할 때만 슬롯을 반영하므로 뒤쪽 잘림·자원 제한 오류로 앞쪽 정의만 적용되지 않습니다.
- `scan_tables.zig`: 기존 SOS 파서로 헤더를 검사하고, 해당 스캔에 필요한 테이블을 선택합니다. Frame의 component ID와 Q selector를 사용하며 위치나 기본 테이블을 추측하지 않습니다.

모든 테이블은 원본을 빌립니다. 저장소와 반환 스캔 view를 사용하는 동안 설치한 입력 버퍼를 변경하거나 해제하면 안 됩니다. 파서는 할당하지 않습니다. 반환 배열의 유효 범위는 `components[0..count]`입니다. 새 저장소는 비어 있으며 생략 형식의 외부 테이블을 자동 상속하지 않습니다.

## 선택 규칙과 남은 범위

Sequential DCT는 Q·DC·AC, lossless Huffman은 DC만 필요합니다. Progressive는 Q와 함께 최초 DC 스캔에는 DC, AC 최초/보정 스캔에는 AC를 선택합니다. DC 보정은 비압축 비트이므로 Huffman 테이블을 요구하지 않습니다. 선택한 테이블에만 기존 precision/process 검사기를 적용합니다. 사용하지 않는 정의를 임의로 거부하지 않습니다. 심볼이 없는 DHT는 정의로 보존할 수 있지만 사용 시 `EmptyJpegHuffmanTable`입니다.

산술 프로세스는 `UnsupportedJpegArithmeticTables`로 명시적으로 보류합니다. 선택 성공은 심볼 의미·계수 복호화 성공이 아니며 `symbol_semantics_deferred`를 유지합니다. 이 계층은 한 스캔의 선택을 검사합니다. [Progressive 스캔 이력](jpeg-progression.md)이 계수별 approximation 이력과 성분의 Q 변경 검사를 조립합니다. DNL/재시작/프레임 수명은 후속입니다. 단일 스캔 검사만으로 전체 progressive 파일을 유효하다고 인증하지 않습니다.

## 검증 기록

- 새 네이티브 6개 테스트와 기존 JPEG 테스트를 포함하여 Debug 29/29 통과.
- 독립 JS Map 기반 선택 결과와 테스트 전용 WASM mode 248: 세 모드 각각 비교 166건·거부 92건 통과. Q/DC/AC 목적지 조합 64종, 누락 조합, 재정의 전후, 두 번째 정의의 모든 잘림을 포함합니다.
- 추가 적대적 검토에서 단일 성분 편향을 발견해 다성분 부분 스캔을 추가했습니다. Frame ID 9/4/7, Q selector 2/0/3 중 ID 4/7만 선택하고 각 DC/AC 목적지도 다르게 둡니다. 스캔에 없는 ID 9의 Q 테이블은 설치하지 않아, 첫 성분 사용·위치 기반 대응·미사용 성분 테이블 요구를 검출할 수 있습니다.
- 실제 HWP 내 JPEG 참조 8건과 참고 `s1.jpg`의 모든 관측 스캔 선택을 세 모드 WASM에서 대조했습니다. 픽셀 복호화 결과 비교는 아닙니다.
- Debug/ReleaseSafe/ReleaseFast 전체 audit는 각각 20/20 단계·745/745 네이티브 테스트·7,011,550건 검사로 통과했습니다. 이는 전체 회귀 검사 합계이며 JPEG 전체 복호화나 모든 문서 구현 완료를 뜻하지 않습니다.

### 결함 주입 검증

제품과 분리한 소스 복사본에 각각 다음 변경 하나를 적용하고 `zig test <copy>/src/root.zig --test-filter JPEG`를 Debug/ReleaseSafe/ReleaseFast로 반복했습니다. 세 변경 모두 각 모드에서 29개 중 1개가 실패했고 컴파일은 성공했습니다.

- `table_store.zig`: DQT 반복문의 각 정의 직후 `self.quantization = next`를 반영하도록 변경 → 뒤쪽 잘림 이후 원래 포인터 보존 검사 `TestUnexpectedResult`.
- `scan_tables.zig`: `needs_dc`에서 `approximation_high == 0` 조건 제거 → 정상 DC 보정 사례가 `MissingJpegHuffmanTable`로 실패.
- `scan_tables.zig`: Frame ID 비교 대신 `j != 0`일 때 건너뛰도록 변경 → 다성분 부분 스캔이 `MissingJpegQuantizationTable`로 실패.

별도로 mode 248 출력의 0부터 36까지 4바이트 간격 필드 첫 바이트를 각각 XOR 1로 변조했습니다. 세 모드 각각 출력 변조 10종 모두 독립 JS assertion으로 검출했습니다. 소스 결함 주입과 출력 비교 민감도는 다른 검증입니다.
