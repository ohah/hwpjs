# Raw DEFLATE stored encoder

## 계약

`compression/raw_deflate.zig`의 `encodeStored`는 RFC 1951 raw stream을 stored block만 사용해 생성합니다. zlib/gzip 헤더·trailer를 붙이지 않으며 압축률보다 단순하고 결정적인 호환성을 목표로 합니다. HWP의 압축 stream 저장에서 사용할 기반 계층이고 BinData 정책 선택 자체는 소유하지 않습니다.

각 block은 byte-aligned `BFINAL/BTYPE=00`, little-endian `LEN`, 1의 보수 `NLEN`, 원문 순서입니다. 최대 payload는 u16 최대값 65,535바이트이고 빈 입력도 final empty block 하나로 표현합니다. 출력 크기는 `입력 길이 + 5 × block 수`로 선계산하며 overflow와 caller 한도를 확인한 뒤 한 번만 할당합니다.

## 검증

빈 입력과 `abc`는 알려진 stored-block wire 전체 바이트와 정확히 대조합니다. 길이 0, 1, 65,534, 65,535, 65,536, 131,070, 131,071바이트에서는 독립 block walker가 header 값, LEN/NLEN, block 수, payload 전부와 정확한 끝을 검사합니다. 같은 결과를 기존 raw DEFLATE decoder로 다시 풀어 원문과 대조합니다. 정확한 출력 한도는 성공하고 1바이트 부족은 할당 전에 `LimitExceeded`입니다. 각 길이의 모든 할당 실패 지점도 검사합니다.

최대 block payload를 65,534로 축소, final bit를 모든 block에 설정, NLEN 보수 제거, payload를 0으로 대체, 정확한 한도를 거부하는 다섯 소스 변형을 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. final 변형의 최초 미사용 loop capture와 payload 변형의 최초 타입 오류는 폐기하고 컴파일 가능한 동일 의미 변형으로 다시 실행했습니다. 유효한 15개 조합 모두 컴파일 성공 후 실제 assertion 실패와 종료 코드 1로 검출했으며 컴파일 실패나 trap은 세지 않았습니다. 격리 로그는 `/tmp/hwpjs-raw-deflate-encode-mutants.5RO5vp`에 남겼습니다.

## 남은 범위

이 encoder는 Huffman/LZ 압축을 하지 않으므로 기존 압축 stream보다 결과가 커질 수 있습니다. HWP FileHeader와 BinData 항목별 압축 정책, 선택한 외부 CFB stream 교체, 선택적 CRC32/ISIZE trailer는 후속 상위 계층이 담당합니다.
