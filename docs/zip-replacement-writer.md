# ZIP 선택 항목 교체 저장

## 계약과 책임

`src/zip/replace_writer.zig`는 입력 ZIP과 해제된 교체 바이트를 빌리고 새 출력 바이트를 소유해 반환합니다. 호출자가 같은 할당자로 출력을 해제합니다. 입력은 변경하지 않습니다. 기존 [ZIP 읽기 경계](hwpx-zip-container.md)가 framing을 검증하며, 저장기는 그 검증에서 얻은 local/central 범위를 재사용합니다. HWPX XML 편집 모델이나 WASM 세션은 이 모듈의 책임이 아닙니다.

교체 목록의 인덱스 중복·범위·개별 해제 크기·출력 크기를 검사합니다. 선택한 원본 payload를 해제해 길이·CRC를 확인한 뒤 비교하므로 손상된 선택 항목을 새 내용으로 덮어 숨기지 않습니다. 무변경 저장은 입력을 바이트 단위로 복사합니다. 선택하지 않은 항목의 CRC 검증은 별도 전수 무결성 계층의 책임입니다.

물리적 local 순서와 central 순서를 별도로 유지합니다. 미변경 local record, 헤더의 이름·extra, central extra·주석·속성, local 사이의 opaque gap, archive comment를 복사하고 central local offset과 변경 항목의 CRC·크기를 갱신합니다. bit 3의 12/16바이트 descriptor 형태를 유지합니다. CRC `0xffffffff`는 유효하며 ZIP64 크기 sentinel과 혼동하지 않습니다.

저장 방식 0은 그대로, DEFLATE 8은 기존 RFC1951 stored-block encoder로 재생성합니다. 압축 방식은 유지하지만 압축률은 최적화하지 않습니다. 기본 출력 한도는 128MiB이며 classic ZIP 범위를 넘지 않습니다. ZIP64·암호화·분할 ZIP은 읽기 경계와 동일하게 거부합니다. 복사한 미해석 extra/opaque 데이터에 내부 offset·서명·해시 의미가 있다면 이를 재계산하지 않습니다. 따라서 임의 ZIP 확장까지 의미적으로 무손실이라고 주장하지 않습니다.

## 검증

2026-10-01 집중 ReleaseSafe 검사 7/7(root 포함): 실제 DEFLATE section 교체, 미변경 raw local 보존, 무변경 저장, 중복/잘못된 인덱스, descriptor 양식, all-ones CRC, central/physical 순서 불일치, 다중 교체·빈 내용·출력 한도 경계, 선택 payload 손상 거부·원본 보존, 합성 저장 경로의 모든 할당 실패가 통과했습니다.

`src/zip_replacement_survey.zig`는 생성 ZIP을 stdout으로 전달하고 `tools/zip-replacement-oracle.py`는 독립 Python `zipfile`과 XML parser로 검사합니다. Git 추적 HWPX 픽스처 중 암호화 파일을 제외한 정확한 44개/499개 항목에서 CRC·목록 순서·변경 XML·나머지 payload·타임스탬프·extra·주석·속성·압축 방식이 일치했습니다. 원본 및 생성 파일을 디스크에 쓰지 않습니다. 이 검사는 XML 끝의 주석 추가이며 문서 텍스트 편집·조판·한컴 GUI 호환성 증명이 아닙니다.

Debug·ReleaseSafe·ReleaseFast 집중 검사는 각각 7/7, 전체 ReleaseSafe native 검사는 7/7 단계·2,716/2,716 테스트·종료 코드 0으로 완료됐습니다. Python 일반·최적화 모드의 독립 전수 비교가 모두 통과했습니다.

실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.
