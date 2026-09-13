# 차트 String 객체 편집

## 계약

`chart/contents_string_edit.zig`의 `replaceStringObject`는 전체 Contents 객체 사전에 등록된 하나의 String 정의를 교체합니다. object ID를 받아 사전 entry가 실제 String인지 확인하고, 저장된 bytes slice가 `Contents.source` 안에 있는지 검증합니다. payload 바로 앞 u16 길이와 바로 뒤 u8 trailer가 파싱 결과와 일치해야만 patch를 생성합니다.

replacement는 `u16 새 길이 + 새 원시 bytes + 새 trailer` 한 구간입니다. [원본 span patch writer](hwp5-chart-patch-writer.md)가 후속 바이트 이동, 전체 Contents extent와 출력 한도를 담당합니다. 최대 String 길이는 wire 폭과 같은 65,535바이트입니다. 문자열 인코딩을 추정하거나 변환하지 않고 caller가 준 바이트를 그대로 저장합니다.

이 API는 객체 **정의**를 바꾸므로 같은 object ID를 재참조하는 모든 필드가 함께 변경됩니다. 한 참조만 새 값으로 분리하려면 새 object/type 선언과 해당 참조 ID patch가 필요하며 현재 범위가 아닙니다. Other·Number entry, 없는 ID, 사전 값 내부 ID 불일치, source 밖 slice, 길이/trailer 불일치는 거부합니다.

## 실제 재파싱 검증

SHA-256 고정 9,876바이트 Contents fixture에서 다음을 확인합니다.

- 새로 도입된 Legend 이름 String을 같은 값으로 쓰면 전체 출력이 원본과 byte-for-byte 같습니다.
- 길이가 다른 `edited-chart-name`과 trailer 0xa5로 교체한 출력의 길이·extent가 맞고, 전체 Contents를 다시 파싱하면 객체 사전과 Legend가 같은 ID·새 bytes·trailer를 반환합니다.
- 기존 String을 재참조하는 주축 제목 font 이름을 교체하고 재파싱했을 때 같은 ID를 가진 모든 주축 참조가 새 bytes를 봅니다.
- 빈 String과 65,535바이트 String을 각각 출력 후 전체 재파싱하며 길이와 최대값 trailer 0xff를 확인합니다.
- 65,536바이트, 없는 ID, Other 대상, 손상된 원본 길이 필드를 정확한 오류로 거부합니다.
- String 편집 정상 경로는 기존 모든 할당 실패 검사에 포함되어 임시 replacement와 최종 output의 각 OOM에서 누수가 없어야 합니다.

고정 fixture의 Legend 이름이 새 정의이고 주축 font 이름이 기존 정의 재참조라는 전제는 테스트가 명시적으로 확인합니다. 이 한 fixture의 분포를 모든 차트의 문자열 배치라고 일반화하지 않습니다.

## 적대적 검증

길이 기록을 0으로 고정, trailer를 0으로 고정, 원본 길이 대조 제거, 없는 ID 오류 변경, 최대 허용 길이를 65,534바이트로 축소한 다섯 변이를 각각 Debug·ReleaseSafe·ReleaseFast로 컴파일하고 실행했습니다. 15개 조합은 모두 컴파일에 성공한 뒤 기존 테스트의 assertion 실패로 거부됐습니다. 컴파일 실패나 trap은 검출 결과로 세지 않았습니다.

## 미구현 범위

UTF-16/CP949 의미 변환, 텍스트 정규화, 한 참조만 분리하는 copy-on-write, String ID 신규 할당, 타입 선언 추가, 편집된 CFB 스트림 저장은 제공하지 않습니다. 현재 파서가 명시적 Layout으로 성공한 Contents와 그 객체 사전에 등록된 inline String만 대상입니다.
