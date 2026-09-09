# Progressive JPEG 프레임 계수 조립

## 범위와 근거

[ITU-T T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)의 A.1~A.2, B.2.4, E.2, G.1~G.2와 기존 [스캔 이력](jpeg-progression.md)·[스캔 복호화](jpeg-progressive-scan.md)를 연결합니다. Huffman progressive DCT의 받은 스캔을 EOI까지 복호화하여 소유권이 있는 계수 격자를 반환합니다. 양자화 표가 같은 목적지를 공유해도, 앞 성분의 마지막 스캔 이후 다른 성분용으로 바뀐 표를 앞 성분에 소급 적용하지 않습니다.

이는 8/12비트 양자화 계수 단계입니다. 후속 샘플·IDCT 연결은 [샘플 평면 계약](jpeg-progressive-samples.md), RGB 조립은 [progressive JFIF RGB](jpeg-progressive-rgb.md)가 소유합니다. HWP BinData JPEG 검사 연결과 제품 HWP JS API는 아직 미완료입니다. 산술·lossless·hierarchical 처리나 실제 한글 화면과의 픽셀 동일성을 주장하지 않습니다. 제품 JS API는 CFB-only 그대로입니다.

## 책임과 SSOT

- `coefficient_storage.zig`: 모든 성분의 padded 블록 격자를 사전 계산하고 전체 할당량을 제한합니다. 기존 component_geometry에서 MCU/visible 크기를 가져옵니다. Grid는 행 우선 64개 i32 배열을 소유하며 x/y를 검사한 뒤 stride를 계산합니다.
- `quantization_snapshot.zig`: 파싱된 Table의 목적지·8/16비트 정밀도·원시 zig-zag 값을 복사합니다. view는 해당 Snapshot을 빌립니다. 역양자화나 테이블 수명 정책을 재구현하지 않습니다.
- `progressive_image.zig`: 복사된 성분 정보·visible 샘플 크기·Grid·optional Q·64개 정밀도 상태, 전체 소유권 해제와 명시적 완료 정책.
- `progressive_frame.zig`: 구조 검사로 높이를 확정한 뒤 마커를 순회합니다. 기존 progressive.State의 표/이력 검증과 progressive_scan을 조립하고, 모든 스캔 완료 후에만 결과를 반환합니다.

마커/엔트로피 문법은 structure·markers·scan 계층, 허프먼 선택과 변경된 Q 이력은 기존 progressive.State, 계수 계산은 progressive_block이 계속 소유합니다. 프레임 계층은 이 규칙을 복제하거나 잘못된 엔트로피를 썸네일/초기값으로 대체하지 않습니다.

## API·소유권·부분 결과 정책

`jpeg_progressive_frame.decode(allocator, jpeg_bytes, options)`는 Image를 반환합니다. completion은 기본값 없이 반드시 지정합니다.

- `.preserve_partial`: 실제 전송된 대역/정밀도를 보존합니다. 미전송 대역은 levels=255, 전송된 부분 정밀도는 Al>0, Al=0은 해당 대역의 full 상태입니다. 아직 한 번도 스캔하지 않은 성분의 quantization은 null입니다.
- `.require_full`: 모든 선언 성분의 64개 대역 상태가 Al=0이어야 하며, 그렇지 않으면 `IncompleteJpegProgressiveCoefficients`입니다. 이는 소비자 정책이며 명세가 모든 계수를 끝까지 보내도록 강제한다는 주장이 아닙니다.

미전송 대역의 저장 값 0은 메모리 초기값이지 복호화한 0을 뜻하지 않습니다. EOI/엔트로피 처리가 끝났다는 사실과 모든 대역/정밀도가 도착했다는 사실을 구분합니다. progression의 unseen/partial/full 수치는 성분별 64개 대역의 선언 상태이며 이미지 전체 블록 수로 곱하지 않습니다.

planes는 프레임 선언 순서입니다. component 값·visible 샘플 extent·계수·Q 원문·levels 모두 소유하며 입력 JPEG를 계속 유지할 필요가 없습니다. `image.deinit(allocator)`가 각 Grid와 planes를 해제합니다. Q view만 별도로 보관한다면 그 Snapshot의 수명과 주소를 유지해야 합니다.

Grid는 모든 interleaved MCU 위치를 포함할 수 있도록 패딩하여 할당합니다. 단일 성분 스캔에 없는 패딩 위치는 초기값이 남을 수 있고, DC와 AC에서 실제 전송한 패딩 범위도 다를 수 있습니다. levels의 full은 visible 영역에 적용되는 대역 이력이며 모든 할당된 패딩 계수가 전송됐다는 뜻이 아닙니다. 샘플 변환 단계는 visible extent로 잘라야 합니다.

실패하면 그 호출에서 성공적으로 처리한 앞 스캔의 계수까지 포함해 모든 할당을 해제하며 Image를 반환하지 않습니다. 각 블록은 기존 scan.next가 성공한 뒤에만 격자에 반영합니다. 이미지 전체 결과를 반환하는 API이므로 스캔마다 격자를 복제하지 않습니다.

## 독립 한도와 메타데이터 경계

Options.structure는 입력·마커·픽셀·스캔·RST 수·trailing 정책을 기존 구조 검사에 전달합니다. DNL은 구조 검사에서 해결하며 별도 높이 추측은 없습니다.

Options.storage는 기본 1,000,000 저장 블록·256 MiB 계수 배열 바이트를 제한합니다. 여러 성분의 전체 합을 u64로 사전 계산하고 usize/배열 바이트 범위를 확인한 뒤 할당합니다. 이 바이트 한도는 계수 배열을 대상으로 하며 최대 4개 plane descriptor와 함수 스택은 포함하지 않습니다. padded 공간도 한도에 포함합니다.

max_block_visits는 기본 16,000,000이며 모든 스캔의 반복 처리 합계입니다. 저장 블록 한도와 별개이고 새 스캔에는 남은 처리량만 전달합니다. RST도 전체 누적 한도를 적용합니다. APP/COM·색 관리·픽셀의 의미는 이 API가 검사하지 않습니다. trailing을 명시적으로 허용했다면 소비하지 않은 바이트 수를 보고합니다.

## 네이티브·WASM·적대적 검증

새 네이티브 10개를 추가했습니다. Debug/ReleaseSafe/ReleaseFast 각각 프레임 필터 10/10개(root 포함), 저장 한도 필터 2/2개(root 포함)가 통과했습니다. 입력 원문을 0으로 덮은 뒤에도 계수/Q/성분 정보가 유지됨을 확인했고, 단일·4성분의 모든 할당 실패 위치와 후반 스캔 padding 오류에서 누수가 없는지 검사했습니다. 3×2 비정방 격자, padded DC와 단일 AC의 저장 위치, 공유 Q 변경/원복, 16비트 Q의 0x1234 바이트 순서와 다른 허프먼 목적지, DNL, partial/full 정책, 저장/처리량 한도를 포함합니다.

테스트용 mode 281은 완료 정책·trailing·저장/처리/스캔/RST/픽셀 한도와 JPEG를 받습니다. 출력은 48바이트 프레임 헤더, 성분별 232바이트 메타데이터(levels 64바이트와 Q u16 64개 포함), 행 우선 계수 배열입니다. Q 미등장은 presence=0, precision/destination=255, Q 값 영역 0으로 표현하며 실제 영 양자화 표로 해석하지 않습니다. 출력 바이트 한도도 검사합니다. 제품 ABI는 아닙니다.

`jpeg-progressive-frame.mjs`는 독립 마커 순회·Map 계수 저장·성분별 Q snapshot과 기존 독립 스캔/이력 oracle을 조립합니다. 이후 스캔의 입력은 제품 출력이 아니라 독립 계산 결과에서 가져옵니다. `jpeg-progressive-frame-cases.mjs`가 입력 생성·오류 사례를 소유합니다.

세 모드 각각 비교 314건·거부 209건이 통과했습니다. 성분 묶음과 순서, 정밀도 8/12, 초기 Al 0/1/3/13과 후속 보정, DNL, Ri 0/1/3/7, 샘플링/홀수 크기, 모든 절단 위치, 예산 경계, Q/이력/후반 padding 오류를 포함합니다. 두 출력(full 단일 성분, 일부만 전송한 3성분)의 총 2,816바이트를 한 바이트씩 XOR 1로 바꿔 세 모드에서 모두 검출했습니다.

별도 성분 재묶음·대역 분할 조사 48건도 세 모드에서 일치했습니다. 폭 1/17/33·높이 9/17, 샘플링 [0x22,0x11,0x11]/[0x31,0x11,0x11], 초기 Al=1의 전체 성분 DC 스캔 후 보정 DC를 [2]/[0]/[1] 또는 [0,2]/[1]로 변경하고, 각 성분 AC 보정을 1..1과 2..63으로 나눴습니다. 초기 Ri=0에서 보정 Ri=0/1로 전환했습니다. `progressiveFrameFixture`의 refine=false 파일에서 EOI를 제외한 뒤 위 보정 스캔을 덧붙여 `progressiveFrameActual(...,{full:true})`로 대조했습니다. 이 별도 수치는 정규 audit 합계에 포함하지 않습니다.

`/tmp/hwpjs-progressive-frame-mutants.iiVV9L/`에 격리한 소스에서 최종 Q를 모든 성분에 소급 적용, 스캔별 처리량 예산 재설정, 스캔마다 이전 계수 삭제, 행 stride를 높이로 변경, full 정책 무시의 다섯 결함을 주입했습니다. 모두 세 모드에서 컴파일 후 테스트 실패로 검출했습니다. 프레임 필터 10개 중 실패는 순서대로 1/1/5/1/1개입니다. 실제 소스에는 변형을 적용하지 않았습니다.

## 실제 파일과 전체 회귀 상태

세 모드 모두 noori.hwp의 progressive JPEG는 저장 9,000블록·처리 27,000회·7스캔, moogung.jpg는 저장 12,474블록·처리 66,264회·10스캔으로 독립 결과와 일치했습니다. 기존 [jpegtran 변환 표본](jpeg-progressive-block.md) 3개는 각각 저장 1,197블록·처리 5,586회·10스캔이며 RST는 0/3,980/560개였습니다. 변환 파일의 출력은 원본 s1의 visible 1,197블록 전체 계수와도 직접 일치했습니다. 모두 unseen/partial=0으로 require_full을 통과했습니다.

noori는 spectral selection만 사용하므로 보정 실파일 근거로 확대하지 않습니다. 조사한 나머지 순차 HWP JPEG 7참조는 새 progressive API에서 `UnsupportedJpegProgressionProcess`를 확인했습니다. 순차 계수 경로를 삭제하거나 JPEG 전체 미지원으로 바꾼 것이 아닙니다. 비교 범위는 계수·격자·Q·정밀도 상태이며 실제 한글 화면/브라우저/다른 디코더 픽셀 대조가 아닙니다.

전체 회귀 로그는 `/tmp/hwpjs-progressive-frame-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 세 모드 각각 20/20단계·863/863 네이티브 테스트·checks 7,807,344건으로 통과했습니다. 회귀 종료 후 최종 `zig build test --summary all`도 863/863, 제품 `zig build -Doptimize=ReleaseSafe --summary all`도 5/5단계로 통과했습니다. 포맷·변경 JS 문법·diff 공백·변경 문서의 로컬 링크 검사도 통과했습니다. Progressive 샘플/RGB·HWP 연결의 완료 증명은 아닙니다.
