# EMF+ DrawArc record

## 범위와 단일 출처

`emf_plus_record_flags.zig`는 Object 및 drawing·clipping record가 공유하는 저위 8비트 ObjectID 범위 0~63과 drawing Flags의 C 비트 `0x4000`을 소유합니다. 나머지 reserved 비트는 호출자가 원문 Flags로 보존합니다. `emf_plus_geometry.zig`는 signed i16 EmfPlusRect를 기존 PointF·RectF와 함께 소유하고, `emf_plus_rect_data.zig`는 C가 set이면 Rect 8바이트, clear이면 RectF 16바이트를 선택합니다.

`emf_plus_draw_arc.zig`는 [MS-EMFPLUS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/5f92c789-64f2-46b5-9ed4-15a9bb0946c6) 2.3.4.2의 Type, Flags, Size/DataSize를 조립합니다. DrawPie와 동일한 StartAngle·SweepAngle·RectData 순서 및 C별 byte length는 `emf_plus_arc_data.zig`가 단일 출처이며 두 record parser가 재사용합니다. `emf_plus_stream.zig`는 완성 record를 호출하고 Pen ObjectID의 존재·타입과 집계만 소유합니다. 상위 EMF framing은 comment routing을 재사용하며 payload 규칙을 복제하지 않습니다.

## 표현과 검증

C가 set이면 Size 28/DataSize 16/실제 data 16바이트, clear이면 각각 36/24/24바이트여야 합니다. 공개 parser는 세 크기 축을 독립적으로 검사합니다. ObjectID 64 이상은 명세의 MUST 범위를 벗어나므로 거부합니다. 참고 Rust 구현이 범위 밖 참조를 재생 시점까지 보존하는 것과 달리 이 wire validator는 공식 범위를 즉시 적용합니다.

StartAngle과 SweepAngle은 IEEE 754 원비트를 보존합니다. 명세의 modulo 360과 -360~360 clamp는 렌더링 해석 규칙이므로 parser가 값을 덮어쓰지 않습니다. reserved Flags도 MUST be ignored이므로 비zero 값을 거부하지 않습니다. Rect와 RectF는 공통 reader를 사용하며 compressed 값을 임의로 float로 정규화하지 않습니다.

Stream은 해당 ObjectID 슬롯이 이미 존재하고 ObjectTypePen인지 확인합니다. 누락 슬롯, 다른 객체 타입, count overflow와 payload 오류는 comment 전체 상태를 원복합니다. 이는 Pen payload 자체의 완전한 의미 검증이나 실제 arc 재생을 뜻하지 않습니다.

## 검증 기록

합성 fixture는 C 양쪽 형식, ObjectID 0·63·64, 모든 reserved Flags, signed i16 양 끝, 서로 다른 RectF 값, 각도 원비트, Type과 독립 Size/DataSize/slice 불일치, 모든 prefix 길이, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

공용 C mask, ObjectID 64 과수용, Rect/RectF 필드 전달, RectData 선택, RecordType, 세 크기 축, C별 크기, reserved Flags 과거부, PenId 손실, 두 각도 순서, stream routing·parser 호출, Pen 누락·타입 검사, count overflow, 상위 framing routing을 각각 망가뜨린 19개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast 57/57회를 모두 검출했습니다.

최초 Rect 선택 반전은 안전 모드에서 union tag panic, stream parser 우회는 변이 생성기의 `@` 치환 오류, Pen 타입 검사 제거는 미사용 변수 컴파일 오류였으므로 9회를 결과에서 제외했습니다. 타입 안전한 RectData 값 손실, 컴파일 가능한 parser 우회, 불가능한 타입 조건으로 각각 교체해 세 모드에서 다시 검출했습니다. 유효 복사본은 `/tmp/hwpjs-emfplus-draw-arc-mutants.Pf9IOp`, 로그는 `/tmp/hwpjs-draw-arc-mutation-<변이>-<모드>.log`와 세 교체 변이의 `-valid-` 로그입니다.

현재 corpus에는 EMF+ signature가 없어 실제 한컴 DrawArc 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, Object Table 참조, stream/framing 연결과 합성·변이 검증이며 그래픽 재생이나 저장은 미구현입니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,642/1,642 테스트(네이티브 1,603, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-arc-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

후속 DrawPie 구현에서 angle·RectData 배치를 `emf_plus_arc_data.zig`로 추출했습니다. 기존 DrawArc parser·stream·framing 6개를 Debug·ReleaseSafe·ReleaseFast에서 다시 실행했고 모두 통과했습니다. 공용 길이·각도 순서·Rect 선택은 [DrawPie 검증](emf-plus-draw-pie-record.md)의 독립 ArcData 테스트와 유효 의미 변이에도 포함됩니다. 위 1,642 수치는 당시 기록이며 최신 전체 수치는 DrawPie 문서가 소유합니다.
