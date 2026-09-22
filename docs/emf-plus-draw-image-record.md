# EMF+ DrawImage record

## 범위와 단일 출처

`emf_plus_draw_image.zig`는 MS-EMFPLUS 2.3.4.8의 Type, Flags, Size/DataSize, ImageAttributesID, SrcUnit, SrcRect와 RectData를 조립합니다. Flags의 ObjectID는 Image 슬롯이며 C는 destination RectData의 Rect/RectF 표현만 선택합니다. C/ObjectID는 `emf_plus_record_flags.zig`, RectF와 RectData는 기존 geometry 계층이 소유합니다.

ImageAttributesID의 optional 해석은 `emf_plus_image_attributes_id.zig`가 소유합니다. 원문 u32를 항상 보존하고 0~63은 Object Table ID, 64 이상은 속성 없음으로 노출합니다. 이 공통 값은 다음 DrawImagePoints에서도 재사용하며 각 record가 sentinel 정책을 복제하지 않습니다.

## 크기와 필드 검증

data는 ImageAttributesID 4바이트, SrcUnit 4바이트, SrcRect RectF 16바이트와 destination RectData 순서입니다. C가 set이면 Size 44/DataSize 32의 Rect, clear이면 Size 52/DataSize 40의 RectF여야 합니다. Size, DataSize와 실제 slice 세 축을 독립적으로 검사합니다. Image ObjectID는 0~63만 허용하고 SrcUnit은 명세의 MUST에 따라 signed i32 원값 2인 UnitTypePixel만 승인합니다. source/destination float에는 별도 유한성·양수 제약이 없으므로 IEEE 754 원비트를 정규화하지 않습니다. reserved flags도 원값으로 보존합니다.

## optional ImageAttributes 호환 정책

공식 문서는 ImageAttributesID를 optional object의 index라고만 설명하고 부재 sentinel이나 범위 밖 값의 동작을 정의하지 않습니다. Wine GDI+ playback과 그 테스트는 `0xFFFFFFFF`, `0xFFFFFFFE`, 64 이상 및 범위 안의 미존재 슬롯을 모두 attributes 없음으로 처리합니다. 확인한 Wine revision은 `7b3fff76fa5178f6ce0141b2c776afa2a822f101`입니다.

wire parser는 이 관측과 optional 표현을 반영해 64 이상을 null로 보존합니다. strict stream은 0~63이면 실제 슬롯이 존재하고 ObjectTypeImageAttributes인지 요구합니다. 따라서 명시된 유효 범위의 깨진 참조를 조용히 null로 바꾸지는 않습니다. 이 선택은 공식 문서에 없는 값을 하나의 sentinel로 추정하지 않으면서 raw 값을 잃지 않는 명시적 호환 정책이며 휴리스틱이 아닙니다.

stream은 Flags의 Image ObjectID를 항상 존재하는 ObjectTypeImage로 확인하고, optional attributes ID가 0~63일 때만 ImageAttributes 타입을 확인합니다. payload·참조·집계 오류는 comment 전체 상태를 원복하며 상위 EMF framing은 같은 경로를 사용합니다.

## 미지원 경계와 검증 기록

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawImage 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, 두 객체 참조, source/destination rectangle, stream/framing 연결과 [rectangle source→device 좌표 map](emf-plus-image-rect-device-map.md)입니다. 이미지 복호화 연결, crop·sampling, ImageAttributes 효과 적용, clipping, 재생·rasterization과 저장은 미구현입니다.

합성 fixture는 C 양쪽 형식, Image ID 0·63·64, attributes ID 0·63·64·고위 원값, Pixel 외 모든 UnitType과 음수 원값, 서로 구별되는 source/destination 좌표, 비유한 float, 양쪽 형식의 모든 0~41바이트 slice 길이, 독립 Size/DataSize/slice 불일치, Image 및 조건부 ImageAttributes 존재·타입·부재, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

optional attributes ID 63 경계·raw 보존, 공용 C mask·Image ObjectID 64, RecordType, C별 data 크기, Size/DataSize/slice 세 축, Pixel SrcUnit, 반환 Image ID·C·attributes·source rectangle, stream routing·Image 존재/타입·attributes 조건부 조회/존재/타입·집계·overflow를 각각 망가뜨린 23개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리하고 공통 ID와 DrawImage 필터를 함께 실행해 Debug·ReleaseSafe·ReleaseFast 총 69/69회를 모두 검출했습니다. 생존·컴파일 실패·무변경 치환은 없으며 유효 로그는 `/tmp/hwpjs-emfplus-draw-image-mutants.kQZOJ1`입니다.

최초 캠페인은 변이 도구가 `@intCast`를 Perl 배열로 보간해 optional ID 경계 치환이 적용되지 않았으므로 실행 전에 전체 결과를 폐기했습니다. 모드 독립적인 ID 63 과소수용 변이로 교체해 처음부터 재실행한 두 번째 캠페인만 위 수치에 포함했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,678/1,678 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-image-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
