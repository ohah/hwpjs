# 차트 String 참조 분리

## 계약

`chart/contents_string_fork.zig`의 `forkStringReference`는 기존 String object ID를 재참조하는 `object_table.Reference` 한 곳을 새 inline String 정의로 교체합니다. `forkStringValueReference`는 String/Number union에서 String만 같은 경로로 전달하고 Number를 명시적으로 거부합니다. `forkFontName`, `forkTextBlockText`, `forkNullableTextBlockText`, `forkTextBodyText`, `forkTextFormatCode`, `forkNullableTextFormatCode`는 평탄화된 필드를 같은 내부 `Target`으로 변환하는 adapter입니다. 모든 진입점은 직렬화 규칙을 복제하지 않습니다. 대상은 `introduced == false`이고 [보존된 참조 span](hwp5-chart-string-reference-spans.md)이 정확히 4바이트여야 합니다. span의 u32 ID, 결과 모델의 ID, 객체 사전의 String entry가 모두 일치해야 합니다.

caller가 새 object ID, 원시 bytes, trailer와 출력 한도를 제공합니다. ID는 null sentinel이 아니고 기존 객체 사전 및 enclosing object ID와 충돌하지 않아야 합니다. writer는 임의 ID를 고르지 않으며, 결정적 기본 선택은 별도 [object ID 선택](hwp5-chart-object-id-allocation.md)이 소유합니다. 문자열 최대 길이는 wire의 u16과 같은 65,535바이트입니다.

새 정의는 `object ID + VtString type ID + u16 길이 + bytes + trailer + VtValue type ID + VtObject type ID` 순서입니다. 파싱된 타입 테이블에서 이름과 version 1이 정확히 맞는 등록 ID 중 가장 작은 값을 결정적으로 재사용합니다. 새 타입 선언을 만들거나 이름을 추정하지 않습니다. 최종 바이트 이동과 Contents extent 갱신은 [span patch writer](hwp5-chart-patch-writer.md)만 담당합니다.

## 실제 재파싱 검증

SHA-256 고정 9,876바이트 Contents의 첫 주축 Font 이름 alias를 Font adapter, 범용 `Reference`, String `ValueReference` API에서 각각 새 ID, 다른 길이의 문자열과 trailer로 분리합니다. 출력 길이와 extent를 확인하고 전체 Contents를 다시 파싱하여 다음을 검증합니다.

- 대상 Font만 새 ID의 inline String을 도입하고 새 bytes·trailer를 반환합니다.
- 객체 사전에 새 String ID가 등록됩니다.
- 뒤의 주축 중 적어도 하나는 기존 ID alias를 그대로 유지합니다.
- 정상 분리 경로의 임시 직렬화 버퍼와 최종 출력은 모든 할당 실패 지점에서 누수 없이 정리됩니다.

null ID, 기존 ID 충돌, inline 정의 대상, 65,536바이트 입력, 잘못된 span·원본 ID·객체 사전 entry, 필수 타입 version 부재는 정확한 오류로 거부합니다. 실제 axis scale의 Number `ValueReference`도 `UnsupportedChartStringForkValue`로 거부합니다. TextBlock adapter는 실제 series section label의 alias 본문 하나를 분리하고 전체 Contents를 재파싱해 대상만 새 ID·bytes·trailer를 얻는지 확인합니다. 실제 Footnote·주축의 inline 본문과 보조축 null 본문도 각각 상태별 오류로 거부합니다.

현재 고정 corpus에는 alias인 TextFormat code가 없습니다. 따라서 TextFormat adapter의 성공 경로는 실제 Font alias의 String 값과 source span을 합성 `Format` view로 감싸 adapter가 공용 writer에 정확히 전달하는지만 검증하고, 출력 전체 Contents를 재파싱해 해당 실제 Font 위치의 새 ID·bytes·trailer를 확인합니다. 이는 실제 TextFormat alias 표본 검증으로 간주하지 않습니다. nullable adapter는 실제 series suffix의 null code를 `UnsupportedChartStringForkValue`로 거부하고, 실제 inline String span을 감싼 required view는 `UnsupportedChartStringForkTarget`으로 거부합니다.

## 적대적 검증

문자열 길이를 0으로 기록, 새 ID 대신 기존 ID 기록, `VtValue` 자리에 `VtObject` 기록, 기존 object ID 충돌 검사 제거, `VtString` version 2 선택의 다섯 변이를 Debug·ReleaseSafe·ReleaseFast에서 각각 컴파일·실행했습니다. 15개 조합은 모두 컴파일 성공 후 실제 재파싱 또는 정확 오류 assertion 실패로 거부됐습니다. 컴파일 실패나 trap은 검출로 세지 않았습니다.

범용 API 추출 뒤에는 길이를 0으로 기록, `Reference.start`를 1 증가, `introduced`를 false로 고정, 새 ID 대신 대상 ID 기록, 중복 검사 제거의 다섯 변이를 같은 세 모드에서 다시 실행했습니다. 추가 15개 조합도 모두 컴파일 성공 후 assertion 실패로 거부됐습니다.

`ValueReference` adapter에는 Number를 String 경로로 전달, String object ID를 변경, `introduced`를 true로 고정한 세 변이를 세 모드에서 실행했습니다. 최초 Number 변이가 컴파일되지 않은 결과는 폐기하고 컴파일 가능한 의미 변이로 교체했으며, 유효한 9개 조합은 모두 컴파일 성공 후 assertion 실패로 거부됐습니다.

TextBlock adapter에는 Body 시작+1·끝-1·introduced=true, nullable null 오류 변경, required Block introduced=false의 다섯 변이를 세 모드에서 실행했습니다. 15개 조합은 모두 컴파일 성공 후 실제 재파싱 또는 정확 오류 assertion 실패로 거부됐고 trap은 검출로 세지 않았습니다.

TextFormat adapter에는 required 시작+1·끝-1·introduced=true, nullable null 오류 변경, required String object ID 변경의 다섯 변이를 세 모드에서 실행했습니다. 15개 조합 모두 컴파일 성공 후 실제 assertion 실패와 종료 코드 1로 검출했습니다. 컴파일 실패나 trap은 검출로 세지 않았습니다. 격리 로그는 `/tmp/hwpjs-text-format-adapter-mutants.gzkHRq`에 남겼습니다.

## 미구현 범위

범용 API는 `object_table.Reference`, String arm의 `ValueReference`, Font 이름, TextBlock 본문과 TextFormat code에 적용할 수 있습니다. Number와 null을 String으로 재형식화하지 않습니다. 값을 평탄화한 다른 필드는 별도 span 보존과 얇은 adapter가 필요합니다. 자동 ID 선택은 별도 모듈을 명시적으로 호출하며 예약형 편집 세션은 제공하지 않습니다. 새 type ID·선언 생성, 문자열 인코딩 변환과 여러 편집의 일괄 트랜잭션도 제공하지 않습니다. 생성한 Contents를 압축 해제된 OLE BinData 내부 CFB에 넣는 경계는 [OLE 내부 스트림 교체](hwp5-ole-stream-replacement.md)가 담당합니다.
