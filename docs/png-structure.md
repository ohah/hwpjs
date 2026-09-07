# PNG 청크 구조·CRC 검사

## 현재 범위

`src/image/png/structure.zig`의 `inspect`는 PNG 시그니처, 청크 경계·CRC, IHDR 필드, PLTE 규칙, 연속 IDAT와 마지막 IEND를 검사합니다. [PNG Third Edition](https://www.w3.org/TR/png-3/)의 §5.2~5.6 및 §11.2가 기준입니다. HWP 전용 레코드 규칙을 넣지 않고 메모리 기반 이미지 계층으로 분리합니다.

**완전한 PNG 디코더/유효성 검사기는 아닙니다.** IDAT의 zlib·필터·픽셀 값·palette 인덱스를 아직 검사하지 않습니다. ancillary chunk는 CRC/경계만 검사하고 의미·순서·중복 조건은 deferred로 보고합니다. APNG·색상 프로필·텍스트 메타데이터·렌더링·저장도 미구현입니다. `pixels_validated`는 항상 false입니다. `IDAT='not zlib'`처럼 CRC와 청크 구조만 맞는 데이터가 이 단계에 성공할 수 있다는 회귀 테스트를 명시적으로 둡니다.

## 책임과 SSOT

- `chunks.zig`: 시그니처, big-endian 길이, ASCII 청크 타입, CRC와 원문 범위. 기존 binary.Reader로 경계를 확인하며 입력을 빌립니다. 실패한 next는 offset/count를 바꾸지 않습니다.
- `header.zig`: 13바이트 IHDR, 양수 31비트 치수, 색상/bit depth 조합, 압축·필터·interlace 필드와 PLTE 크기 제약.
- `structure.zig`: 첫 IHDR, PLTE 위치/단일성, indexed 이미지의 palette 필수, IDAT 연속성, IEND 길이/후미 바이트와 scalar 보고서.

제품 검사 경로는 할당하지 않습니다. CRC는 기존 Zig 표준 라이브러리를 사용하며 별도 CRC 구현을 추가하지 않습니다. CRC 대상은 청크 타입과 payload이고 길이 필드는 제외합니다. 청크 길이의 상위 비트는 금지되므로 `0x80000000` 이상을 allocation이나 offset 계산 전에 거부합니다.

알 수 없는 critical 청크는 UnsupportedPngCriticalChunk입니다. 알 수 없는 ancillary 청크는 의미 미검사로 남깁니다. 세 번째 타입 문자의 예약 비트가 설정된 경우도 decoder의 미래 호환 규칙에 따라 unknown으로 처리하고 `reserved_bit_chunks`에 기록합니다. 예약 비트만으로 ancillary 청크를 거부하거나 기존 알려진 청크와 같은 것으로 대소문자를 접지 않습니다.

## 예산·보고서

기본 한도는 입력 64 MiB, 청크 payload 16 MiB, 청크 65,536개, 이미지 100,000,000픽셀입니다. width×height는 u64로 계산합니다. 픽셀 한도는 압축 해제 버퍼의 할당/검증을 이미 수행했다는 뜻이 아닙니다.

보고서는 header, 전체 청크 수, IDAT 청크/바이트 수, palette 항목 수, ancillary 미검사 청크/바이트 수, 예약 비트 청크 수와 픽셀 검사 여부를 제공합니다. IEND 뒤의 추가 바이트·또 다른 PNG·추가 IEND는 허용하지 않습니다. 개별 빈 IDAT는 청크 계층에서 허용하지만 합쳐진 압축 스트림의 유효성은 후속 검사입니다.

## 검증 범위

후속 [zlib 압축 검증](zlib-validation.md)은 별도 계층에 구현했습니다. 현재 structure.inspect의 IDAT 의미 미검사 계약과 pixels_validated=false는 그대로입니다.
행 단위 [필터 복원](png-filters.md)도 별도 계층이며 아직 PNG 전체 이미지 조립에는 연결하지 않았습니다.

네이티브에서 color type/bit depth 256×256 조합, compression/filter/interlace 각 바이트, 치수 경계, 정확/부족 예산, 잘림 전체 위치, palette와 IDAT 순서, 실패 상태 불변성을 검사합니다. IEND CRC의 고정값 `AE426082`도 대조합니다. 테스트용 WASM mode 126은 동일 보고서를 Node Buffer big-endian 읽기·Node CRC32·독립 배열 순서 oracle과 비교합니다. 합성 입력의 모든 바이트에 단일 비트를 뒤집고 청크 CRC/길이/타입/순서 손상을 검사합니다.

실제 HWP fixture 48개에서 PrvImage 부재 1, PNG 32, GIF 14, JPEG 1, BMP 0개를 관측했습니다. PNG 32개 전체의 청크 구조/CRC와 통계가 독립 oracle과 일치했습니다. 이는 테스트 연결이며 HWP 컨테이너의 PrvImage stream을 제품 검사에서 소비하도록 연결한 상태는 아닙니다. GIF·JPEG·BMP 검증과 픽셀 복원은 후속 범위입니다.

최종 Debug·ReleaseSafe·ReleaseFast audit 모두 17/17 단계, 네이티브 341/341, HWP5 감사 스크립트 3,083,456 checks를 통과했습니다. PNG WASM 전용 결과는 정상 65건·거부 424건이며 실제 PNG 32개가 정상 건에 포함됩니다. 폭/높이 양쪽 경계 및 최대 u64 픽셀 수 검사를 보강한 뒤 최종 Debug 네이티브 전체 검사도 341/341로 재실행했고 Safe/Fast 전체 audit에는 해당 보강이 포함됐습니다. 포맷·변경 JS 문법·관련 문서 로컬 링크 24개를 확인했습니다. 이 수치는 픽셀 디코딩이나 완전한 PNG 지원의 증명이 아닙니다.
