# WMF text alignment·ExtTextOut·Escape

## 명세와 책임 분리

Microsoft [META_SETTEXTALIGN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/562b5f06-dc3e-4446-bb2f-9ada932a8f9d)은 TextAlignmentMode와 optional Reserved를 정의한다. `text_align.zig`는 정확한 4/5 WORD 배치, 알려진 flag mask, horizontal 0/2/6과 vertical 0/8/0x18 조합을 검사한다. Reserved 부재는 null이고 존재 값은 MUST-ignore여도 원문을 보존한다.

Microsoft [META_EXTTEXTOUT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/7d07c44a-a828-4b82-9af0-e0a81cced5a8)은 Y, X, signed StringLength, option flags, optional Rect, byte string, 홀수 길이 alignment byte와 optional signed Dx를 정의한다. `ext_text_out.zig`는 음수 길이와 미지 option을 거부하고 string/padding/Dx를 각각 빌린 view로 분리한다. padding byte는 0으로 강제하거나 문자열에 포함하지 않는다. Dx는 부재 또는 문자열 길이만큼이며 ETO_PDY에서는 두 배여야 한다.

Rect 존재는 길이로 추정하지 않는다. `from_options`는 CLIPPED/OPAQUE bit에 따라 선택하고, 호출자는 `absent`나 `present`를 명시할 수 있다. Rect Object의 L→T→R→B는 `rect.readLTRB`, ellipse/rectangle record의 B→R→T→L은 `rect.readBRTL`로 같은 타입에서 순서를 이름으로 분리한다. string은 현재 선택 font/charset을 적용하기 전 raw bytes이며 임의로 CP949나 Latin-1로 디코딩하지 않는다.

Microsoft [META_ESCAPE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/a2f3ad96-e655-4f24-a371-d968aeb53852)는 enum EscapeFunction, ByteCount와 그 길이의 arbitrary bytes를 정의한다. `escape.zig`는 공식 [MetafileEscapes Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/55961a7b-f6f6-4f0b-a76b-b4cf652bc86b) 값과 정확한 byte count/WORD alignment를 검사하며 홀수 padding을 별도 보존한다. 개별 escape payload 의미는 이 단계에서 실행하거나 해석하지 않는다.

`text_records.zig`는 공용 record Iterator와 세 parser를 조립하고 필드 배치를 복제하지 않는다.

## 실제 HWP 대조와 범위

hash-pinned WMF 표본에는 SETTEXTALIGN 120개가 있고 baseline 0x18과 update-current-position 0x01이 각 60개다. 모두 optional Reserved가 있는 5 WORD이며 값은 0이다.

EXTTEXTOUT 60개는 option 0이라 `from_options`에서 Rect가 없고, 문자열 248바이트와 Dx 248개가 정확히 대응한다. 홀수 문자열 padding은 8개이며 그중 6개가 0이 아니다. x 합 136,594, y 합 133,130, Dx 합 13,484를 독립 Node 순회와 Zig 공개 API에서 대조한다.

ESCAPE 118개는 모두 function 0x000f(META_ESCAPE_ENHANCED_METAFILE)이고 data 합은 1,689바이트다. 홀수 data는 한 건이며 padding은 0이다. 현재는 이 payload의 내부 EMF chunk 의미를 완료로 세지 않는다.

합성 검증은 alignment flag/optional Reserved, signed YX, 음수·홀수 문자열, nonzero padding, Rect 명시 정책, Dx 부재/정확/잘림, escape enum/count/padding을 검사한다. font 선택과 charset decoding, text shaping, current-position 전이, clipping/opaque 적용, enhanced metafile 재조립 및 렌더링은 후속 단계다.

## 적대적 검증

정상 테스트 통과만으로 필드 소유권을 주장하지 않는다. 다음 결함을 하나씩 실제 구현에 주입하고 각 변이를 Debug, ReleaseSafe, ReleaseFast에서 실행했다.

1. 허용되지 않는 horizontal alignment 값 `0x0004`를 수용
2. EXTTEXTOUT의 X를 Y 위치에서 읽음
3. 홀수 문자열의 실제 padding 값을 버리고 0으로 치환
4. Dx 개수를 문자열 길이보다 하나 많게 요구
5. ESCAPE의 선언된 ByteCount를 무시하고 남은 record 길이에서 유도

15회 모두 기존 계약 또는 hash-pinned 실제 HWP 대조가 실패해 결함을 탐지했고, 각 변이를 제거한 뒤 정상 구현을 다시 검증한다. 특히 마지막 변이는 실제 ESCAPE data 합을 1,689바이트에서 1,690바이트로 바꾸어 세 최적화 모드 모두에서 탐지됐다. ByteCount를 3에서 4로 바꾸는 경우 기존 홀수 padding이 네 번째 데이터가 되어 구조적으로 유효하므로, 잘림 계약은 ByteCount 5로 검증한다.
