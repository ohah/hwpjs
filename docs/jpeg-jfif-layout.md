# JFIF/JFXX 마커 배치 검사

## 계약과 책임

[ITU-T T.871](https://www.itu.int/rec/T-REC-T.871-201105-I/en) 6.3~6.5의 공식 PDF를 확인했습니다. `src/image/jpeg/jfif_layout.zig`는 SOI 바로 다음 마커가 JFIF APP0인지, JFIF가 중복되지 않는지, JFXX APP0들이 JFIF 바로 뒤에서만 연속되는지 검사합니다. 다른 마커가 한 번 나오면 JFXX를 다시 허용하지 않습니다. 스캔 뒤와 EOI 앞의 잘못된 배치도 검사합니다. JPEG 마커 fill 바이트는 별도 마커로 세지 않습니다.

응용 APP0는 NUL 종결 식별자를 요구합니다. 다른 APPn의 데이터 문법은 강제하지 않습니다. 추가 APP 마커는 이미 JFIF/JFXX 묶음 이후라는 상태에서만 계수됩니다. 알려진 JFIF/JFXX payload는 기존 해석기를 재사용하고, 프레임의 8비트·1/3성분·ID 순서는 기존 JFIF 검사기가 소유합니다.

`structure.inspectWithContext`는 기존 전체 JPEG 마커/엔트로피 순회에 호출자 상태와 검사 함수를 전달합니다. 기존 무상태 `inspectWithMarkerCheck`는 어댑터로 유지합니다. 순회가 나중에 실패하더라도 앞선 콜백의 상태 변경을 되돌리지 않으므로 외부 호출자는 부분 상태를 성공 결과로 취급하면 안 됩니다. JFIF 배치 진입점은 상태를 함수 안에만 두고 전체 구조 검사 성공 후에만 Report를 반환합니다.

Report의 JFIF 헤더와 썸네일은 불변 입력을 빌립니다. 확장 수, 미지 확장 수, 미검증 압축 썸네일 수, 기타 APP 수는 별도로 보고합니다. 미지 확장은 거부하지 않으며 0x10의 빈/손상 데이터도 배치 검사만으로 유효한 썸네일이 되지 않습니다. 명시적인 복호화는 [JFXX 내부 검사](jpeg-jfxx.md)가 소유합니다.

## 지원 경계

- 기존 JFIF 1.x 호환 헤더 정책을 재사용하며 정확한 1.02 writer 적합성을 인증하지 않습니다. 낮은 minor 버전과 확장 조합을 여기서 새 버전으로 보정하지 않습니다.
- JPEG의 구조·사용자 한도·trailing 정책을 그대로 적용합니다. 테이블 의미, 엔트로피 완료, progressive 복호화, 색상 메타데이터 충돌 및 RGB 출력은 이 검사의 성공으로 보장되지 않습니다.
- JFIF가 없는 일반 JPEG는 이 명시적 JFIF 진입점에서 거부합니다. 기존 일반 JPEG 검사기에 JFIF 필수 조건을 추가하지 않았습니다.
- 제품 JS API와 HWP JPEG BinData 연결은 변경하지 않습니다.

## 검증 기록

JPEG 네이티브 98/98개가 통과했습니다. 연속 확장·미지/미검증 계수, 헤더의 입력 차용, 마커 fill, 첫 헤더 누락/이동, SOF/SOS/EOI 앞 중복, 스캔 뒤 JFXX, APP0 식별자 종결, 다른 APPn의 불투명 처리, 프레임 ID, 모든 prefix 잘림, marker 한도 및 trailing 정책을 확인했습니다.

테스트용 mode 265는 입력 JPEG 전체를 받고 11개의 u32(확장/미지/압축 미검증/기타 APP 개수, version/units/Hdensity/Vdensity/thumbnail width/height, 전체 마커 수)를 반환합니다. 제품 API가 아닙니다. `tests/hwp5/jpeg-jfif-layout.mjs`는 먼저 마커 배열을 수집한 뒤 JFIF의 인덱스가 정확히 `[1]`, JFXX 인덱스가 `[2,3,...]`인지 대조합니다. 제품의 스트리밍 상태 전이를 복제하지 않습니다.

Debug WASM 비교 327건·거부 213건이 통과했습니다. 전체 확장 코드 바이트, 치수·restart·DNL 조합, APPn 종류, 각 마커 경계의 중복/늦은 확장, prefix 잘림·출력 한도를 검사했습니다. 실제 HWP의 JPEG 참조 8건과 `reference/rhwp/samples/s1.jpg`도 독립 배치 결과가 일치했습니다. 참조 수는 고유 이미지 수가 아니며 실제 JFXX 썸네일 검증을 뜻하지 않습니다. 합성 파일과 s1의 결과 88바이트를 각각 XOR 1한 변조를 모두 검출했습니다.

ReleaseSafe와 ReleaseFast의 별도 WASM에서도 각각 비교 327건·거부 213건, 실 HWP JPEG 참조 8건과 s1의 배치 대조, 출력 88바이트 개별 변조 검출이 통과했습니다.

`/tmp/hwpjs-jfif-layout-mutants.PepTNx/`의 독립 소스 복사본 네 개에서 JFIF 중복 금지·JFXX 연속성·APP0 식별자 종결·프레임 제약을 각각 제거했습니다. 네 변형 모두 Debug/ReleaseSafe/ReleaseFast에서 컴파일 후 98개 테스트 중 1개 실패로 검출했습니다. 정규 소스나 산출물에 결함을 주입하지 않았습니다.

추가 일회성 전수 대조는 SOI와 정상 baseline 본문 사이에 JFIF, 미지 JFXX, NUL 종결 APP0, APP1, COM의 다섯 종류를 길이 0~6으로 조합했습니다. 총 19,531가지(각 길이의 모든 5진수 열)를 독립 마커 인덱스 oracle과 대조하여 세 모드 모두 543개 허용·18,988개 거부로 일치했습니다. 이 수치는 정규 audit 건수에 포함하지 않습니다.

전체 회귀 검사는 Debug → ReleaseSafe → ReleaseFast 순서로 완료했습니다. 각 모드 모두 20/20 단계·네이티브 814/814개·checks 7,656,364건이 통과했습니다. 로그는 `/tmp/hwpjs-jfif-layout-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 검사 건수는 포맷 지원률이나 모든 입력의 무결함 증명이 아닙니다.

SSOT 재검토에서 전체 마커/엔트로피 순회가 기존 `structure.zig` 한 곳에 유지되고, 헤더·확장 payload·프레임 규칙을 새 상태 머신이 복제하지 않는 것을 확인했습니다. 배치 결과와 압축 데이터 미검증 상태를 구분하며 문서 진입점만 연결했습니다.
