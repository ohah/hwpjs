# EMF+ DrawImagePoints record

## 범위와 단일 출처

`emf_plus_draw_image_points.zig`는 MS-EMFPLUS 2.3.4.9의 Type, Flags, Size/DataSize, ImageAttributesID, SrcUnit, SrcRect, Count와 PointData를 조립합니다. ObjectID는 Image 슬롯이며 P/C는 기존 `emf_plus_record_flags.zig`와 `emf_plus_point_data.zig`가 해석합니다. optional attributes의 raw/null 정책은 DrawImage와 공유하는 `emf_plus_image_attributes_id.zig`, SrcRect는 공용 RectF가 소유합니다.

E `0x2000`은 `emf_plus_record_flags.zig`가 소유하며 앞선 SerializableObject image effect 요구를 나타냅니다. parser는 flag를 보존하고 stream이 record 순서 상태를 연결합니다. effect parameter block 자체의 검증과 효과별 집계는 기존 SerializableObject 계층을 그대로 사용합니다.

## 크기·point 표현 검증

고정 prefix는 ImageAttributesID 4바이트, Pixel SrcUnit 4바이트, SrcRect 16바이트와 Count 4바이트입니다. Count는 명세의 MUST에 따라 정확히 3만 허용합니다.

- P가 set이면 C를 무시하고 세 PointR을 8바이트 영역에서 해석해 Size 48/DataSize 36을 요구합니다. 실제 PointR 소비 뒤 0~2바이트 정렬 원문을 빌립니다.
- P가 clear이고 C가 set이면 세 signed i16 Point로 Size 52/DataSize 40을 요구합니다.
- P와 C가 모두 clear이면 세 PointF로 Size 64/DataSize 52를 요구합니다.

Size, DataSize와 실제 slice 세 축을 독립적으로 검사합니다. Image ObjectID는 0~63, SrcUnit은 signed i32 원값 2인 UnitPixel만 허용합니다. PointF와 SrcRect는 별도 유한성·양수 제약이 없어 IEEE 754 원비트를 유지합니다. wire parser는 좌표를 변환하지 않고, relative point 누적·네 번째 parallelogram 점·SrcRect affine transform은 각각 전용 geometry 계층이 소유합니다.

## stream 연결과 호환 정책

stream은 Image 슬롯의 존재와 ObjectTypeImage를 항상 확인하고, attributes ID가 0~63일 때만 ObjectTypeImageAttributes를 확인합니다. E가 set이면 같은 EMF+ stream에서 앞서 검증된 SerializableObject image effect가 하나 이상 있어야 합니다. 뒤에 나오는 effect나 손상된 effect를 선행 효과로 인정하지 않습니다. payload·참조·효과 순서·집계 오류는 comment 전체 상태를 원복합니다.

ImageAttributes 범위 밖 raw 값의 정책과 Wine 근거는 [DrawImage](emf-plus-draw-image-record.md)의 공통 계약을 그대로 적용합니다. Wine은 E를 인식하지만 효과 적용은 미지원으로 남기므로, 그 구현의 렌더링 결과를 효과 의미의 oracle로 사용하지 않습니다.

## 미지원 경계와 검증 기록

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawImagePoints 표본과 효과·렌더링 결과를 관측하지 못했습니다. 구현 범위는 wire 구조, 세 point 표현, [공용 PointR 절대 좌표 해석](emf-plus-point-resolution.md), [destination parallelogram 조립](emf-plus-image-parallelogram.md), [SrcRect→destination affine transform](emf-plus-image-affine-map.md), [source→world→page→device 순차 map](emf-plus-image-source-device-map.md), 객체·선행 effect 참조와 stream/framing 연결입니다. crop·픽셀 sampling, ImageAttributes 및 image effect 적용, clipping, rasterization과 저장은 미구현입니다.

합성 fixture는 P/C 세 형식, P에서 C 무시, E 양쪽, Count 정확히 3, PointR 정렬, signed i16 양 끝, 비유한 PointF/SrcRect, Pixel 외 UnitType, Image·optional attributes·선행 effect의 존재·타입·순서, 모든 0~53바이트 slice 길이, 독립 Size/DataSize/slice 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

공용 P/C/E mask, Image ObjectID 64, RecordType, 세 data 크기, Size/DataSize/slice 세 축, Pixel SrcUnit, Count 조건과 반환값, 반환 Image ID·P·C·E·attributes·source rectangle, PointData P 전달, stream routing·선행 effect·Image 존재/타입·attributes 조건부 조회/존재/타입·집계·overflow를 각각 망가뜨린 30개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 90/90회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 유효 로그는 `/tmp/hwpjs-emfplus-draw-image-points-mutants.sDyczV`입니다.

첫 캠페인에서는 검증된 Count를 반환 구조체에서 0으로 바꾸는 변이가 생존해 전체 결과를 폐기하고 Count 보존 단언을 추가했습니다. 두 번째 캠페인은 같은 변이까지 검출했지만 `/tmp` 공간 부족으로 중단되어 전체를 폐기했습니다. 제가 만든 이전 변이 복사본을 정확한 경로로 정리한 후 처음부터 재실행한 세 번째 캠페인만 위 수치에 포함했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,683/1,683 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-image-points-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
