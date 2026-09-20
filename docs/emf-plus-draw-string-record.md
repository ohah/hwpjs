# EMF+ DrawString record

## 범위와 단일 출처

`emf_plus_draw_string.zig`는 MS-EMFPLUS 2.3.4.14의 Type, Flags, Size/DataSize, BrushId, FormatID, Length, LayoutRect, StringData와 AlignmentPadding을 조립합니다. Flags 하위 ObjectID는 Font 슬롯이며, S 비트에 따른 Brush 객체/ARGB 선택은 `emf_plus_brush_id.zig`, RectF wire 값은 `emf_plus_geometry.zig`, UTF-16 scalar 검사는 `text/utf16.zig`를 재사용합니다.

`emf_plus_optional_object_id.zig`는 optional u32 객체 참조의 단일 출처입니다. 0~63은 객체 테이블 ID로 노출하고 그 밖의 값은 raw를 보존한 채 참조 없음으로 둡니다. 명세가 FormatID의 특정 부재 sentinel을 정의하지 않으므로 `0xffffffff`만 특별 취급하지 않습니다. 기존 DrawImage 계열의 ImageAttributes ID도 같은 표현을 재사용합니다.

Length는 명세 최소 크기에 따라 1 이상이고 기본 최대값은 16 Mi 코드 유닛입니다. `DataSize = align4(28 + Length * 2)`, `Size = DataSize + 12`를 요구하며 선언 Size/DataSize, 실제 slice, 산술 한계와 모든 잘림을 검사합니다. StringData는 NUL 종결 문자열이 아니라 정확히 Length개의 UTF-16LE 코드 유닛입니다. 유효한 surrogate pair는 한 scalar로 세고 고립 surrogate는 거부하며 NUL·BOM은 제거하거나 정규화하지 않습니다. AlignmentPadding은 최대 3바이트를 빌려 보존하고 값은 검사하지 않습니다.

LayoutRect의 IEEE 754 값에는 별도 유한성 제약이 없으므로 음수 0, NaN과 무한대의 원비트를 보존합니다. reserved Flags도 원값으로 보존합니다.

## stream 연결과 미지원 경계

stream은 Font 슬롯이 존재하고 Font 타입인지 항상 확인합니다. S가 clear일 때만 Brush 슬롯, FormatID가 0~63일 때만 StringFormat 슬롯의 존재와 타입을 확인합니다. payload·참조·집계 오류는 comment 전체 상태를 원복하며 상위 EMF framing도 같은 경로를 사용합니다.

StringFormat의 CharacterRange와 실제 문자열 Length 사이 관계는 아직 검사하지 않습니다. 현재 Object Table 상태는 객체 타입만 유지하고 StringFormat payload를 보존하지 않기 때문입니다. 글꼴 shaping, layout, bidi, fallback, transform·clipping, 렌더링과 저장도 이 wire parser의 범위가 아닙니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 DrawString 결과와의 동등성은 주장하지 않습니다.

## 검증 기록

합성 fixture는 literal ARGB와 Brush 참조, Font 0~63 경계, optional FormatID raw와 0·63·64·`0xfffffffe`·`0xffffffff`, 홀수/짝수 Length와 padding, surrogate pair·고립 surrogate, NUL/BOM을 포함한 공통 UTF-16 계약, 비유한 RectF 원비트, Length 0·한도, 모든 payload 잘림, 독립 Size/DataSize/slice 불일치, 세 객체 참조의 존재·타입, 조건부 참조 생략, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

RecordType, 최소 envelope, DWORD 정렬, Size/DataSize 관계와 실제 slice, Length 최소값·한도·반환, UTF-16 byte 산술·검사, padding, 필드 순서, Font ID, Brush 선택, optional ID raw·0~63 경계, stream routing, 세 참조의 존재·타입·조건부 적용, report 대상·overflow를 각각 망가뜨린 26개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리하고 120초 watchdog을 적용해 Debug·ReleaseSafe·ReleaseFast 총 78/78회를 모두 검출했습니다. 모든 채택 로그를 다시 분류해 assertion 또는 expected-error 실패이며 컴파일 오류·시간 초과가 없음을 확인했습니다. 유효 로그는 `/tmp/hwpjs-emfplus-draw-string-mutants.6AtaP6`, 교체 변이는 `/tmp/hwpjs-emfplus-draw-string-mutants.Ebm7ig`와 `/tmp/hwpjs-emfplus-draw-string-mutants.xhCKWI`에 있습니다.

첫 캠페인은 반환 Length를 직접 확인하지 않은 공백과, Font 타입 변이가 앞선 DrawDriverString 검사에 적용된 위치 편향을 드러냈습니다. 두 테스트를 보강했습니다. Brush 값·조건부 참조 변이는 미사용 값과 문법 오류를 만든 무효 치환이라 결과에서 제외하고 동작은 유지한 채 의미만 잘못되도록 교체했습니다. FormatID 63 경계 테스트의 optional 강제 해제는 Debug·ReleaseSafe에서 panic으로 검출되어 nullable 값 자체를 비교하도록 고쳤고, 세 모드 모두 assertion 실패가 되는 유효 변이로 다시 실행했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,712/1,712 테스트(네이티브 1,673, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-string-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
