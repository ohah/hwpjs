# Progressive JPEG 스캔 계수 복호화

## 근거와 범위

[ITU-T T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)의 A.1~A.2, E.2.3~E.2.5, G.1~G.2를 대조했습니다. Restart 간격은 블록이 아닌 MCU 수입니다. 구간 시작에는 성분별 DC 예측값과 EOBRUN을 초기화하며, run이 다음 구간으로 넘어가도록 허용하지 않습니다. Huffman 구간 끝에는 남은 비트의 1-padding을 확인합니다.

`progressive_scan.Decoder`는 8/12비트 Huffman progressive DCT의 한 스캔을 복호화합니다. DC 초기/보정과 AC 초기/보정을 지원하며, 이전 계수를 받아 새 계수와 위치를 반환합니다. 전체 프레임의 스캔 이력·DQT 수명·계수 저장소는 후속 [프레임 계층](jpeg-progressive-frame.md)이 조립하고 샘플 복원은 [샘플 평면](jpeg-progressive-samples.md)이 담당합니다. Progressive RGB, HWP BinData JPEG 연결은 아직 미완료입니다. 산술·lossless·hierarchical JPEG를 지원한다고 주장하지 않습니다. 제품 JS API는 CFB-only 그대로입니다.

## 책임과 SSOT

- `progressive_scan.zig`: 성분별 block.State, 이전 계수 전달, 다음 블록 위치, EOB 종료 확인, 트랜잭션과 완료 상태.
- [progressive 블록 계층](jpeg-progressive-block.md): DC/AC 심벌·음수 보정·point transform·선택 대역의 이전 값 검사. 스캔 계층에서 재구현하지 않습니다.
- `scan_entropy.zig`: 순차/progressive가 공유하는 바이트·블록·RST 한도 Options, MCU restart 시점, 구간 시작/전환·패딩·종결 마커 검사. helper는 각 스캔 디코더의 임시 상태에서 호출하며 자체 계수나 예측값을 소유하지 않습니다.
- `coefficient_block.zig`: 순차/progressive 출력의 소유된 64개 i32 zig-zag 계수와 성분 ID·프레임 인덱스·블록 x/y. 픽셀 사각형이 아닙니다.
- 기존 `scan_tables.resolve`·`scan.parse`: SOS와 활성 테이블 선택/필요성. DC 보정에는 허프먼 표가 필요 없습니다. 표를 임의 생성하거나 추측하지 않습니다.
- 기존 `mcu_layout.Layout`·`component_geometry`: MCU/성분별 격자와 interleaved 패딩 블록. 단일 성분은 샘플링 값과 무관하게 MCU당 한 블록입니다.
- 기존 `entropy`·`Bits`·`markers`·`restarts`: FF00, bit 읽기, 마커 문법, RST0~7 번호 검증.

순차 스캔은 기존 공개 필드와 출력 형식을 유지하며 공통 transport/출력 타입만 재사용합니다. 기존 독립 순차 WASM/실파일 검증은 계속 실행해야 합니다.

## 호출과 수명

`init(frame, sos, store, height, interval, bytes, options)`의 Frame은 파싱된 값이어야 합니다. height는 상위 계층이 SOF/DNL에서 확정한 값입니다. 이 API가 DNL을 검색하거나 SOF/DNL 순서를 검사하지 않습니다. 입력 bytes는 SOS 직후부터 시작하고 종결 마커까지 포함하며, 종결 마커는 소비하지 않습니다. `reader.offset`은 입력 기준 종결 마커의 FF/fill 시작 위치입니다.

코어는 할당하지 않습니다. 빌린 테이블/프레임/엔트로피 입력은 불변·유효하게 유지해야 합니다. 생성 이후 내부 필드를 임의 변조한 Decoder는 계약 밖입니다.

호출자는 `position()`의 frame_component/x/y로 이전 스캔의 64계수를 찾고 `next(prior)`에 값으로 전달합니다. 초기 스캔의 해당 대역은 0이어야 합니다. 다른 대역은 유지합니다. `next`가 반환한 소유된 블록을 저장소에 반영할 책임은 호출자에게 있습니다. padded interleaved 위치도 저장해야 하며, 다른 위치의 prior를 잘못 전달했는지는 이 API가 판별할 수 없습니다.

`position()==null`이나 마지막 블록 반환만으로 완료가 아닙니다. 이후 `next`를 호출해 null이 반환되고 complete=true가 되어야 EOB·패딩·불필요한 RST 부재가 확인됩니다. 이 마지막 호출의 prior는 무시합니다. 마커 종류의 프레임 내 적법성/EOI/뒤쪽 바이트는 상위 구조 검사의 책임입니다.

오류 시 해당 `next` 시작의 비트·reader·예측값·EOB·restart 번호/개수·emitted·complete가 유지됩니다. 같은 호출에서 정상 RST를 읽은 뒤 다음 블록이 실패한 경우도 이전 구간 상태로 되돌립니다. prior는 값으로 받으므로 호출자 배열을 수정하지 않습니다. 이전에 성공해 반환한 블록까지 취소하는 것은 아닙니다.

## 네이티브 및 독립 WASM 검증

새 네이티브 테스트 8개는 DC point 단위/선택 외 대역 보존, 허프먼 표 없는 음수 DC 보정, EOB 구간 경계, 후속 블록 AC correction, restart 직후 실패와 재시도, 성분별 예측값·MCU 거리·좌표, 한도/미지원 프로세스/필요 표/호출자 해결 높이, 마지막 패딩·전체 byte·추가 RST를 검사합니다. 기존 progressive 관련 테스트와 함께 Debug/ReleaseSafe/ReleaseFast 필터 26/26개(root 집계 포함)가 통과했습니다.

테스트용 mode 280은 기존 scan bridge와 같은 SOF/SOS·DQT/DHT·해결 높이·DRI·한도에 더해 스캔 순서의 이전 계수 배열을 받습니다. 배열 개수는 MCU 격자 블록 수와 정확히 같아야 합니다. 출력은 6개 u32(열/행/MCU당 블록/총 블록/소비 offset/RST 수), 이어서 블록별 성분 ID·프레임 인덱스·x/y와 64개 i32입니다. 출력 바이트 한도를 할당 전에 검사합니다. 이는 제품 ABI가 아닙니다.

`jpeg-progressive-scan.mjs`는 독립 geometry의 구간별 중첩 순회와 Map 기반 예측값, 기존 bit-string 블록 oracle을 조립합니다. 제품 slot·예측값·offset을 기대값으로 사용하지 않습니다. 입력/출력 wire의 기존 스캔 크기 상수는 `jpeg-scan.mjs`를 재사용합니다.

Debug/ReleaseSafe/ReleaseFast 각각 비교 3,495건·거부 26건이 통과했습니다. 8/12비트·홀수 경계·단일/여러 성분과 마지막 성분만 선택·샘플링·Ri 0/1/2/7·네 복호화 경로·Al 조합, RST 번호 순환과 fill·짧은 마지막 구간, 모든 AC 단일 대역의 신규 계수, EOB 보정과 최대 32,767블록 run을 포함합니다. 출력 변조는 네 경로의 2블록 스캔 총 2,272바이트 각각을 XOR 1로 바꾸어 세 모드 모두 검출했습니다.

별도 표 선택 조사도 세 모드 각각 144건 통과했습니다. 폭 31·높이 17·성분 9/4의 샘플링 2×1/1×2, Q 목적지 2/3, 서로 다른 DC 목적지 0~3의 순서쌍, category 1(+1)/2(+2), Al=3, 전체/두 번째 성분만 선택, Ri 0/1/3, 정밀도 8/12를 조합해 `progressiveScanActual`로 검사했습니다. 서로 같은 표만 쓰는 fixture의 위치 편향을 보완하며 정규 audit 합계에는 포함하지 않습니다.

## 실파일과 적대적 검증 상태

기존 [블록 실파일 조사](jpeg-progressive-block.md)의 테스트용 파일 순회기에 선택적 scanCheck를 추가했습니다. 이전 계수는 여전히 독립 블록 oracle에서 가져오며 새 스캔 oracle과 제품 mode 280을 별도로 대조합니다. 이 테스트 도구가 제품 프레임 조립을 대신하지는 않습니다.

Debug/ReleaseSafe/ReleaseFast에서 noori.hwp 7스캔·27,000블록 처리, moogung.jpg 10스캔·66,264블록 처리, 기존 jpegtran 변환 3개 각각 10스캔·5,586블록 처리가 일치했습니다. 변환 파일의 RST 수는 0/3,980/560이며 원본 s1의 visible 1,197블록 계수 대조도 유지했습니다. noori는 spectral selection만 쓰므로 보정 실파일 근거로 삼지 않습니다. 순차 JPEG는 이 progressive 순회기에서 보류합니다.

공통 transport 분리 후 `jpegSequentialFileActual`로 순차 실파일도 세 모드에서 다시 대조했습니다. HWP JPEG의 순차 7참조는 총 20,089블록·RST 10개, 별도 s1.jpg는 1,197블록·RST 18개가 독립 JS와 일치했습니다. 계수·성분·좌표·소비 offset을 포함하며 픽셀 출력 비교는 아닙니다.

`/tmp/hwpjs-progressive-scan-mutants.jolz5L/`에 제품 소스를 복사해 restart 예측값 초기화 누락, EOB 종료 검사 누락, MCU 대신 블록 단위 restart, 오류 시 중간 상태 노출, 출력 x좌표 오염의 다섯 변형을 만들었습니다. 세 모드 모두 컴파일 후 테스트 실패로 검출했습니다. 각 모드의 필터 26개 중 실패는 순서대로 2/1/1/3/2개입니다. 실제 제품 소스에는 변형을 적용하지 않았습니다.

전체 회귀 로그는 `/tmp/hwpjs-progressive-scan-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 세 모드 각각 20/20단계·853/853 네이티브 테스트·checks 7,806,821건으로 통과했습니다. 회귀 종료 후 최종 `zig build test --summary all`도 853/853, 제품 `zig build -Doptimize=ReleaseSafe --summary all`도 5/5단계로 통과했습니다. 포맷·변경 JS 문법·diff 공백·변경 문서의 로컬 링크 검사도 통과했습니다. 전체 progressive 프레임·픽셀·HWP 연결의 완료 증명은 아닙니다.
