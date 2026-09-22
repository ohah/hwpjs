# EMF+ FillPath record

## 범위와 단일 출처

`src/image/emf/emf_plus_fill_path.zig`는 MS-EMFPLUS 2.3.4.17의 Type과 Path 대상 이름만 조립합니다. FillPath와 FillRegion이 공유하는 고정 Size/DataSize, Flags의 ObjectId와 S, BrushId 해석은 `emf_plus_fill_object.zig`가 단일 소유하고, Brush ObjectID/literal ARGB 선택은 `emf_plus_brush_id.zig`가 소유합니다.

record는 항상 `Size=16`, `DataSize=4`입니다. ObjectId는 0~63의 Path 객체 슬롯입니다. S가 clear일 때 BrushId도 0~63의 Brush 객체 슬롯이고, set이면 모든 u32 ARGB를 허용합니다. S와 ObjectId 이외의 flag는 명세대로 무시하되 원래 flags를 보존합니다.

## stream 연결과 미지원 경계

stream은 Path 슬롯의 존재와 ObjectTypePath를 항상 검사합니다. S가 clear일 때만 Brush 슬롯 존재와 ObjectTypeBrush를 추가 검사하며, 오류와 count overflow에서 comment 상태를 원복합니다. Path geometry 해석은 기존 Path 객체 모듈의 책임이고 이 record에서 다시 파싱하지 않습니다. 열린 figure를 포함한 fill boundary topology는 [Path fill boundary 계층](emf-plus-path-fill-segments.md)이 구현했고 독립 Path 객체 API는 [fill segment의 일반 world/page/device 변환](emf-plus-path-device-segments.md)을 제공합니다. Object Table의 실제 Path payload 보유와 이 record replay 연결, fill mode·Brush·clipping 적용, rasterization 및 저장은 아직 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 공식 근거

- [MS-EMFPLUS EmfPlusFillPath](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/4a7b2c37-ba3d-42d8-a3cc-113af57958e9)

## 검증 기록

공통 계층에서 ObjectId/Brush ID 0·63·64 경계, 객체/literal Brush 양쪽, 예약 flag 보존, 모든 payload 잘림과 세 envelope 축을 검사합니다. FillPath wrapper는 Type과 공통 크기 오류 매핑을, stream은 Path 및 조건부 Brush 참조·타입·집계·overflow rollback을, 상위 검사는 실제 EMF framing을 확인합니다. FillRegion 집중 테스트도 함께 실행해 공통화 회귀를 검사합니다.

다섯 관점의 적대적 검토로 (1) 고정 BrushId payload와 공식 크기, (2) S와 ObjectId의 독립 선택 및 예약 flag 무시, (3) FillPath/FillRegion 공통 wire SSOT와 Path 객체 parser 책임 분리, (4) Path/Brush 참조·stream 집계·rollback·상위 framing, (5) Path geometry 재파싱 금지·fill replay·실파일 표본·저장 미지원 경계를 대조합니다.

공통 Size/DataSize/실제 slice 세 축, BrushId endian, ObjectId, Brush 값·S 선택, 반환 Flags, wrapper Type·오류·Path 매핑, stream routing·Path 존재/타입·literal 분기·Brush 존재/타입·집계 값·집계 대상을 각각 훼손한 19종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 57/57 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 작업 복사본은 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1875/1875 test를 통과했습니다. 모드별 구성은 native 1836, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
