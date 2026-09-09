# JPEG ICC 조각 재조립과 구조 검사

## 공식 근거와 범위

[ICC 프로파일 삽입 안내](https://www.color.org/profile_embedding/)와 [ICC Technical Note: Embedding ICC profiles](https://archive.color.org/files/technotes/ICC-Technote-ProfileEmbedding.pdf)의 JFIF 절을 확인했습니다. ICC.1:2022의 변경 이력은 예전 Annex B 삽입 설명을 이 기술 문서 참조로 대체했다고 명시합니다.

APP2 payload는 정확한 `ICC_PROFILE` + NUL 식별자, 1부터 시작하는 조각 번호, 전체 조각 수, 데이터로 구성됩니다. 조각당 데이터 상한은 65,519바이트이며 최대 255조각·16,707,345바이트입니다. 번호 순으로 재조립하므로 파일에 저장된 물리적 순서를 가정하지 않습니다. 조각 수 불일치·번호 중복·누락은 오류입니다. 동일 데이터를 가진 중복 번호도 정상 조각으로 덮어쓰지 않습니다.

## 책임과 소유권

- `icc_chunks.zig`: 단일 payload 해석과 255개 고정 슬롯 Collector. 입력을 빌려 보관하고 추가 실패 시 기존 상태를 유지합니다. 조립 시 한 번 할당한 원문을 번호 순으로 복사합니다. 조립 실패는 수집 상태를 소비하지 않으며 반복 조립도 가능합니다.
- `icc_extraction.zig`: 기존 전체 JPEG 구조 순회를 재사용하여 APP2를 수집합니다. 전체 구조 검사와 누락 검사가 끝난 뒤 소유권 있는 재조립 바이트를 반환합니다. 중간에 새 JPEG 마커 파서를 복제하지 않습니다. 정확한 식별자가 없는 다른 APP2는 불투명 데이터로 남깁니다.
- `icc_profile.zig`: 기존 ICC extent/태그 테이블/프로파일 ID 검사기를 호출합니다. 태그 배치 정책은 필수 옵션이며 버전에서 임의 추정하지 않습니다. 결과는 재조립 바이트와 태그 descriptor를 소유하고, JPEG 입력을 해제한 뒤에도 태그 데이터가 유효합니다. deinit은 descriptor부터 해제합니다.

ICC가 없으면 null입니다. 번호가 완비된 빈 조각 데이터는 재조립 단계에서 소유권 있는 빈 slice로 구분하지만, ICC 내용 검사에서는 잘못된 프로파일 크기로 거부합니다. 조각 재조립이 유효 ICC 인증을 대신하지 않습니다.

전체 JPEG 순회이므로 첫 스캔 뒤 APP2도 관측합니다. 이 추출기는 별도의 JFIF 배치 적합성 검사나 특정 응용 프로그램의 메타데이터 위치 정책을 인증하지 않습니다. 조각 데이터에 재귀하거나 압축 해제를 적용하지 않습니다.

[T.872 인쇄 응용](https://www.itu.int/rec/T-REC-T.872-201206-I/en) 6.5.2는 여러 ICC APP2 조각이 첫 SOS 전에 있어야 한다고 요구합니다. 현재 일반 추출기는 이 인쇄용 위치 규칙을 적용하지 않으므로 T.872 적합성 검사로 사용하지 않습니다. 관련 [Adobe APP14 해석](jpeg-adobe.md)도 원값 보존과 응용별 규칙을 구분합니다.

ICC 내용 진입점도 헤더 의미·필수 태그·모든 payload 의미·색 공간과 JPEG 성분의 호환성·색 변환을 완료하지 않습니다. `semantics_deferred`는 유지합니다. v4 프로파일 ID는 명세의 MD5 식별자 검사이지 인증 수단이 아닙니다. Adobe/Exif와의 우선순위 및 RGB 출력 선택은 후속 범위입니다.

## 검증 기록

JPEG 네이티브 111/111개가 통과했습니다. 모든 count/sequence 바이트 조합, 식별자·잘림·payload 상한, 역순 255조각, 중복/불일치/한도 실패 후 상태 유지, 조립 소유권, 모든 할당 실패 지점, v4 ID 검증 및 손상·태그 예산 오류를 확인했습니다. 최대 크기의 255조각을 조립하고 한도에서 1바이트 부족한 경우도 검증했습니다. 입력 소유권 테스트는 원래 값이 254인 바이트를 0으로 바꾸도록 하여 영 값의 우연한 일치를 피했습니다.

테스트용 mode 271은 길이 접두사 payload 목록을, mode 272는 전체 JPEG를 받아 count/length/재조립 원문을 반환합니다. mode 273은 명시적 배치 정책·태그 한도로 ICC 내용 검사를 하고 태그 수·ID 상태도 반환합니다. 제품 JS API는 변경하지 않습니다.

`tests/hwp5/jpeg-icc.mjs`는 고정 슬롯 대신 조각 배열을 정렬하고 번호 전체가 연속인지 대조합니다. 태그 테이블과 ID는 기존 독립 JS 기준식을 재사용합니다. Debug 비교 817건·거부 66,021건이 통과했습니다. 순서/역순/회전 순열, 빈 조각, 최대 16,707,345바이트, 잘림·출력 한도, 스캔 뒤 APP2, v2/v4·두 배치 정책·여러 분할 위치와 손상 ID를 포함합니다. 출력 500바이트의 개별 XOR 1 변조도 모두 검출했습니다.

실 HWP JPEG 참조 8건과 `reference/rhwp/samples/s1.jpg`의 전체 마커 순회에서는 ICC 조각이 0개였고 독립 결과와 일치했습니다. 이는 실제 ICC 포함 JPEG의 재조립 검증으로 보고하지 않습니다. 합성 ICC fixture는 구조 검사용이며 완전한 색 프로파일의 의미 인증이 아닙니다.

ReleaseSafe와 ReleaseFast의 별도 WASM에서도 각각 비교 817건·거부 66,021건, 출력 500바이트 개별 변조 검출, 실 HWP JPEG 참조 8건과 s1의 ICC 부재 대조가 통과했습니다.

`/tmp/hwpjs-jpeg-icc-mutants.df8JcC/`의 별도 소스 복사본에서 중복 금지 제거, count 일치 검사 제거, 바이트 예산 검사 제거, 조립 순서 역전, ID 검사를 not_calculated로 대체하는 다섯 결함을 주입했습니다. 모두 Debug/ReleaseSafe/ReleaseFast에서 컴파일 후 테스트 실패로 검출했습니다. 각 모드의 JPEG ICC 테스트 7개 중 실패 수는 각각 1/1/2/1/1개였습니다.

전체 회귀를 Debug → ReleaseSafe → ReleaseFast 순서로 완료했습니다. 각 모드 모두 20/20 단계, 네이티브 827/827개, checks 7,726,323건이 통과했습니다. 로그는 `/tmp/hwpjs-jpeg-icc-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 검사 건수는 ICC 의미 검증이나 JPEG 전체 지원률을 뜻하지 않습니다.

SSOT 검토에서는 조각 규칙과 재조립을 `icc_chunks.zig`, JPEG 연결을 `icc_extraction.zig`, 기존 ICC 검사기의 조립과 소유권을 `icc_profile.zig`로 분리한 것을 확인했습니다. 태그 파서·배치 정책·ID 알고리즘을 JPEG 계층에 다시 구현하지 않았습니다.
