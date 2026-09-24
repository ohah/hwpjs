# HWP5 문서 요약 property set 경계

HWP5의 정확한 루트 스트림 `\005HwpSummaryInformation`은 단일 HWP FMTID property set으로 읽습니다. `summary/header.zig`는 바이트 순서·버전·FMTID·set 오프셋을, `summary/parser.zig`는 property 디렉터리·중복 ID·범위·수명과 코드페이지 의존 값을, `summary/value.zig`는 각 TypedPropertyValue의 타입·예약 필드·알려진 값을 소유합니다. 지원하지 않는 타입의 원문은 `unsupported`로 보존하고, 예약 필드 손상은 타입 지원 여부와 무관하게 `InvalidSummaryPadding`을 반환합니다.

[Microsoft MS-OLEPS PropertySetStream](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/6e65d6fa-6044-4e23-ae71-d65d1e3b1249)은 두 set의 예외를 DocumentSummaryInformation + UserDefinedProperties 조합으로 한정합니다. HWP FMTID의 두 set을 일반화해서 첫 set만 택하지 않으며 현재 `UnsupportedSummaryLayout`으로 거부합니다. [TypedPropertyValue](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/f122b9d7-e5cf-4484-8466-83f6fd94b3cc)는 16비트 `Type`과 별도 16비트 `Padding`을 정의하고, 후자는 0이어야 하며 비영 값은 거부를 권장합니다. 이 검사는 그 권장 거부 정책을 채택합니다. 한글의 [문서 요약 명세](../legacy/rust/documents/docs/spec/hwp-5.0.md)는 해당 스트림이 OLE property set 기반임을 가리키며, 다중 HWP set을 허용하는 별도 근거는 제시하지 않습니다.

PID 0 dictionary는 TypedPropertyValue가 아니므로 그 첫 4바이트를 타입·예약 필드로 재해석하지 않습니다. 알 수 없는 정상 타입은 여전히 원시 바이트로 보류합니다. `summary/parser.zig`가 소유한 property tail과 dictionary의 이름 의미, 문자열 문자 변환, 다중 일반 OLEPS 스트림 지원은 이 변경의 범위가 아닙니다. 단일 set 검증 성공을 문서 요약 전체 의미 해석이나 무손실 편집·저장으로 확대하지 않습니다.

## 코드페이지가 빠진 HWP 관측형

[OLEPS CodePage Property](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/b8910736-7f4a-469a-9644-aed68a71d7d1)는 모든 property set에 PID 1을 요구하지만, 아래 HWP corpus의 요약 스트림은 전부 PID 1이 없습니다. 이 경우 코드페이지를 1200으로 추정하지 않습니다. VT_LPWSTR은 타입 자체로 UTF-16LE 문자열을 읽을 수 있지만, 코드페이지가 필요한 값과 PID 0 이름 해독은 보류합니다.

해당 corpus의 PID 0은 모두 13바이트 `01 00 00 00 00 00 00 00 01 00 00 00 00`입니다. [OLEPS DictionaryEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/333959a3-a999-4eca-8627-48a224e63e77)는 항목 ID를 2 이상으로 요구하므로, 이 바이트를 정상 사전의 한 항목으로 해석할 수 없습니다. `dictionary.isObservedHwpPlaceholder`는 이 **정확한** 관측 마커만 진단하며 `Document.observed_dictionary_placeholder`로 노출합니다. 원문은 그대로 보존하고 `dictionaries_deferred`는 유지합니다. 다른 누락 코드페이지 사전, 변조된 마커, 코드페이지가 명시된 사전은 자동 보정하지 않습니다.

## 검증

고정 합성 버퍼에서 정상 `VT_I4`·`FILETIME`·미지 타입을 유지하면서 알려진 타입과 미지 타입 양쪽의 비영 예약 필드를 거부합니다. HWP FMTID를 유지한 채 set 수만 2로 변조하면 첫 set을 읽지 않고 `UnsupportedSummaryLayout`을 반환합니다. 문서 파싱 중 예약 필드 오류 뒤에는 별도 검사 할당자의 잔여 할당이 0인지 확인합니다. 실행 명령은 [개발·검증 명령](development-commands.md)에 둡니다.

읽기 전용 별도 wire 조사에서 `.hwp` 584개 중 102개는 strict CFB 단계에서 거부되었고, 요약 스트림이 있는 481개는 모두 단일 HWP FMTID set·version 0이었습니다. 거부 102개에는 CFB가 아닌 서명 29개도 포함되므로 전부 손상된 HWP5라고 세지 않습니다. 이 481개에서 PID 0을 제외한 typed property 6,247개의 예약 필드는 모두 0이었습니다. 이 수치는 해당 corpus에서 관측된 필드만 가리키며, 거부된 102개·요약 스트림이 없는 파일 1개의 요약 필드나 전체 HWP 문서 의미를 검증했다는 뜻이 아닙니다. 조사 도구의 합성 self-test는 비영 예약 필드, PID 0 제외, 두 set 조기 분기를 확인합니다.

같은 481개에서 코드페이지는 0건, PID 0은 481건이고 모두 위 13바이트 마커였습니다. 정수형 956개·VT_LPWSTR 3,848개·FILETIME 1,443개가 관측되었으며, 이 분포는 **strict CFB가 허용하고 요약 스트림이 있는 표본**에만 적용됩니다. 파일 개수는 중복 내용을 제거하지 않은 값입니다. 독립 조사기는 byte/Unicode 사전의 기본 바이트 배치 반례와 관측 마커를 분리해 검사하며, 사전 이름의 중복·문자 인코딩 의미까지 검증하지는 않습니다. 제품 파서의 합성 문서 테스트는 정확한 마커의 진단, 1바이트 변조 시 비진단, 정식 OLEPS 사전 검사에서 ID 0 거부, 할당 실패 경로를 검증합니다. 이 결과를 사용해 실파일의 사전 이름이나 임의 코드페이지를 만들어내지 않습니다.

선택적 `--probe` 조사에서 같은 요약 스트림 481개가 모두 테스트용 WASM 파서의 mode 27을 통과했습니다. 이 모드는 파싱 성공과 기존 필드 wire만 반환하지만, 추적된 `hwpSummaryInformation.hwp` 하나는 별도 네이티브 실파일 테스트가 `Document.observed_dictionary_placeholder == true`를 직접 확인합니다. 나머지 480개의 해당 필드 반환값은 독립 wire 분류와 합성 테스트로 뒷받침됩니다. 이는 문서 전체 의미·편집·저장을 검증한 결과가 아닙니다.

최종 소스에서 Debug 전체 `zig build test --summary all` 2,383/2,383개, Debug·ReleaseSafe·ReleaseFast의 전체 `zig build audit --summary all`이 모두 통과했습니다. ReleaseSafe 제품 빌드와 독립 CFB `compare` 47개 JS 테스트도 통과했습니다. 조사 도구의 self-test·문법·`zig fmt --check`·`git diff --check`를 확인하고, 마지막 ReleaseFast 테스트용 WASM으로 481개 요약 스트림의 파싱 성공을 다시 확인했습니다. 적대적 경계 검토에서 정확한 마커와 1바이트 변조를 구분하고, 누락 코드페이지를 추정하지 않으며, PID 0을 정식 OLEPS 사전으로 오인하지 않는지 확인했습니다. 이 검증은 기본 audit 밖의 전체 corpus에 대해서는 `--probe` 명령을 별도로 실행한 결과입니다.
