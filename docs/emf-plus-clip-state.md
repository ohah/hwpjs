# EMF+ clipping graphics state 재생

## 공식 의미와 상태 표현

[MS-EMFPLUS 2.3.1](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/f5865a6d-de42-49bd-a181-74ecb2956702)은 clipping record가 world space의 현재 clipping region을 조작한다고 정의합니다. 기본값과 ResetClip 결과는 무한 영역이며 SetClipRect/Path/Region은 CombineMode로 기존 영역과 operand를 결합하고 OffsetClip은 현재 영역을 평행 이동합니다. [Microsoft GDI+ Graphics](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusgraphics/nl-gdiplusgraphics-graphics)는 Save가 clipping region을 포함한 현재 상태를 저장한다고 설명합니다.

`src/image/emf/emf_plus_clip_state.zig`가 renderer 없이 증명 가능한 clipping 상태의 단일 출처입니다. 추상 상태는 `infinite`, `empty`, geometry를 유지하지 못한 `complex` 중 하나입니다. Reset과 operand geometry에 무관하게 증명되는 무한/공집합의 집합 항등식만 정확히 재생하며 나머지는 추측하지 않고 `complex`로 승격합니다.

tracked stream은 다섯 clipping record를 이 상태에 적용하고 `Report.clip`에 성공한 comment 이후 값을 노출합니다. Save/Restore와 Begin/EndContainer snapshot에 clip 상태가 포함되며 malformed comment는 state와 report를 함께 rollback합니다. allocation-free `State.consume`은 구조 조사 API이므로 `Report.clip`은 `null`입니다.

## 의도적인 한계

현재 Object Table은 Path/Region 슬롯의 타입과 수명만 보존하고 완성된 객체 payload를 장기 소유하지 않습니다. 또한 SetClip operand는 당시 world/page transform으로 device space에 변환된 뒤 결합되지만 현재 clip state는 그 device geometry를 소유하지 않습니다. 이 해석은 Wine의 독립 playback 경로가 `get_graphics_transform(... Device, World ...)` 뒤 region을 변환하고 결합하는 [실제 소스](https://github.com/wine-mirror/wine/blob/master/dlls/gdiplus/metafile.c)와도 대조했습니다. 따라서 RectF·Path·Region의 실제 boolean 결과나 clipping mask를 만들 수 없습니다. `complex`는 지원 완료 표기가 아니라 이 정보 경계를 드러내는 보수적 상태입니다. 정확한 clipping에는 객체 payload 소유 모델, 변환 시점의 device geometry와 region/path boolean 계층이 먼저 필요합니다.

RectF의 NaN, 무한대, signed zero와 음수 크기는 wire parser가 그대로 유지합니다. 추상 상태는 이 값을 임의 정규화하거나 geometry 결과로 오인하지 않습니다. OffsetClip도 무한·공집합·복합이라는 추상 분류만 보존합니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력과의 픽셀 동등성은 주장하지 않습니다.

## 검증 계약

- 여섯 CombineMode 각각에 대해 무한/공집합에서 증명 가능한 항등식과 보수적 승격을 검사합니다.
- SetClipRect/Path/Region, OffsetClip과 Reset의 추상 상태 연결을 검사합니다.
- Save/Restore와 Begin/EndContainer 복원, report 동기화, malformed comment 원자성을 검사합니다.
- wire parser의 기존 크기·참조·count 검증은 각 record 문서의 테스트를 계속 사용합니다.

Replace 승격, Intersect/Complement 항등식, Reset, SetClipRect/Path/Region 연결, snapshot 보존과 report 연결의 서로 독립적인 아홉 의미 변이를 모드별 새 cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 총 27/27이 컴파일 성공 뒤 테스트 의미 실패로 검출됐고 생존·컴파일 오류·timeout은 0입니다. 정확한 rectangle을 잘못 주장하던 초안과 그 변이 결과는 적대적 검토 후 폐기했으며 최종 증거로 세지 않습니다. 최종 로그는 `/tmp/hwpjs-clip-v2-{replace,intersect,complement,reset,rect,path,region,snapshot,report}-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

최종 소스를 고정한 뒤 전체 `audit`를 세 모드에서 순차 실행했습니다. 각 모드는 40/40 단계와 1,904/1,904 테스트(native 1,865, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했습니다. 로그는 `/tmp/hwpjs-clip-state-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
