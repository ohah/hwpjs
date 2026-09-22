# EMF+ FillPie record

## 범위와 단일 출처

`src/image/emf/emf_plus_fill_pie.zig`는 MS-EMFPLUS 2.3.4.18의 Type, Flags, Size/DataSize, BrushId와 StartAngle·SweepAngle·RectData를 조립합니다. S의 Brush ObjectID/literal ARGB 선택은 `emf_plus_brush_id.zig`, C와 두 각도 뒤 Rect/RectF 배치는 `emf_plus_record_flags.zig`와 `emf_plus_arc_data.zig`가 소유합니다.

C가 set이면 BrushId 4바이트와 ArcData 16바이트로 `DataSize=20`, `Size=32`입니다. C가 clear이면 ArcData 24바이트로 `DataSize=28`, `Size=40`입니다. S가 clear일 때 BrushId는 0~63이고 set이면 모든 u32 ARGB를 허용합니다. 예약 flag는 명세대로 무시하되 원래 flags를 보존합니다.

## stream 연결과 미지원 경계

stream은 S가 clear일 때만 Brush 슬롯 존재와 ObjectTypeBrush를 검사하며 오류와 count overflow에서 comment 상태를 원복합니다. wire parser는 비유한 값을 포함한 원시 f32 비트를 보존하고 [affine arc geometry](emf-plus-arc-device-geometry.md)가 공식 modulo·clamp를 적용합니다. [공개 device-corner 연결](emf-plus-rect-record-device-corners.md), [endpoint·radial edge 평가](emf-plus-arc-device-points.md), [exact conic segment](emf-plus-arc-device-segments.md)도 구현했지만 닫힌 fill boundary 조립·flattening, clipping·rasterization 및 저장은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusFillPie](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/59c3a6cc-1ab5-436c-b39a-b341779af88f)

## 검증 기록

S/C 네 조합, Brush ID 경계와 literal ARGB, 각도·RectF 원시 비트, i16 경계, 모든 잘림과 세 envelope 축, 조건부 Brush 참조·집계·overflow rollback 및 실제 EMF framing을 검사합니다.

다섯 관점의 적대적 검토로 (1) BrushId→StartAngle→SweepAngle→RectData 순서와 공식 고정 크기, (2) S/C 선택과 예약 flag 무시, (3) 공용 BrushIdOrColor·ArcData SSOT, (4) 조건부 Brush 참조·stream 집계·rollback·상위 framing, (5) modulo·clamp·pie fill replay·실파일 표본·저장 미지원 경계를 대조합니다.

RecordType, C·DataSize 선택, Size/DataSize/실제 slice 세 축, Brush 값·S 선택, ArcData C 선택·시작 위치, 반환 Flags·각도 매핑, stream routing·literal 분기·Brush 타입·집계 값·집계 대상을 각각 훼손한 17종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 51/51 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 작업 복사본은 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1865/1865 test를 통과했습니다. 모드별 구성은 native 1826, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
