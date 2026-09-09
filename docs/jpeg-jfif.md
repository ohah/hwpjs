# JPEG JFIF 헤더 작업

JFIF 헤더 해석과 아래 범위의 검증을 구현했습니다. APP0 payload 해석 성공은 전체 JFIF 적합성이나 색 변환 완료를 뜻하지 않습니다.

후속 [JFXX 확장 작업](jpeg-jfxx.md)은 별도 계약과 검증 기록으로 관리합니다.
파일 내 순서·중복·연속성은 [JFIF/JFXX 배치 검사](jpeg-jfif-layout.md)가 소유합니다.

## 공식 근거

- [ITU-T T.871 본문](https://www.itu.int/rec/T-REC-T.871-201105-I/en): 6.1~6.5, 10.1의 JFIF 식별자·밀도·썸네일·프레임 제약.
- [2013 Erratum 1](https://www.itu.int/rec/T-REC-T.871-201303-I!Err1/en): 실제 PDF를 확인했으며 페이지 머리말의 ISO 발행 연도를 2013으로 고치는 정오표입니다. 필드 배치나 색 변환 수식을 변경하지 않습니다.
- [원래 JFIF 1.02 문서](https://www.w3.org/Graphics/JPEG/jfif3.pdf): 구현 조언에서 major 버전 호환성을 설명합니다. T.871의 엄격한 출력 버전 1.02 조건과 과거 1.x 입력 호환 해석을 구분합니다.

## 책임과 제한

`src/image/jpeg/jfif.zig`의 `Header.parse`는 APP0 마커와 길이 필드를 제외한 payload를 받습니다. 기존 마커 파서가 세그먼트 경계를 소유하며 이 파서는 65,533바이트 상한도 확인합니다.

- 식별자는 정확한 `JFIF\0` 5바이트입니다.
- version은 big-endian u16 원값으로 보존합니다. Major 1의 공통 헤더 배치를 읽고 minor를 바꾸지 않습니다. 다른 major는 `UnsupportedJfifVersion`입니다. 미래 minor의 모든 확장 의미를 지원하거나 1.01을 T.871 1.02 적합 파일로 인증한다는 뜻은 아닙니다.
- units는 종횡비 전용/인치당 밀도/센티미터당 밀도의 세 값만 허용합니다. 두 밀도는 nonzero big-endian u16입니다. 픽셀 종횡비는 Vdensity:Hdensity이므로 두 필드를 반대로 정규화하지 않고 원값을 반환합니다.
- 썸네일은 두 u8 치수와 정확한 `3 * width * height` RGB 바이트를 빌립니다. 어느 치수든 0이면 RGB 바이트 수는 0이며 다른 치수 원값은 유지합니다. 잘림과 여분 바이트는 거부합니다.
- `validateFrame`은 이미 파싱된 프레임의 정밀도 8, 성분 수 1 또는 3, 선언 순서의 ID 1/2/3을 확인합니다. 마커 위치와 다른 메타데이터의 충돌은 확인하지 않습니다.

할당하지 않으며 썸네일 뷰를 쓰는 동안 입력을 불변·유효하게 유지해야 합니다. JFXX 확장과 APP0 위치·중복·연속성은 위의 별도 모듈이 소유합니다. Exif/Adobe/ICC와의 색 해석 정책, 업샘플링·색 변환은 후속 단계입니다. 제품 HWP 이미지 지원 상태도 아직 바꾸지 않습니다.

## 현재 검증과 관측

- Debug JPEG 네이티브 88/88개 통과. u16 버전 전체, units 바이트 전체, 밀도 범위 전체, 썸네일 치수 256×256 조합의 세그먼트 상한·원본 뷰를 검사했습니다. 헤더/썸네일 잘림, 식별자 손상, 여분 바이트, 프레임 정밀도·성분 수·ID 오류도 검사했습니다.
- 실제 HWP JPEG 참조 8건의 첫 SOS 이전 APP 마커를 읽기 전용으로 조사했습니다. 모두 offset 2에 14바이트 JFIF payload가 있었으며 1.01은 6건, 1.02는 2건입니다. 공통 thumbnail 치수는 0×0입니다. 같은 이미지의 중복 참조를 포함합니다.
- `noori.hwp`의 progressive JPEG와 `shapecontainer-2.hwp`의 grayscale JPEG에는 Exif·Photoshop·XMP·Adobe 마커도 있습니다. 따라서 JFIF 하나만 읽고 다른 메타데이터까지 처리했다고 보고하지 않습니다.

## WASM 독립 대조와 적대적 검증

테스트 전용 mode 261은 JFIF payload를 입력받고 u32 7개(version/units/Hdensity/Vdensity/썸네일 폭/높이/RGB 길이)와 원래 RGB 바이트를 반환합니다. Mode 262는 SOF 코드와 프레임 payload를 받아 JFIF 프레임 제약을 확인하고 width/height/precision/성분 수의 u32 4개를 반환합니다. 입력·출력 한도를 별도로 확인하며 제품 ABI는 바꾸지 않습니다.

`tests/hwp5/jpeg-jfif.mjs`는 직접 바이트 위치와 JS 정수 계산으로 기대 결과를 만듭니다. Debug WASM 비교 67,414건·거부 66,003건이 통과했습니다. 전체 버전·단위·밀도 범위와 여러 썸네일 경계, 잘림·식별자·여분 바이트·출력 한도, 프레임 ID의 모든 바이트 값을 포함합니다.

실제 HWP JPEG 참조 8건과 `reference/rhwp/samples/s1.jpg`에서 각각 JFIF payload 1개와 프레임 제약을 새 파서로 대조하여 통과했습니다. 이 실파일 검사는 첫 SOS 이전의 관측 헤더를 검사하며 APP0 위치/중복의 완전한 검증기를 대신하지 않습니다. 정규 audit와 컨테이너 검사에 연결했습니다.

Debug에서 17×19 썸네일을 포함한 출력 997바이트 각각에 XOR 1을 적용해 모두 검출했습니다. 원래 버전 비트 변조, 0 밀도 허용, 썸네일 바이트 수의 RGB 3배 누락은 별도 소스 복사본 `/tmp/hwpjs-jfif-mutants.CORp8K/`에서 세 모드 모두 컴파일 후 테스트 실패로 검출했습니다. 각 모드 JPEG 88개 중 각각 1/1/2개 실패입니다.

ReleaseSafe/ReleaseFast 독립 WASM에서도 각각 비교 67,414건·거부 66,003건, 실제 HWP 8개 참조 및 `s1.jpg`의 헤더/프레임 제약, 출력 997바이트 개별 변조 검사를 통과했습니다. 정규 전체 audit의 완료와 별도 실행 결과를 구분합니다.

Debug/ReleaseSafe/ReleaseFast 전체 audit는 각각 20/20 단계, 네이티브 804/804개, 총 7,650,451건 검사로 통과했습니다. 로그는 `/tmp/hwpjs-jfif-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 있습니다. 전체 회귀 합계이며 전체 문서 지원 완료를 뜻하지 않습니다.

이번 APP 조사와 헤더 대조는 픽셀 동일성이나 전체 JFIF 적합성 검증이 아닙니다.
