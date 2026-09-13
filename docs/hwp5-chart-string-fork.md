# 차트 String 참조 분리

## 계약

`chart/contents_string_fork.zig`의 `forkStringReference`는 기존 String object ID를 재참조하는 `object_table.Reference` 한 곳을 새 inline String 정의로 교체합니다. `forkFontName`은 평탄화된 Font 필드를 같은 내부 `Target`으로 변환하는 adapter이며 직렬화 규칙을 복제하지 않습니다. 대상은 `introduced == false`이고 [보존된 참조 span](hwp5-chart-string-reference-spans.md)이 정확히 4바이트여야 합니다. span의 u32 ID, 결과 모델의 ID, 객체 사전의 String entry가 모두 일치해야 합니다.

caller가 새 object ID, 원시 bytes, trailer와 출력 한도를 제공합니다. ID는 null sentinel이 아니고 기존 객체 사전 및 Font object ID와 충돌하지 않아야 합니다. writer가 임의 ID를 고르지 않으므로 ID 할당 정책은 호출자 소유입니다. 문자열 최대 길이는 wire의 u16과 같은 65,535바이트입니다.

새 정의는 `object ID + VtString type ID + u16 길이 + bytes + trailer + VtValue type ID + VtObject type ID` 순서입니다. 파싱된 타입 테이블에서 이름과 version 1이 정확히 맞는 등록 ID 중 가장 작은 값을 결정적으로 재사용합니다. 새 타입 선언을 만들거나 이름을 추정하지 않습니다. 최종 바이트 이동과 Contents extent 갱신은 [span patch writer](hwp5-chart-patch-writer.md)만 담당합니다.

## 실제 재파싱 검증

SHA-256 고정 9,876바이트 Contents의 첫 주축 Font 이름 alias를 Font adapter와 범용 `Reference` API에서 각각 새 ID, 다른 길이의 문자열과 trailer로 분리합니다. 출력 길이와 extent를 확인하고 전체 Contents를 다시 파싱하여 다음을 검증합니다.

- 대상 Font만 새 ID의 inline String을 도입하고 새 bytes·trailer를 반환합니다.
- 객체 사전에 새 String ID가 등록됩니다.
- 뒤의 주축 중 적어도 하나는 기존 ID alias를 그대로 유지합니다.
- 정상 분리 경로의 임시 직렬화 버퍼와 최종 출력은 모든 할당 실패 지점에서 누수 없이 정리됩니다.

null ID, 기존 ID 충돌, inline 정의 대상, 65,536바이트 입력, 잘못된 span·원본 ID·객체 사전 entry, 필수 타입 version 부재는 정확한 오류로 거부합니다. 이 fixture에서 Font 밖에 보존된 `Reference`들은 모두 inline 정의였으므로 series section text를 범용 API에 넣어 거부되는 것까지만 실측했습니다. 비-Font alias 성공을 이 표본으로 검증했다고 주장하지 않습니다.

## 적대적 검증

문자열 길이를 0으로 기록, 새 ID 대신 기존 ID 기록, `VtValue` 자리에 `VtObject` 기록, 기존 object ID 충돌 검사 제거, `VtString` version 2 선택의 다섯 변이를 Debug·ReleaseSafe·ReleaseFast에서 각각 컴파일·실행했습니다. 15개 조합은 모두 컴파일 성공 후 실제 재파싱 또는 정확 오류 assertion 실패로 거부됐습니다. 컴파일 실패나 trap은 검출로 세지 않았습니다.

범용 API 추출 뒤에는 길이를 0으로 기록, `Reference.start`를 1 증가, `introduced`를 false로 고정, 새 ID 대신 대상 ID 기록, 중복 검사 제거의 다섯 변이를 같은 세 모드에서 다시 실행했습니다. 추가 15개 조합도 모두 컴파일 성공 후 assertion 실패로 거부됐습니다.

## 미구현 범위

범용 API는 `object_table.Reference`를 결과에 보존한 필드에 적용할 수 있습니다. Font처럼 값을 평탄화한 다른 필드는 별도 span 보존과 얇은 adapter가 필요합니다. 자동 object ID 탐색, 새 type ID·선언 생성, 문자열 인코딩 변환, 여러 편집의 일괄 트랜잭션, CFB 스트림 저장은 제공하지 않습니다.
