# EMF+ FillEllipse record

## 범위와 단일 출처

`src/image/emf/emf_plus_fill_ellipse.zig`는 MS-EMFPLUS 2.3.4.16의 Type, Flags, Size/DataSize, BrushId와 RectData를 조립합니다. S의 Brush ObjectID/literal ARGB 선택은 `emf_plus_brush_id.zig`, C와 Rect/RectF 선택 및 좌표 배치는 `emf_plus_record_flags.zig`와 `emf_plus_rect_data.zig`가 소유합니다.

C가 set이면 BrushId 4바이트와 EmfPlusRect 8바이트로 `DataSize=12`, `Size=24`입니다. C가 clear이면 EmfPlusRectF 16바이트로 `DataSize=20`, `Size=32`입니다. S가 clear일 때 BrushId는 0~63이고 set이면 모든 u32 ARGB를 허용합니다. 예약 flag는 명세대로 무시하되 원래 flags를 보존합니다.

## stream 연결과 미지원 경계

stream은 S가 clear일 때만 Brush 슬롯 존재와 ObjectTypeBrush를 검사하며 오류와 count overflow에서 comment 상태를 원복합니다. [공개 device-corner 연결](emf-plus-rect-record-device-corners.md)과 [affine ellipse basis](emf-plus-ellipse-device-basis.md)는 구현했지만 ellipse 각도 평가·fill, clipping, rasterization 및 저장은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusFillEllipse](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/62d7bb9e-707c-4d9b-a69a-660350e858cb)

## 검증 기록

S/C 네 조합, Brush ID 경계와 literal ARGB, i16 경계와 비유한 RectF 원시 비트, 모든 잘림과 세 envelope 축, 조건부 Brush 참조·집계·overflow rollback 및 실제 EMF framing을 검사합니다.

다섯 관점의 적대적 검토로 (1) BrushId 뒤 RectData 순서와 공식 고정 크기, (2) S/C 선택과 예약 flag 무시, (3) 공용 BrushIdOrColor·RectData SSOT, (4) 조건부 Brush 참조·stream 집계·rollback·상위 framing, (5) ellipse fill replay·실파일 표본·저장 미지원 경계를 대조했습니다.

RecordType, C·DataSize 선택, Size/DataSize/실제 slice 세 축, Brush 값·S 선택, RectData C 선택·시작 위치, 반환 Flags, stream routing·literal 분기·Brush 타입·집계 값·집계 대상을 각각 훼손한 16종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 48/48 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 작업 복사본은 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1860/1860 test를 통과했습니다. 모드별 구성은 native 1821, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
