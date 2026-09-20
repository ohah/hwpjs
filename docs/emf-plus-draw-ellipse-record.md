# EMF+ DrawEllipse record

## 범위와 단일 출처

`emf_plus_draw_ellipse.zig`는 MS-EMFPLUS 2.3.4.7의 Type, Flags, Size/DataSize와 RectData를 조립합니다. C/ObjectID는 `emf_plus_record_flags.zig`, C별 EmfPlusRect/EmfPlusRectF 선택은 `emf_plus_rect_data.zig`, 실제 좌표 wire 값은 `emf_plus_geometry.zig`가 소유합니다. Ellipse parser는 이 규칙을 복제하지 않습니다.

C가 set이면 Size 20/DataSize 8의 signed i16 Rect, clear이면 Size 28/DataSize 16의 RectF여야 합니다. Size, DataSize와 실제 slice 세 축을 독립적으로 검사하고 ObjectID 0~63만 허용합니다. 나머지 flag는 명세의 MUST be ignored에 따라 거부하지 않고 원값을 보존합니다. RectF에는 별도 유한성·양수 제약이 없으므로 음수 0, 무한대와 NaN 원비트도 wire parser가 정규화하지 않습니다.

## Object Table 연결과 미지원 경계

stream은 ObjectID 슬롯이 이미 존재하고 ObjectTypePen인지 확인하며 성공한 record 수만 집계합니다. 누락 Pen, 다른 객체 타입, payload·집계 오류는 comment 전체 상태를 원복합니다. 상위 EMF framing은 같은 stream 경로를 사용하고 Ellipse payload 규칙을 복제하지 않습니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawEllipse 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, 공용 RectData, Object Table 참조와 stream/framing 연결입니다. ellipse rasterization, transform·clipping 적용과 저장은 미구현입니다.

## 검증 기록

합성 fixture는 C 양쪽 형식, ObjectID 0·63·64, reserved flags, signed i16 양 끝, 서로 구별되는 RectF 원비트, 양쪽 형식의 모든 0~17바이트 slice 길이, 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

공용 C mask, ObjectID 64 과수용, RecordType, C별 data 크기, Size/DataSize/slice 세 축, 반환 Pen ID·C, RectData 선택, stream routing·Pen 누락·타입·집계·overflow를 각각 망가뜨린 16개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 48/48회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 유효 로그는 `/tmp/hwpjs-emfplus-draw-ellipse-mutants.NkOI5z`입니다.

최초 캠페인의 ObjectID 64 변이는 범위 검사만 65로 완화해 Debug·ReleaseSafe에서는 u6 축소 cast trap, ReleaseFast에서는 안전 검사 제거로 의미가 달라졌으므로 전체 결과를 폐기했습니다. 64를 명시적으로 잘못 0으로 반환하는 모드 독립 변이로 교체해 처음부터 재실행한 두 번째 캠페인만 위 수치에 포함했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,672/1,672 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-ellipse-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
