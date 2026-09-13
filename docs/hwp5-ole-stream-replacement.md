# OLE 내부 스트림 교체

## 계약과 책임

`hwp5/ole/stream_replace.zig`의 `replaceExact`는 이미 압축 해제된 HWP OLE BinData 한 개에서 내부 CFB stream 하나를 교체합니다. 기존 strict OLE container open, CFB `findExact`, `File.toNodes`, canonical writer를 순서대로 재사용하며 CFB 파싱·경로 비교·섹터 직렬화를 다시 구현하지 않습니다.

입력의 `raw_cfb` 또는 `observed_size_prefix` 배치를 caller가 명시하며 출력도 같은 배치를 유지합니다. CFB major version 3/4, 다른 storage/stream의 내용과 디렉터리 메타데이터를 보존합니다. 물리 섹터 배치와 트리 색상 같은 canonical writer의 정규화 범위는 [CFB API](cfb-reader.md)와 동일합니다.

경로가 없으면 `StreamNotFound`, storage를 선택하면 `NotAStream`입니다. reader/writer 자원 한도와 별도 최종 envelope 한도를 모두 적용합니다. 최종 한도에서 envelope 4바이트를 제외한 값을 writer 한도와 교차 적용하므로, 한도 초과 결과를 먼저 할당하지 않습니다. 실패 시 입력을 바꾸지 않으며 결과를 반환하지 않습니다. 새 결과는 caller 소유입니다.

## 검증

v3/v4와 raw/size-prefix 네 조합에서 4,097바이트 replacement로 MiniFAT 경계를 넘겨 재생성한 뒤 strict CFB로 다시 엽니다. 대소문자가 다른 정확 경로 조회, 교체·형제 stream의 bytes, 부모 storage의 state·생성·수정 시각, 원래 major version과 size prefix를 확인합니다. CFB 규칙상 stream에는 시각 메타데이터를 부여하지 않습니다. 네 조합의 모든 할당 실패 지점도 검사합니다.

별도 실제 연결 검사는 SHA-256 고정 9,876바이트 Contents의 Font alias를 새 String ID로 분리하고, 이를 `Contents` stream으로 가진 내부 CFB를 생성한 뒤 이 API로 교체합니다. 저장 결과를 strict CFB로 다시 열고 형제 stream 보존과 편집된 Contents 전체 재파싱, 새 ID·bytes·trailer를 확인합니다. 합성한 것은 주변 CFB이며 Contents 자체는 실제 고정 corpus bytes입니다.

누락 경로, storage 선택, 최종 출력 한도, stream 한도와 strict CFB 헤더 위반은 정확한 오류로 거부합니다.

strict 검사 해제, compact node target을 다음 항목으로 변경, 출력 version 3 강제, size-prefix 제거, replacement 미적용의 다섯 소스 변형을 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 replacement 미적용 변형은 미사용 매개변수 컴파일 오류가 나서 폐기하고 매개변수를 소비하는 의미상 같은 변형으로 재실행했습니다. 유효한 15개 조합 모두 컴파일 성공 후 실제 assertion 실패와 종료 코드 1로 검출했으며 컴파일 실패나 trap은 세지 않았습니다. 격리 로그는 `/tmp/hwpjs-ole-stream-replace-mutants.AN7j3l`에 남겼습니다.

## 남은 범위

이 API는 압축 해제된 BinData 값 하나의 내부 CFB만 재생성합니다. 바깥 HWP CFB의 BinData stream 선택·압축 재적용·DocInfo 참조 수정·파일 전체 저장은 아직 연결하지 않았습니다. 차트 Contents의 의미 편집은 별도 parser/writer가 소유하며 이 API는 replacement bytes를 해석하지 않습니다.
