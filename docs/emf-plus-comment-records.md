# EMF+ private and reserved comment records

## 계약

`emf_plus_comment.zig`는 `EmfPlusComment`의 사용되지 않는 Flags 원값과 DataSize 길이의 `PrivateData`를 입력에서 빌린 slice로 보존합니다. private data는 vendor-extensible 영역이므로 내용을 실행하거나 구조를 추측하지 않습니다. 비어 있는 data도 유효하며 부재와 임의 바이트를 보정하지 않습니다.

`emf_plus_stream.zig`는 comment 수와 private data 총 바이트를 checked addition으로 집계합니다. 한도 오류나 같은 외부 comment의 뒤쪽 레코드 오류가 발생하면 Header, 레코드 수, private 집계 등 상태 전체를 갱신하지 않습니다.

`EmfPlusMultiFormatStart`(0x4005), `EmfPlusMultiFormatSection`(0x4006), `EmfPlusMultiFormatEnd`(0x4007)는 이름과 달리 공식 `RecordType` 문서에서 모두 reserved이며 **MUST NOT be used**입니다. 세 값은 enum에서 누락하지 않되 스트림에 나타나면 payload·Flags와 관계없이 `ReservedEmfPlusRecordType`으로 거부합니다. 문서에 없는 다중 형식 상태나 호환 동작을 만들어내지 않습니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusComment](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/beb96556-0251-4b33-964f-b30aca0870ea)
- [MS-EMFPLUS Comment Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c84e0157-fa18-44c7-951d-3ebaae805550)
- [MS-EMFPLUS Vendor-Extensible Fields](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/8ebcb809-8569-4d9d-a042-8f217fdbd42c)
- [MS-EMFPLUS RecordType Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/abffcb71-1b31-414f-b032-f1e00c57a48a)

## 검증과 남은 범위

단위 테스트는 nonzero Flags, 빈 private data, 전체 u8 경계가 섞인 data, 비대상 레코드, 여러 comment 집계, 세 reserved 값, 실패 상태 원자성, 두 집계 필드의 usize overflow를 검사합니다. 상위 EMF framing 테스트도 private 수·바이트를 확인하고 세 reserved 오류가 그대로 전파되는지 검사합니다.

적대적 검토는 (1) 공식 RecordType와 MUST NOT, (2) private 원문·Flags, (3) 합계 overflow와 실패 원자성, (4) comment 간 상태, (5) 상위 framing·SSOT의 다섯 관점으로 반복했습니다. 격리 복사본과 별도 Zig cache에서 Comment 분류, Flags 보존, private slice, reserved 거부, comment 수, data 바이트 수, pending 상태를 각각 손상시킨 7개 유효 변형을 Debug·ReleaseSafe·ReleaseFast로 실행했고 21/21회를 모두 검출했습니다. 미사용 변수로 컴파일이 깨진 byte 집계 변형은 유효 결과에 포함하지 않고, 같은 동작 결함을 유지하면서 컴파일되는 변형으로 교체했습니다.

변경 소스를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계, 전체 1,498/1,498 테스트(공통 native 1,459, 별도 chart 31, WMF 8), HWP/WASM 8,905,827회 검사를 통과했습니다. CFB 변이 12,000회도 trap 0이며 로그는 `/tmp/hwpjs-emf-plus-comments-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

이 파트는 private comment 보존과 reserved record 거부만 완료합니다. private bytes의 vendor 의미를 지원한다는 뜻이 아니며, 다음 EMF+ payload인 Object와 SerializableObject 및 Object Table은 아직 구현하지 않았습니다.
