# JPEG 파일 구조·DRI·DNL·재시작 번호

## 근거와 책임

[ITU-T T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf) B.2.1/B.2.4.4/B.2.5와 F.2.1의 마커 위치를 참조합니다. 공식 PDF의 Table B.7/B.10을 이미지로 확인했습니다. 텍스트 추출의 숫자 잔상과 달리 DRI/DNL 세그먼트 길이는 둘 다 4이며, 실제 payload는 2바이트입니다. 외부 코드를 추가하지 않았습니다.

- `scan_fields.zig`: 정확히 2바이트인 big-endian DRI/DNL payload를 읽습니다. Ri는 0~65535, NL은 1~65535입니다. 필드 원값 검사와 사용 시점을 분리합니다.
- `restarts.zig`: 재시작 활성화와 번호 순서를 소유합니다. 새 이미지의 Ri는 0, DRI는 이후 스캔에 적용되며 Ri=0이면 비활성화합니다. 각 스캔은 RST0부터 시작하고 RST7 다음은 RST0입니다. 실패 시 다음 번호·누적 개수를 변경하지 않습니다. 실제 MCU 간격 계산은 이 계층에 넣지 않습니다.
- `structure.zig`: 기존 marker/entropy/frame/scan 파서를 조립합니다. SOI·단일 비계층 Frame·하나 이상의 SOS·EOI를 요구하고 DRI/DNL/RST 위치를 검사합니다. DNL 뒤에는 마커 읽기로 돌아갑니다. 기본적으로 EOI 뒤 바이트는 거부하며 `allow_trailing_bytes`를 명시하면 개수를 보고합니다.

코어는 할당하지 않으며 반환 보고서는 scalar만 포함합니다. 입력 경계는 기존 Reader/marker Iterator가 소유합니다. 기본 한도는 입력 64 MiB·마커 65,536개·payload 65,533바이트·성분 255개(기존 progressive 파서는 최대 4개)·픽셀 100,000,000개·스캔 65,536개·재시작 65,536개이며 옵션으로 조정합니다. 헤더 높이와 DNL 유효 높이에 픽셀 예산을 각각 적용합니다.

## DNL의 의미와 검사 경계

DNL은 첫 스캔을 종료하는 위치에서 한 번만 허용됩니다. SOF의 Y=0이면 필수이며, Y가 이미 있어도 DNL로 다시 정의할 수 있으므로 두 값의 불일치를 오류로 삼지 않습니다. 보고서에 `header_height`와 `effective_height`를 따로 둡니다. DNL 이전에 다른 마커로 첫 스캔이 끝났거나, 두 번째 스캔 이후/중복 위치에 등장하면 거부합니다.

재정의한 높이와 실제로 부호화된 MCU 행의 일치, DNL 위치가 정수 MCU 행 경계인지, Ri와 실제 MCU 개수/마지막 간격의 일치, lossless Ri의 MCU 행 배수 조건은 아직 복호화 계층의 후속 검사입니다. 빈 엔트로피 구간·누락 재시작을 헤더만으로 완전히 검증했다고 주장하지 않습니다.

이 검사는 테이블 payload/선택/progressive 이력을 재구현하지 않습니다. 실제 HWP 검증은 기존 해당 검사와 함께 실행합니다. 구조 보고서는 `semantics_deferred=true`이며 테이블 없는 합성 구조가 통과해도 완전한 JPEG라는 뜻은 아닙니다. 계층형 이미지·tables-only 생략 형식·TEM/미해석 확장 마커는 현재 이 진입점에서 지원하지 않습니다. APP/COM/DQT/DHT/DAC는 경계만 통과시키고 내용 의미는 별도입니다. 제품 JS API와 HWP JPEG 미지원 집계는 변경하지 않았습니다.

## 검증 기록

- 새 네이티브 6개와 기존 JPEG 테스트 포함 세 모드 각각 41/41 통과. DRI/DNL 전체 u16 값, 각 재시작 기대 번호 × 모든 바이트, 잘림·정확한 길이·순서·스캔별 번호 초기화·비활성화·예산 복구를 포함합니다.
- 독립 JS와 mode 250 WASM 비교는 세 모드 각각 131,137건·오류 거부 60건 통과. SOF 높이와 다른 DNL 허용, 필수 DNL 누락·위치 오류·DNL 뒤 엔트로피 재개 거부, wrap·재시작 리셋·trailing 정책을 확인합니다.
- 실제 HWP의 JPEG 참조 8건과 참고 `s1.jpg`가 세 모드에서 통과했습니다. `shapecontainer-2.hwp`의 JPEG에는 재시작 마커 10개가 있어 순환 번호도 실제 파일에서 확인했습니다. HWP JPEG 8건 모두 DNL은 없었으므로 DNL 경계 검증은 합성 입력 근거입니다. 픽셀 복호화 대조는 아닙니다.
- 기존 테스트용 `jpegFramingActual`의 DNL 뒤 엔트로피 재개를 제거했습니다. DNL은 스캔 종료 마커이며, 이 순회 수정과 별개로 제품 구조 파서의 거부 사례를 검사합니다.
- Debug/ReleaseSafe/ReleaseFast 전체 audit는 각각 20/20 단계·757/757 네이티브 테스트·7,165,246건 검사로 통과했습니다. 이는 전체 회귀 검사 합계이며 JPEG 픽셀 복호화나 전체 문서 구현 완료를 뜻하지 않습니다.

### 추가 적대적 검증

별도 소스 복사본에 아래 결함을 각각 하나씩 적용하고 `zig test <copy>/src/root.zig --test-filter JPEG`를 Debug/ReleaseSafe/ReleaseFast로 실행했습니다. 모든 변형은 컴파일 성공 후 각 모드에서 41개 중 2개 테스트에 의해 검출됐습니다.

- `restarts.zig`의 스캔 시작 시 번호 0 초기화를 삭제 → 새 스캔의 정상 RST0가 `InvalidJpegRestartSequence`.
- `structure.zig`에 SOF 높이와 DNL 높이의 동일성 강제를 추가 → 정상 재정의가 `InvalidJpegNumberOfLines`, 기대 예산 오류도 달라져 검출.
- DNL에서 스캔 종료를 건너뛰도록 변경 → 높이 미정 사례의 잘못된 `MissingJpegDnl`과 DNL 뒤 데이터의 오허용을 검출.

별도 mode 250 출력의 13개 u32 필드 각각 첫 바이트를 XOR 1로 변조했습니다. 세 모드 각각 13종 모두 독립 JS assertion으로 검출했습니다. 소스 결함 검출과 출력 비교 민감도는 별도 결과입니다.
