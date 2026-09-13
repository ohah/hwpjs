# WMF embedded enhanced metafile

## 명세 경계

Microsoft [META_ESCAPE_ENHANCED_METAFILE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/cfc88064-d86d-4b52-9374-3ce27d456179)은 `META_ESCAPE`의 EscapeFunction `0x000f` payload에 34바이트 comment header와 EMF 조각을 넣는다. `enhanced_metafile.zig`는 다음 MUST 조건을 strict하게 검사한다.

- CommentIdentifier `0x43464D57`, CommentType `1`, Flags `0`
- ByteCount가 `34 + CurrentRecordSize`와 일치
- CommentRecordCount가 0이 아니고 CurrentRecordSize가 8,192 이하
- 현재 조각과 RemainingBytes가 전체 EnhancedMetafileDataSize를 넘지 않음

Version `0x00010000`은 SHOULD이므로 원문 값을 보존하며 거부 조건으로 삼지 않는다. Checksum은 완성된 EMF stream 전체에 대한 값이므로 조각 parser는 보존만 하고, 시퀀스 재조립 단계가 검증한다.

## 실제 HWP 관찰

hash-pinned HWP의 WMF에는 EscapeFunction이 `0x000f`인 META_ESCAPE가 118개 있다. 그러나 payload 길이는 6/8/10/20/22/24/35바이트이며 118개 모두 CommentIdentifier가 `0x43464D57`이 아니다. 따라서 명세상 embedded EMF record로 간주하거나 이어 붙이지 않는다.

일반 `escape.zig`는 이 관찰값을 arbitrary EscapeData로 손실 없이 보존한다. `enhanced_metafile.zig`는 명세 준수 payload만 해석하고, `enhanced_metafile_records.zig`는 실제 표본에서 후보 118개, 준수 0개, 비준수 118개라는 차이를 명시적으로 보고한다. 비준수 payload의 의미를 휴리스틱으로 추정하지 않는다.

다음 단계는 명세 준수 합성 시퀀스에 대해 record 연속성, record count, 감소하는 RemainingBytes, 전체 크기, XOR checksum과 EMF framing을 검증하는 것이다.

## 적대적 검증

다음 결함을 하나씩 주입하고 Debug, ReleaseSafe, ReleaseFast의 실제 build graph에서 검증한다.

1. CommentIdentifier 검사를 제거
2. Flags가 0이어야 한다는 검사를 제거
3. CurrentRecordSize의 8,192바이트 상한을 제거
4. CurrentRecordSize와 RemainingBytes가 전체 크기를 넘지 않는다는 검사를 제거
5. 실제 HWP의 비준수 후보 계수를 누락

유효한 15회 모두 결함을 탐지했다. 3번의 최초 입력은 상한 검사를 제거해도 실제 data 길이 검사에서 다시 거부되어 약한 검증으로 판정하고 결과에서 제외했다. 대신 ByteCount, CurrentRecordSize, 실제 data 길이, TotalSize가 모두 8,193바이트로 일치하는 입력으로 교체해 상한 검사가 없으면 실제 수용되는 것을 세 모드에서 확인했다. 5번은 hash-pinned HWP 감사가 비준수 후보의 기대값 118과 잘못된 관찰값 0의 차이를 탐지했다. 모든 변이는 제거한 뒤 정상 기준선을 다시 검증한다.
