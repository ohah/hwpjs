# EMF layout mode

## 현재 계약

`src/image/emf/layout_mode.zig`는 `EMR_SETLAYOUT`(0x73)의 정확한 12바이트 record와 LayoutMode DWORD를 해석합니다. `LAYOUT_LTR`은 두 비트가 모두 꺼진 기본값이며, `LAYOUT_RTL`(0x1)과 `LAYOUT_BITMAPORIENTATIONPRESERVED`(0x8)를 독립 bool과 raw 값으로 보존합니다. 정의된 조합은 0, 1, 8, 9입니다.

공식 레코드 명세가 Size를 0x0C로 고정하므로 짧은 record, 긴 record, 선언 크기와 실제 slice가 다른 record를 모두 거부합니다. 두 정의 비트 이외의 비트도 거부합니다. 일반 state record의 선택적 alignment padding 규칙을 이 고정 record에 임의로 적용하지 않습니다.

전체 EMF framing은 이 parser를 호출해 잘못된 layout을 문서 수준에서 거부합니다. 실제 playback DC의 좌우 반전, 텍스트 정렬 flag 재해석, bitmap mirroring은 렌더러 범위로 아직 구현하지 않았습니다.

## 검증 기록

- 네 유효 조합, 각 bool과 raw 보존을 검사합니다.
- 30개 미정의 단일 비트와 전체 비트 composite, 모든 고정 길이 경계, 긴 record, 선언/실제 길이 불일치, unrelated type을 검사합니다.
- dispatch, 정확한 크기의 두 축, DWORD offset, 비트 마스크 누락·과허용, 두 bool 매핑, raw 보존, framing 연결의 10개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 실행했습니다. 최초 과허용 변이가 제품 `defined_flags`를 oracle로 재사용한 테스트를 빠져나가는 문제를 재현했고, 공식 리터럴 기반 독립 oracle로 바꾼 뒤 30/30 검출을 확인했습니다.
- 기존 HWP corpus에는 EMF 표본이 관측되지 않았으므로 실제 문서 playback 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.17 `EMR_SETLAYOUT Record`
- Microsoft Win32 `SetLayout function`
