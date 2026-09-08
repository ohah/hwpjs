# JPEG 마커·엔트로피 바이트 경계

## 근거와 범위

[ITU-T T.81 원문](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)의 B.1.1.1~B.1.1.5, Table B.1, F.1.2.3을 기준으로 구현했습니다. 외부 구현 코드를 복사하거나 새 의존성을 추가하지 않았습니다.

이 모듈은 JPEG 검증에 필요한 바이트 경계 계층입니다. SOI/EOI 순서, 프레임·스캔·테이블 의미, restart 순번/간격, DNL/TEM의 위치, Huffman/arithmetic 복호화, 계수·픽셀 및 JFIF/Exif/ICC 메타데이터는 아직 검증하지 않습니다. 단독 성공을 정상 JPEG로 판정하지 않으며 HWP BinData 검사기의 JPEG `unhandled_binaries`를 감소시키지 않습니다.

## SSOT와 수명

- `src/image/jpeg/marker_code.zig`: 마커 코드의 standalone/segment 경계 분류. 예약 코드 02~BF는 길이를 추측하지 않고 별도 미지원 오류를 반환합니다.
- `markers.zig`: 마커 앞 FF fill, big-endian 길이, payload 범위·바이트/개수 한도. 길이는 길이 필드 자체를 포함하고 마커를 제외합니다. payload 안의 FF는 마커로 재해석하지 않습니다. 마커 payload 의미는 검사하지 않습니다.
- `entropy.zig`: 마커 직전까지의 원문과 stuffed zero 수를 반환합니다. 마커 앞 FF fill을 소비하지 않아 기존 마커 리더에 넘길 수 있습니다. FF FF 00을 정상 stuffed FF로 보정하지 않습니다. `coded_bytes`는 stuffed zero를 제외한 엔트로피 바이트 수이며 픽셀 수가 아닙니다.

공통 binary.Reader의 경계 검사를 재사용하며 새 바이트 복사/할당은 없습니다. 원문 뷰는 입력을 빌립니다. 실패는 커서·마커 개수를 변경하지 않습니다. 엔트로피 재개 여부는 상위 스캔 제어 책임이며 SOS나 RST를 임의로 자동 처리하지 않습니다. 엔트로피 구간 끝에는 실제 마커가 필요합니다. 미완성 FF, 종결 마커 없는 입력은 오류입니다.

## 현재 검증 기록

- 네이티브 JPEG 필터: Debug/ReleaseSafe/ReleaseFast 각각 root 포함 7/7 통과. 256개 코드, 모든 65,536개 길이, 모든 단일 엔트로피 바이트, fill, 잘림, 정확한 한도와 한도-1, nonzero offset, borrowed 위치 및 실패 상태 보존을 검사했습니다.
- 테스트용 WASM mode 245는 마커 또는 엔트로피 한 구간을 읽고 consumed/통계/원문을 돌려줍니다. 제품 JS ABI는 변경하지 않았습니다.
- 독립 JS 해석기와 세 모드 WASM에서 각각 비교 541건·거부 211건 통과. 실제 HWP의 JPEG 참조 8건을 순회하여 세 모드 모두 마커와 엔트로피 원문이 일치했고 EOI 뒤 꼬리는 모두 0바이트였습니다. 참고 JPEG `reference/rhwp/samples/s1.jpg`도 Debug에서 마커 28개·엔트로피 15,635바이트의 경계가 일치했습니다. 이 실측은 이미지 복호화 성공의 증거가 아닙니다.
- 네이티브 전체 Debug 723/723 통과. 세 모드 WASM의 마커 5개 결과 필드·엔트로피 3개 결과 필드를 각각 0으로 바꾼 8가지 출력 변형을 독립 JS 검사가 모두 검출했습니다.
- 격리 소스 복사본에서 payload 길이를 `length-2` 대신 `length-1`로 바꾸자 세 모드 모두 7개 중 3개 테스트가 실패했습니다. 별도 복사본에서 `FF FF 00` 거부를 무력화하자 세 모드 모두 7개 중 1개 테스트가 실패했습니다. 두 경우 모두 제품 소스 변경 없이 실제 결함 검출을 확인했습니다.
- 실제 HWP JPEG 순회와 경계 사례를 정규 audit에 연결했습니다. Debug/ReleaseSafe/ReleaseFast 전체 audit는 각각 20/20 단계·723/723 네이티브 테스트·6,995,770회 검사로 통과했습니다. 검사 횟수는 JPEG 또는 HWP 전체 지원률이 아닙니다.

## 후속 검증

프레임/스캔 필드와 참조 → 테이블 내용과 활성화 → 스캔/restart/DNL 상태 → 압축 계수/픽셀을 검증하고 HWP 연결로 확장합니다. 이 계획은 현재 완료 범위가 아닙니다.

실제 8개 참조의 독립 바이트 조사에서 SOF0 7건·SOF2 1건, precision 8, 성분 수 1 또는 3을 관측했습니다. `noori.hwp`의 SOF2는 7개 스캔에 분산된 주파수 구간을 사용했습니다. 따라서 다음 프레임/스캔 계층을 baseline 단일 스캔 전용으로 설계하지 않습니다. 관측값이 명세의 전체 허용값을 대체하지는 않습니다.
