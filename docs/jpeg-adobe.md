# JPEG Adobe APP14 원값과 색 해석 경계

## 근거와 범위

[libjpeg-turbo의 APP14 판독](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/src/jdmarker.c)은 5바이트 `Adobe` 뒤 version/flags0/flags1을 big-endian u16으로, offset 11을 transform으로 읽습니다. 필드 배치 확인에 사용했으며 외부 코드를 이식하거나 의존성으로 추가하지 않았습니다. Adobe Technical Note 5116 원문은 확보하지 못했으므로 flags 비트의 의미나 원문 전체 적합성을 주장하지 않습니다.

[ITU-T T.872](https://www.itu.int/rec/T-REC-T.872-201206-I/en) 6.5.3은 인쇄 응용의 규칙입니다. 일반적인 5바이트 판독과 달리 `Adobe` 뒤 여섯 번째 NUL까지 식별자로 요구합니다. 이 차이를 숨기거나 version 상위 바이트를 버리지 않습니다.

## 책임과 소유권

- `src/image/jpeg/adobe.zig`: 최소 12바이트·최대 65,533바이트 payload를 읽습니다. 세 u16 필드, 미지 transform 값, 12바이트 이후 extra를 그대로 보존합니다. Header는 값으로 반환하며 extra만 입력을 빌립니다.
- `Header.hasPrintIdentifier`: 원래 여섯 번째 바이트가 NUL인지 확인합니다.
- `Header.printEncoding`: 식별자를 확인한 뒤 3/4성분에 대한 T.872의 국소 대응만 반환합니다. transform 0은 RGB 또는 보수 CMYK, 1은 3성분 YCbCr, 2는 4성분 YCCK입니다. 미지 값이나 맞지 않는 성분 수를 RGB로 보정하지 않습니다. 단일 성분 gray 해석은 상위 계층 책임입니다.
- `adobe_inspection.zig`: 기존 JPEG 전체 구조 순회를 재사용합니다. APP14 중 5바이트 식별자가 일치하는 것만 Header.parse로 넘기며, 잘린 일치 payload는 오류로 반환합니다. 다른 APP14는 불투명 데이터입니다. 스캔 뒤를 포함하여 모든 헤더를 물리적 순서로 보존하고 중복 덮어쓰기나 충돌 해결을 하지 않습니다.

Report는 descriptor 배열을 소유하고 extra는 원본 JPEG를 빌립니다. 입력 수명을 유지하고 Report.deinit으로 배열을 해제해야 합니다. 기본 최대 헤더 수는 256이며 추가 전에 검사합니다. 뒤쪽 JPEG 손상과 할당 실패에도 임시 배열을 정리합니다.

T.872 국소 색 대응의 성공은 전체 인쇄 적합성을 뜻하지 않습니다. 프레임 제약·ICC 배치·메타데이터 우선순위·progressive 픽셀 복호화·CMYK/YCCK 픽셀 변환·색 관리는 별도입니다. 원값 파싱은 RGB 출력이나 HWP BinData JPEG 연결 완료가 아닙니다. 제품 JS API는 변경하지 않았습니다.

이후 명시적 [JFIF RGB 조립](jpeg-rgb.md)은 별도 충돌 정책을 적용합니다. printEncoding을 일반 JFIF 색 판별기로 재사용하지 않으며 원값 검사와 파일별 해석을 구분합니다.

## 검증 기록

테스트용 bridge mode 274는 payload를 여섯 u32 필드(version/flags0/flags1/transform/extra 길이/인쇄 식별자 여부)와 extra로 반환합니다. mode 275는 최대 헤더 수와 전체 JPEG를 받아 개수와 각 헤더를 반환합니다. mode 276은 성분 수와 payload를 받아 국소 색 대응을 반환합니다. 이 wire는 제품 ABI가 아닙니다.

네이티브 필터 테스트 5/5(root 집계 포함)가 통과했습니다. 모든 u16 값과 transform 바이트, 잘림·식별자·크기 상한, 빌린 extra, 할당 실패, 스캔 전후의 서로 다른 헤더 순서를 확인했습니다. 동일 헤더 반복만으로는 순서 오류를 잡지 못하므로 다른 version/transform/extra를 사용한 사례를 추가했습니다.

독립 JS는 고정 offset 읽기와 기존 독립 JPEG 경계 해석기를 사용합니다. ASCII 변환이 상위 비트를 숨길 수 있어 식별자는 원시 바이트로 비교하고 high-bit 손상도 거부합니다. 정상 비교 65,812건·오류 거부 998건이 Debug/ReleaseSafe WASM에서 각각 통과했습니다. 최대 256개 및 257번째 거부, 미지 값, 서로 다른 헤더 순서, 스캔 뒤 APP14, 출력 한도를 포함합니다. 출력 82바이트의 개별 XOR 1 변조도 두 모드에서 모두 검출했습니다.

실제 HWP JPEG 참조 8건의 전체 순회가 독립 결과와 일치했습니다. noori.hwp의 APP14는 extra 19바이트, shapecontainer-2.hwp는 extra 0바이트이며 나머지 6참조에는 Adobe APP14가 없습니다. 별도 s1.jpg는 1개 헤더·extra 0바이트입니다. Debug/ReleaseSafe에서 대조했습니다. 참조 수는 고유 이미지 수가 아니며 실제 CMYK/YCCK 출력 일치 검증으로 확대하지 않습니다.

ReleaseFast 독립 WASM에서도 비교 65,812건·거부 998건, 출력 82바이트 변조 검출, 실 HWP 8참조 및 s1.jpg 대조가 통과했습니다.

`/tmp/hwpjs-jpeg-adobe-mutants.h39f55/`의 격리 소스 복사본에서 endian 반전, extra 삭제, 인쇄 식별자 검사 무력화, 수집 한도 off-by-one을 주입했습니다. 네 변형 모두 세 빌드 모드에서 컴파일 후 테스트 실패로 검출했습니다. 각 필터 5개 중 실패는 순서대로 3/3/2/1개입니다. 제품 소스에는 변형을 적용하지 않았습니다.

전체 회귀를 Debug → ReleaseSafe → ReleaseFast 순서로 완료했습니다. 각 모드 모두 20/20단계·831/831 네이티브 테스트·checks 7,793,133건으로 통과했습니다. 로그는 `/tmp/hwpjs-jpeg-adobe-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 검사 수는 지원률이나 전체 JPEG/HWP 적합성의 증명이 아닙니다. 전체 회귀 후 최종 네이티브 831/831 테스트와 제품 ReleaseSafe 빌드 5/5단계도 확인했습니다.
