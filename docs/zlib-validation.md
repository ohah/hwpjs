# zlib 압축 검증

## 범위와 책임

`src/compression/zlib.zig`는 [RFC1950 §2.2~2.3](https://www.rfc-editor.org/rfc/rfc1950.txt)의 CM=8 스트림을 검사합니다. CMF/FLG의 압축 방식, CINFO 0~7, FCHECK 나머지, FDICT, 압축 데이터, big-endian Adler32를 확인합니다. preset dictionary는 UnsupportedZlibDictionary로 거부하며 dictionary 지원 전체를 주장하지 않습니다. FLEVEL은 해제 결과에 영향을 주지 않습니다.

- `zlib.decode`: 정확히 한 스트림을 해제합니다. 후미 바이트는 TrailingData입니다.
- `zlib.decodePrefix`: 첫 스트림의 체크섬까지 검사한 뒤 소유한 bytes와 consumed를 반환합니다. 후미 바이트 정책은 상위 형식 책임입니다.
- `raw_deflate.decodePrefixWindow`: 기존 bounded DEFLATE 루프를 재사용하고 참조 거리 한도를 전달합니다. 기존 decode/decodePrefix는 32768 기본값을 유지합니다.
- `flate/Decompress.zig`: fixed/dynamic match 두 경로 모두 선언 한도 초과를 거부합니다. 입력 헤더·Adler32 정책을 이 저수준 디코더의 기존 zlib 모드에 의존하지 않습니다.

출력은 호출자 allocator로 할당하고 호출자가 해제합니다. 실패 시 부분 출력은 해제합니다. max_output을 해제 중 적용하며 정확한 한도에서 한 바이트를 더 확인해 EOF와 초과를 구분합니다. 압축 입력은 빌린 slice이며 별도 입력 한도는 상위 호출자가 적용해야 합니다. 내부 작업 버퍼는 기존 최대 window를 유지하므로 작은 CINFO가 메모리 사용량까지 줄여 주는 구현은 아닙니다.

## PNG 연결 경계

[PNG §10](https://www.w3.org/TR/png-3/#10Compression)은 dictionary 없는 zlib를 사용하며 IDAT payload를 합친 하나의 스트림을 해제합니다. 청크 경계는 zlib 헤더·블록·체크섬을 나눌 수 있습니다. [§11.2.3](https://www.w3.org/TR/png-3/#11IDAT)은 마지막 IDAT의 사용하지 않은 후미 바이트를 decoder가 무시하도록 권고하므로, 후속 PNG 연결은 strict decode의 후미 거부를 그대로 적용하지 않고 decodePrefix의 consumed를 이용해야 합니다.

현재 제품 PNG structure.inspect에는 연결하지 않았습니다. 필터 복원, scanline 길이, Adam7, palette 인덱스, 이미지 의미·렌더링도 후속 범위입니다. zlib 성공만으로 pixels_validated를 true로 바꾸지 않습니다. HWP 압축 trailer는 CRC32/ISIZE 형식으로 별도이며 zlib Adler32와 혼합하지 않습니다.

## 검증

네이티브는 65,536가지 헤더, 알려진 빈 스트림/abc 체크섬, 모든 잘림 위치, 후미/연결 스트림, 정확·부족 출력 한도와 할당 실패 정리를 검사합니다. 초기 할당 실패 테스트가 의도적으로 주입된 OutOfMemory를 InvalidChecksum으로 기대한 오류를 확인하고, OOM은 주입 검사기로 전파하도록 테스트를 수정했습니다.

테스트 전용 WASM mode 127은 strict 출력, mode 128은 consumed(u32 LE)+prefix 출력을 제공합니다. Node zlib와 stored/fixed/dynamic, 32 KiB 이상 반복 입력, 모든 헤더, 손상 체크섬, 잘림, 후미·연결 스트림을 대조합니다. 직접 작성한 fixed Huffman bit fixture로 각 CINFO의 정확한 최대 거리와 한 칸 초과를 구분하고 dynamic 경로도 별도로 초과를 검사합니다. 정상 데이터의 해제 결과는 Node로 대조하지만 손상된 window 선언의 기대값은 명세와 직접 구성한 거리가 기준입니다.

실제 HWP의 PNG IDAT는 테스트에서 추출·연결해 Node inflate 결과와 바이트 단위로 비교합니다. 이는 이미지 픽셀 검사나 제품 PrvImage 연결이 아닙니다.

최종 Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 17/17 단계, 네이티브 344/344, 감사 스크립트 3,149,467 checks를 통과했습니다. zlib 전용 WASM은 정상 156건·거부 65,855건이며 실제 PNG 32개, 해제 결과 94,928,296바이트가 Node와 일치했습니다. 별도 일회성 단일 비트 변형 5,000회도 양쪽 모두 거부했고 수락/거부 차이는 없었습니다. 이 추가 실험은 기본 audit 검사 수에 포함하지 않습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 15개도 확인했습니다.
