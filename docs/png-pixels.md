# PNG 이미지 데이터 검증

## 현재 범위

`src/image/png/pixels.zig`는 [청크 구조 검사](png-structure.md), [zlib 해제](zlib-validation.md), [행 필터 복원](png-filters.md)을 연결합니다. IHDR 기반 scanline 길이, 비인터레이스/Adam7 pass, 5종 필터와 indexed-color의 실제 사용 인덱스를 검사합니다. 기준은 [PNG §7~10 및 §11.2](https://www.w3.org/TR/png-3/)입니다.

이는 기본 IDAT 이미지 데이터 검증입니다. ancillary chunk의 의미·순서·중복은 기존 deferred 보고를 유지합니다. APNG frame, tRNS 투명도 적용, 색상 프로필, 텍스트 메타데이터, RGBA 변환, 화면 렌더링, 이미지 저장은 이 단계에서 구현하지 않습니다. HWP 컨테이너의 PrvImage/BinData를 제품 검사에서 소비하도록 연결한 상태도 아닙니다. 제품 JS API는 계속 CFB만 제공합니다.

## 책임과 반환값

- `header.zig`: wire IHDR 파싱, 공통 Header.validate, color/depth에 따른 channels. 직접 생성한 Header도 layout과 palette 진입 시 같은 유효성 규칙을 적용합니다.
- `layout.zig`: 1개 또는 7개 pass의 시작 좌표·간격·크기·행 바이트·오프셋·총 크기. 빈 pass에는 필터 바이트를 계산하지 않습니다. 순수 계산이며 할당하지 않습니다.
- `palette_indices.zig`: MSB-first packed 인덱스 범위. 실제 폭만 순회하고 마지막 바이트의 사용하지 않는 하위 비트는 검사하지 않습니다.
- `pixels.zig`: 기존 검사기 조립, IDAT 연결, 해제 버퍼 소유권, pass 경계에서 이전 행 초기화와 성공 보고서.

`decode(allocator, bytes, options)`는 Decoded를 반환합니다. bytes는 소유한 pass 순서의 행 버퍼이며, 각 행에 **원래 필터 바이트 1개 + 복원된 packed bytes**가 있습니다. 패딩 비트와 16-bit sample의 바이트 순서를 보존합니다. 이는 deinterlace된 전체 이미지 배열이나 canonical RGBA가 아닙니다. layout의 pass offset/row_bytes로 접근하며 `deinit(allocator)`로 해제합니다. 입력 PNG의 수명을 반환 이후 유지할 필요는 없습니다.

`inspect`는 동일 decode 경로를 호출하고 버퍼를 해제한 뒤 scalar 보고서만 반환합니다. 보고서는 구조 통계, decoded_bytes(필터 바이트 포함), scanlines, 비어 있지 않은 passes, zlib_trailing_bytes, reconstructed_crc32를 포함합니다. CRC는 **필터 바이트를 제외한 pass 순서의 복원 행 바이트**에 적용하며 사용하지 않는 패딩 비트도 포함합니다. 서로 다른 인코딩 간 시각적 동일성 해시가 아닙니다.

이 연결 경로는 모든 행 검사 후 structure.pixels_validated를 true로 설정합니다. 독립 structure.inspect는 여전히 false입니다. 이 플래그는 위 IDAT 데이터 범위의 성공이지 ancillary/APNG/렌더링까지 완료했다는 뜻이 아닙니다. 실패에는 부분 보고서나 부분 버퍼를 반환하지 않습니다.

## 한도·압축 후미

기존 structure의 입력/청크/픽셀 한도를 유지하고 max_decoded_bytes 기본 256 MiB를 추가합니다. 입력과 연결한 IDAT, 해제 버퍼는 별도의 메모리이므로 이 한도를 총 메모리 사용량 한도로 해석하지 않습니다. layout은 `(행 바이트+1)×행 수`를 곱하기 전에 남은 예산을 행 수로 나누어 검사합니다. wasm32와 최대 31-bit 치수에서 정수 오버플로를 허용하지 않습니다. 계산이 한도를 넘으면 압축 입력 연결·해제 할당 전에 거부합니다.

모든 IDAT payload를 하나의 zlib 스트림으로 읽습니다. 청크 경계는 헤더/압축 블록/Adler32를 임의로 나눌 수 있습니다. 해제 출력 한도는 계산한 정확한 행 데이터 크기이며, 부족한 출력은 InvalidPngScanlineSize, 초과 출력은 LimitExceeded입니다.

[PNG §11.2.3](https://www.w3.org/TR/png-3/#11IDAT)의 decoder 권고에 따라 zlib 종료 후 사용하지 않은 압축 후미는 해석하지 않고 zlib_trailing_bytes로 보고합니다. 두 번째 zlib 스트림처럼 보이는 후미도 별도 이미지로 해제하지 않습니다. PNG IEND 뒤 바이트의 구조 오류와는 다릅니다.

## 검증

네이티브는 폭/높이 1~17의 Adam7 pass를 명세 8×8 반복 표와 대조하고, 정확/부족 총 예산·최대 치수·잘못된 Header·packed index 전체 바이트 값·패딩을 검사합니다. 1×1 Adam7의 빈 pass, zlib 각 바이트가 별도 IDAT인 입력, 모든 할당 실패와 늦은 palette 오류에서의 정리도 검사합니다.

적대적 리뷰에서 기존 Header.palette가 직접 생성한 bit_depth=0 Header를 거부하지 않고 1개 palette로 성공하는 누락을 재현했습니다. 공통 validate를 먼저 호출하도록 수정하고, 잘못된 depth 0/3/16/255와 치수 0에 대한 회귀 테스트를 추가했습니다. PNG 바이트 진입점은 기존에도 Header.parse 검증을 거쳤으며, 이번 수정은 직접 Header를 구성하는 보조 API의 경계를 보강합니다.

테스트용 WASM mode 130은 최대 decoded bytes(u32 LE)+PNG를 받아 8개 u32 보고서와 복원 행 버퍼를 반환합니다. 외부 limit은 PNG 입력 크기입니다. 독립 JS oracle은 stride 테이블 대신 명세 타일로 pass를 계산하고 Node zlib로 해제한 뒤 JS 필터 복원과 Node CRC를 적용합니다. 합성 입력은 별도로 알고 있는 원본 행과도 직접 비교합니다.

모든 color/depth 조합·두 interlace 방식·5종 및 혼합 필터·다양한 작은/직사각형 치수, IDAT 모든 분할 위치와 빈 청크, 출력 부족/초과, 압축 잘림/체크섬, 각 pass 행의 잘못된 필터·palette 인덱스, 압축 후미·deferred ancillary·실패 후 회복을 검사합니다. 실제 HWP PNG 32개의 복원 버퍼는 JS oracle과 바이트 단위로 비교합니다. 이 실파일에는 Adam7이 없으므로 실제 interlaced 파일까지 대조했다고 주장하지 않습니다.

최종 수정 후 Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 17/17 단계, 네이티브 351/351, 감사 스크립트 3,166,780 checks를 통과했습니다. PNG 이미지 전용 결과는 정상 2,097건·거부 4,379건입니다. 실제 PNG 32개에서 총 94,928,296바이트의 복원 행 버퍼가 일치했습니다. Header.palette 보강 후 Debug 전체 audit도 다시 실행했습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 24개를 확인했습니다.
