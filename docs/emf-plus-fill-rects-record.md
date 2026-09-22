# EMF+ FillRects record

## 범위와 단일 출처

`src/image/emf/emf_plus_fill_rects.zig`는 MS-EMFPLUS 2.3.4.20의 Type, Flags, Size/DataSize, BrushId, Count와 RectData 배열을 조립합니다. S에 따른 Brush ObjectID/literal ARGB 선택은 `emf_plus_brush_id.zig`, C와 Rect/RectF 선택 및 배열 길이·한도·borrowed iterator는 `emf_plus_record_flags.zig`와 `emf_plus_rect_array.zig`가 소유합니다. DrawRects와 같은 배열 규칙을 복제하지 않습니다.

Count는 1 이상입니다. C가 set이면 `DataSize = 8 + Count * 8`, clear이면 `DataSize = 8 + Count * 16`이고 `Size = DataSize + 12`입니다. S가 clear일 때 BrushId는 0~63 객체 슬롯이고, set이면 모든 u32 ARGB 원값입니다. reserved Flags와 RectF의 signed zero·NaN·무한대는 정규화하지 않습니다.

## stream 연결과 미지원 경계

stream은 S가 clear일 때만 Brush 슬롯 존재와 ObjectTypeBrush를 확인합니다. literal ARGB는 같은 수치의 객체 슬롯을 참조하지 않습니다. 오류와 count overflow는 comment 전체 상태를 원복합니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 FillRects 표본과 렌더링 결과는 관측하지 못했습니다. [공개 device-corner iterator 연결](emf-plus-rect-record-device-corners.md)은 구현했지만 rectangle fill, clipping·rasterization과 저장은 미구현입니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusFillRects](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/8d510051-eeb2-482f-9964-e9cd1dad6fca)

## 검증 기록

C와 S의 네 조합, Count 0·1·2와 한도, Brush ID 0·63·64, literal ARGB, reserved Flags, i16 경계, 비유한 RectF 원비트, 모든 payload 잘림, 독립 Size/DataSize/slice 불일치, Brush 누락·타입 불일치, stream 집계·overflow rollback과 실제 EMF framing을 검사합니다.

다섯 관점의 적대적 검토로 (1) 공식 BrushId→Count→RectData 순서와 Size/DataSize 수식, (2) S와 C의 독립된 네 조합 및 reserved Flags, (3) BrushIdOrColor·RectArray 공용 SSOT와 한도 전달, (4) 조건부 Brush 참조·stream 집계·comment rollback·상위 framing, (5) fill replay·실제 한컴 표본·저장 미지원 경계를 대조했습니다.

RecordType, 최소 envelope, DataSize 관계, 실제 slice, Count 전달, C 선택, RectArray 시작 위치·Count·options 전달, 반환 Flags·Brush, stream routing·literal 분기·Brush 타입·checked count를 각각 훼손한 15종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 45/45 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 작업 사본은 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1850/1850 test를 통과했습니다. 모드별 구성은 native 1811, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
