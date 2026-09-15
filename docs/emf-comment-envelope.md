# EMF comment envelope

## 범위와 책임

`src/image/emf/comment_identifier.zig`는 세 predefined comment identifier를 소유하고, `comment_record.zig`는 모든 `EMR_COMMENT` 분기가 공유하는 envelope를 해석합니다. private, EMF+, EMFSPOOL, public comment의 내부 문법을 공통 envelope에 섞지 않습니다.

공통 파서는 다음 경계를 보존합니다.

- `DataSize`가 지정한 정확한 `data`
- 데이터가 4바이트 이상일 때의 원시 `leading_dword`
- predefined identifier와 private data의 구분
- known identifier 뒤의 `parameters`; private이면 식별자로 오인하지 않은 전체 data
- record 정렬에 필요한 0~3바이트 `alignment_padding`
- 정렬 뒤에 붙은 공통 호환성 확장 `trailing_data`

Predefined identifier는 `EMR_COMMENT_EMFSPOOL=0x00000000`, `EMR_COMMENT_EMFPLUS=0x2B464D45`, `EMR_COMMENT_PUBLIC=0x43494447`입니다. 데이터가 4바이트보다 짧거나 첫 DWORD가 이 세 값이 아니면 private으로 분류합니다. 알려진 identifier만 있고 parameter가 비어 있는 입력도 envelope 단계에서는 원문 손실 없이 분류하며, 각 하위 파서가 자신의 최소 payload를 검증합니다.

`DataSize`는 자신과 alignment padding을 포함하지 않습니다. 파서는 `12 + DataSize`를 u64에서 계산하고 입력 extent를 먼저 검사합니다. 필요한 alignment padding 뒤의 4바이트 단위 데이터는 MS-EMF의 공통 후행 확장 규칙에 따라 별도로 보존합니다. Padding 내용은 명세대로 해석하거나 0으로 강제하지 않습니다.

`framing.validate`는 전체 comment 수와 private/EMF+/EMFSPOOL/public 분류별 수를 함께 보고합니다. 이 계수는 하위 payload 검증 완료 수가 아니라 envelope routing 결과입니다.

## 명세 근거

- [MS-EMF 2.3.3 Comment Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/05940d07-e112-4146-ac05-88fc6a1f70b9)
- [MS-EMF 2.3.3.1 EMR_COMMENT Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e081b202-429d-4c34-b21c-a0ad501858a6)
- [MS-EMF 2.3.3.2 EMR_COMMENT_EMFPLUS Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/929b78e1-b848-44a5-9fac-327cae5c2ae5)
- [MS-EMF 2.3.3.3 EMR_COMMENT_EMFSPOOL Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a1a907e3-cd44-4475-a8cf-dfad513a4243)
- [MS-EMF 2.3.3.4 EMR_COMMENT_PUBLIC Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/39c91f22-e4cc-4e82-a605-0137caa8457c)
- [MS-EMF 2.3 record 공통 크기·후행 데이터 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)

## 검증

- 세 predefined identifier와 인접·최대 미지 값을 대조합니다.
- 데이터 없음, 1~3바이트 private, 미지 DWORD private, 세 known 분기를 서로 구분합니다.
- 모든 0~11바이트 잘림, 선언 record 크기 불일치, DataSize 초과와 u32 최대값을 거부합니다.
- DataSize 0~7을 순회해 네 정렬 residue의 alignment padding 0/1/2/3바이트와 그 뒤 record extension을 별도 slice로 확인하고, 필요한 padding이 부족한 직접 입력을 거부합니다.
- 완전한 HEADER/다섯 COMMENT/EOF EMF에서 총계와 네 분류 계수를 함께 확인하고 잘못된 DataSize가 상위 framing에서 같은 오류로 전파되는지 검사합니다.
- 23개 독립 결함 주입을 Debug, ReleaseSafe, ReleaseFast에서 실행한 69/69회가 모두 탐지됐습니다. 변이마다 필요한 소스만 새로 복제하고 대상 파일 하나만 변경했습니다.

최종 Debug, ReleaseSafe, ReleaseFast `audit`는 각각 40/40 step과 1467/1467 test가 통과했습니다. 이 중 native Zig test는 1428개입니다. 584개 HWP corpus의 2,167개 BinData 중 EMF signature 후보는 0개였으므로, 실제 HWP comment 표본 동등성은 주장하지 않습니다.

## 미구현 경계와 후속 순서

이번 파트는 공통 envelope 완료입니다. 다음 내부 payload는 아직 검증 완료가 아닙니다.

1. public comment의 BeginGroup, EndGroup, MultiFormats, embedded WMF 및 reserved identifier
2. EMF+ record stream
3. EMFSPOOL record stream

Private data는 정의상 vendor 전용이므로 실행하거나 내용을 추측하지 않고 원문을 보존합니다. EMF+/EMFSPOOL/public 분류 성공도 embedded record의 안전성·렌더링·실행 지원을 뜻하지 않습니다.
