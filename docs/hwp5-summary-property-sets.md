# HWP5 문서 요약 property set 경계

HWP5의 정확한 루트 스트림 `\005HwpSummaryInformation`은 단일 HWP FMTID property set으로 읽습니다. `summary/header.zig`는 바이트 순서·버전·FMTID·set 오프셋을, `summary/parser.zig`는 property 디렉터리·중복 ID·범위·수명과 코드페이지 의존 값을, `summary/value.zig`는 각 TypedPropertyValue의 타입·예약 필드·알려진 값을 소유합니다. 지원하지 않는 타입의 원문은 `unsupported`로 보존하고, 예약 필드 손상은 타입 지원 여부와 무관하게 `InvalidSummaryPadding`을 반환합니다.

[Microsoft MS-OLEPS PropertySetStream](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/6e65d6fa-6044-4e23-ae71-d65d1e3b1249)은 두 set의 예외를 DocumentSummaryInformation + UserDefinedProperties 조합으로 한정합니다. HWP FMTID의 두 set을 일반화해서 첫 set만 택하지 않으며 현재 `UnsupportedSummaryLayout`으로 거부합니다. [TypedPropertyValue](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/f122b9d7-e5cf-4484-8466-83f6fd94b3cc)는 16비트 `Type`과 별도 16비트 `Padding`을 정의하고, 후자는 0이어야 하며 비영 값은 거부를 권장합니다. 이 검사는 그 권장 거부 정책을 채택합니다. 한글의 [문서 요약 명세](../legacy/rust/documents/docs/spec/hwp-5.0.md)는 해당 스트림이 OLE property set 기반임을 가리키며, 다중 HWP set을 허용하는 별도 근거는 제시하지 않습니다.

PID 0 dictionary는 TypedPropertyValue가 아니므로 그 첫 4바이트를 타입·예약 필드로 재해석하지 않습니다. 알 수 없는 정상 타입은 여전히 원시 바이트로 보류합니다. `summary/parser.zig`가 소유한 property tail과 dictionary의 이름 의미, 문자열 문자 변환, 다중 일반 OLEPS 스트림 지원은 이 변경의 범위가 아닙니다. 단일 set 검증 성공을 문서 요약 전체 의미 해석이나 무손실 편집·저장으로 확대하지 않습니다.

## 검증

고정 합성 버퍼에서 정상 `VT_I4`·`FILETIME`·미지 타입을 유지하면서 알려진 타입과 미지 타입 양쪽의 비영 예약 필드를 거부합니다. HWP FMTID를 유지한 채 set 수만 2로 변조하면 첫 set을 읽지 않고 `UnsupportedSummaryLayout`을 반환합니다. 문서 파싱 중 예약 필드 오류 뒤에는 별도 검사 할당자의 잔여 할당이 0인지 확인합니다. 실행 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

읽기 전용 별도 wire 조사에서 `.hwp` 584개 중 102개는 strict CFB 단계에서 거부되었고, 요약 스트림이 있는 481개는 모두 단일 HWP FMTID set·version 0이었습니다. 이 481개에서 PID 0을 제외한 typed property 6,247개의 예약 필드는 모두 0이었습니다. 이 수치는 해당 corpus에서 관측된 필드만 가리키며, 거부된 102개·요약 스트림이 없는 파일 1개의 요약 필드나 전체 HWP 문서 의미를 검증했다는 뜻이 아닙니다. 조사 도구의 합성 self-test는 비영 예약 필드, PID 0 제외, 두 set 조기 분기를 확인합니다.
