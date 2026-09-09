# Progressive JPEG 블록 계수 복호화

## 근거와 현재 범위

[ITU-T T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)의 A.4, G.1.1~G.1.2.3, G.2를 대조했습니다. DC와 AC의 point transform은 음수 처리에서 다르며, DC 보정은 비트 덧붙이기, AC 보정은 부호를 유지한 크기 증가입니다. G.2는 별도 디코더 흐름도 대신 인코더 절차의 역변환을 정의합니다.

이 작업은 Huffman progressive의 블록 계수 네 경로(DC 초기/보정, AC 초기/보정)를 구현합니다. 후속 [스캔 계층](jpeg-progressive-scan.md)은 MCU·restart 순회, [프레임 계층](jpeg-progressive-frame.md)은 계수 저장과 스캔 이력을 조립합니다. Progressive 샘플 평면/RGB 연결, 실 HWP의 progressive JPEG 지원 완료는 아닙니다. arithmetic·hierarchical 처리는 포함하지 않습니다.

## 책임과 수명

- `dct_categories.zig`: 8/12비트 DCT 허프먼 magnitude category 한도. 순차 디코더와 progressive 디코더가 공유합니다.
- `progressive_values.zig`: checked point scaling, 이전 approximation 정렬 검사, DC/AC의 서로 다른 보정 규칙.
- `progressive_ac.zig`: 초기 AC의 zero run·EOBRUN, 보정 AC의 신규 부호·기존 계수 correction bit 순서. ZRL은 기존 비영 계수를 제외한 16번째 영 계수에서 끝납니다.
- `progressive_block.zig`: 기존 scan.parse·Huffman·Bits·amplitude를 조립합니다. 스캔 문법/허프먼 표 해석을 복제하지 않습니다. 블록·비트 상태·State를 임시 복사하고 모두 성공한 경우에만 반영합니다.

Decoder.init은 파싱된 Frame과 SOS payload, 필요한 한 개의 허프먼 표를 받습니다. DC 보정은 표가 필요 없습니다. Decoder의 심벌 slice와 Bits는 입력을 빌리므로 그 입력을 불변·유효하게 유지합니다. Decoder와 State의 필드를 수동으로 변조한 상태는 정상 생성 계약 밖입니다.

계수는 dequantization 이전의 i32 zig-zag 64개입니다. 선택 대역 밖은 보존합니다. 초기 대역은 영 값이어야 하며, 보정 대역은 이전 Ah 정밀도에 맞게 정렬되어 있어야 합니다. 중복 초기 스캔에서 값이 우연히 영인 경우까지 이 검사로 판별할 수는 없으므로 기존 progression.History 검사가 별도로 필요합니다.

State.predictor는 point transform 이후의 DC 단위이며 복원된 block[0]과 다릅니다. EOBRUN은 현재 블록을 처리하고 남은 블록 수를 보관합니다. 최대 run 32,767을 넘거나 스캔/restart 끝에서 남아 있으면 오류입니다. 상위 계층은 정확한 블록 순서·개수를 순회하고 State.finish, Bits.finish와 restart 마커를 검사한 뒤 상태를 초기화해야 합니다. 이 블록 함수만 호출해서 프레임 완료로 판단하지 않습니다.

## 검증 기록 및 남은 작업

Debug/ReleaseSafe/ReleaseFast 각각 네이티브 필터 9/9개(root 집계 포함)가 통과했습니다. DC/AC 음수 차이, 모든 보정 Al 0~12, 초기 AC의 정확한 ZRL 대역 끝과 초과, 32,767블록 EOBRUN, 신규 부호와 correction bit 순서, ZRL 직후 비영 계수, 후속 블록의 EOB correction, 늦은 실패의 상태 원자성, i32 predictor/scale/correction overflow, 잘못된 이전 정밀도를 포함합니다.

별도 순차 블록 필터 4/4개도 통과했습니다. 이는 순차 모듈 전체 회귀를 대신하지 않습니다.

## 독립 WASM 대조

테스트용 mode 279는 SOF/SOS·선택 허프먼 표·초기 계수 배열·predictor/EOB·비트 시작 위치·entropy를 받습니다. 출력은 비트 offset/remaining·최종 predictor/EOB·블록 수와 각 i32 계수입니다. finish 옵션은 마지막 padding과 EOB 잔여를 검사합니다. 제품 ABI는 아닙니다.

`jpeg-progressive-block.mjs`는 독립 bit string/허프먼 codeword를 사용합니다. 보정 AC는 먼저 영 계수 인덱스 목록에서 신규 계수/ZRL 끝 위치를 찾고 correction bit를 적용하므로 제품의 zero-run 감소 루프와 구현을 구분합니다. 순차/보정의 모든 대역 시작·끝, 신규 계수의 모든 run 0~15·부호·보정 위치, 8/12비트 category, 32,767블록 EOB를 포함합니다.

Debug/ReleaseSafe/ReleaseFast 각각 비교 8,707건·오류 거부 403건과 출력 1,104바이트의 개별 XOR 1 변조 검출이 통과했습니다. `audit.mjs`에도 비교를 연결했습니다.

## 실제 이미지와 외부 변환 결과

`jpeg-progressive-block-file.mjs`는 테스트용 스캔/MCU 순회기입니다. 실제 SOS와 활성 DHT를 전달하고 성분별 DC 예측값·계수 배열·restart 초기화를 관리합니다. 다음 호출의 초기 상태는 제품 출력이 아니라 독립 기준 결과에서 가져옵니다. EOI·padding·EOB와 스캔 선언 이력을 확인하며, 선언된 높이가 있는 양성 표본용입니다. 제품 프레임 디코더 또는 모든 비정상 파일의 독립 검증기로 간주하지 않습니다.

| 입력 | 스캔 | 블록 처리 횟수 | 저장 블록 | DC 초기/보정 · AC 초기/보정 | RST |
|---|---:|---:|---:|---|---:|
| noori.hwp의 progressive JPEG | 7 | 27,000 | 9,000 | 1/0 · 6/0 | 0 |
| reference/rhwp/samples/images/moogung.jpg | 10 | 66,264 | 12,474 | 1/1 · 4/4 | 0 |
| s1.jpg → progressive 기본 | 10 | 5,586 | 1,197 | 1/1 · 4/4 | 0 |
| 같은 변환 + restart 1B | 10 | 5,586 | 1,197 | 1/1 · 4/4 | 3,980 |
| 같은 변환 + restart 7B | 10 | 5,586 | 1,197 | 1/1 · 4/4 | 560 |

세 모드에서 위 계수·비트 위치가 독립 기준과 일치했습니다. noori는 spectral selection만 사용하므로 보정 실파일 증거로 확대하지 않습니다. rhwp 이미지 5개 조사 중 나머지 younghi/splatoon01/san-serif/tiger01은 순차 형식이므로 이 순회기가 보류합니다. HWP의 순차 JPEG 7참조도 이 progressive 검사에서는 보류하며 기존 순차 회귀를 대체하지 않습니다.

설치된 `jpegtran`(libjpeg-turbo 3.2.0, build 20260630)의 `-copy all -progressive -strict`, 그리고 `-restart 1B`/`7B`로 생성한 파일은 `/tmp/hwpjs-progressive-real.EU1AvT/s1-progressive{,-r1,-r7}.jpg`입니다. 새 외부 라이브러리를 제품에 추가하거나 코드를 이식하지 않았습니다. 이 세 파일은 기존 독립 순차 oracle로 읽은 원본 s1의 visible 블록 1,197개 전체 계수와도 일치했습니다. 테스트 보고서의 verifiedBlocks는 이 추가 원본 대조 개수이며, 기본 실파일 대조가 0건이라는 뜻이 아닙니다. 제품 픽셀/RGB 출력이나 한글 프로그램과의 일치 검증은 아닙니다.

## 소스 변형과 전체 회귀 상태

`/tmp/hwpjs-progressive-mutants.GjV46D/`의 격리 소스에서 DC 음수 보정 변경·AC 음수 보정 변경·EOB 현재 블록 차감 누락·ZRL 끝 지연·오류 시 부분 계수 반영을 주입했습니다. 모두 세 모드에서 컴파일 후 테스트 실패로 검출했습니다. 필터 9개 중 실패는 순서대로 2/5/1/1/2개입니다. 제품 소스에는 변형을 적용하지 않았습니다.

블록 단계 당시 Debug·ReleaseSafe·ReleaseFast 전체 회귀는 각각 20/20단계·845/845 네이티브 테스트·checks 7,803,300건으로 통과했습니다. 로그는 `/tmp/hwpjs-progressive-block-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 회귀 종료 후 최종 `zig build test --summary all`도 845/845, `zig build -Doptimize=ReleaseSafe --summary all`도 5/5단계로 통과했습니다. 포맷·변경 JS 문법·diff 공백 검사도 통과했습니다. 이후 조립과 최신 검증 상태는 [스캔 작업](jpeg-progressive-scan.md)과 [프레임 작업](jpeg-progressive-frame.md)이 소유하며, 제품 progressive 샘플/RGB 연결은 아직 미완료입니다.
