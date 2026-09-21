# EMF+ FillPolygon record

## 범위와 단일 출처

`src/image/emf/emf_plus_fill_polygon.zig`는 MS-EMFPLUS 2.3.4.19의 Type, Flags, Size/DataSize, BrushId, Count와 PointData를 조립합니다. S의 Brush ObjectID/literal ARGB 선택은 `emf_plus_brush_id.zig`, P/C와 PointR·Point·PointF 및 가변 폭·padding·한도는 `emf_plus_record_flags.zig`와 `emf_plus_point_data.zig`가 소유합니다.

Count는 3 이상입니다. P가 clear이면 C에 따라 `DataSize = 8 + Count * 4` 또는 `8 + Count * 8`입니다. P가 set이면 C를 무시하고 PointR Count개를 실제 소비하며 `align4(8 + Count * 2)`는 최소값입니다. 남은 0~3바이트는 alignment padding으로 보존합니다. S가 clear일 때 BrushId는 0~63이고 set이면 모든 u32 ARGB를 허용합니다.

## stream 연결과 미지원 경계

stream은 S가 clear일 때만 Brush 슬롯 존재와 ObjectTypeBrush를 검사하며 오류·한도·count overflow에서 comment 상태를 원복합니다. 상대 좌표 누적은 [공용 PointData resolver](emf-plus-point-resolution.md)가 담당합니다. 마지막 점과 첫 점의 닫힘, polygon fill·transform·clipping 및 저장은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusFillPolygon](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/813d7a7b-835d-4159-a8a8-bc3547a878e2)

## 검증 기록

P/C 세 encoding과 P에서 C 무시, S 양쪽, Count 0~3과 한도, Brush ID 경계와 literal ARGB, i16 경계·비유한 PointF·혼합폭 PointR·padding, 모든 잘림과 세 envelope 축, 조건부 Brush 참조·집계·overflow rollback 및 실제 EMF framing을 검사합니다.

다섯 관점의 적대적 검토로 (1) BrushId→Count→PointData 순서와 공식 최소 크기, (2) S 및 P/C 선택과 P에서 C 무시, (3) 공용 BrushIdOrColor·PointData SSOT와 가변 PointR/padding·한도, (4) 조건부 Brush 참조·stream 집계·rollback·상위 framing, (5) 좌표 누적·닫힘·fill replay·실파일 표본·저장 미지원 경계를 대조했습니다.

RecordType, DataSize 관계, 실제 slice, Count 최소값, P/C 선택, PointR 최소 폭, PointData 시작 위치·Count·P·options 전달, 반환 Flags·Brush, stream routing·literal 분기·Brush 타입·checked count를 각각 훼손한 17종 유효 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 51/51 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 작업 사본은 제거했습니다. 공통 framing 뒤 동작이 달라지지 않는 최소 Size 완화와 downstream PointData가 동일하게 거부하는 prefix 최소값 완화는 무효 변이로 분류해 결과에서 제외했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1855/1855 test를 통과했습니다. 모드별 구성은 native 1816, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
