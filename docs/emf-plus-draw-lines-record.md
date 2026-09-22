# EMF+ DrawLines record

## 범위와 단일 출처

`emf_plus_draw_lines.zig`는 MS-EMFPLUS 2.3.4.10의 Type, Flags, Size/DataSize, Count와 PointData를 조립합니다. ObjectID는 Pen 슬롯이며 P/C와 0x2000 L flag는 `emf_plus_record_flags.zig`, 세 point wire 표현과 가변 PointR 소비는 `emf_plus_point_data.zig`가 소유합니다. 0x2000 값은 DrawImagePoints의 E와 동일하지만 `closesFigure`와 `hasEffect`를 record별 호출자가 명시적으로 선택하므로 의미를 혼용하지 않습니다.

Count는 명세의 MUST에 따라 2 이상이어야 하며 기본 최대값은 공용 PointData와 같은 16 Mi points입니다. P가 clear이면 C에 따라 `Count * 4` Point 또는 `Count * 8` PointF가 정확히 따라야 합니다. P가 set이면 C를 무시하고 PointR을 순서대로 소비한 뒤 최대 3바이트의 record 정렬 원문을 보존합니다. L이 set이면 마지막 점과 첫 점을 잇는 재생 의미를 `closes_figure`로 노출하지만 parser가 선분을 새로 만들지는 않습니다.

공식 Size/DataSize 표는 P 경로를 `Count * 2` 기반의 minimum이라고 설명합니다. PointR 한 점은 두 좌표가 각각 Integer7 또는 Integer15이므로 실제로 2~4바이트입니다. 따라서 최소 산술을 먼저 검사한 뒤 실제 PointR Count개를 완전히 소비하고 남은 padding 폭을 검사합니다. 고정 Point/PointF 경로는 공용 PointData가 정확한 길이를 요구합니다. Size의 DWORD 정렬, `Size == DataSize + 12`, 실제 slice도 독립적으로 검사하며 모든 곱셈·덧셈과 stream 집계는 overflow를 검사합니다.

reserved flags는 MUST be ignored에 따라 원값으로 보존합니다. PointF에는 별도 유한성 제약이 없어 음수 0, 무한대와 NaN 원비트도 정규화하지 않습니다. 상대 좌표 누적은 [공용 PointData resolver](emf-plus-point-resolution.md)가, L에 따른 마지막→첫 [선분 추가](emf-plus-polyline-geometry.md)는 공용 geometry 계층이 담당합니다.

## stream 연결과 미지원 경계

stream은 Pen ObjectID 슬롯이 존재하고 ObjectTypePen인지 확인합니다. 누락 Pen, 다른 객체 타입, payload·한도·집계 오류는 comment 전체 상태를 원복하고 상위 EMF framing은 같은 경로를 사용합니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawLines 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed point iteration, 공용 PointR 절대 좌표·open/closed 선분 해석, [일반 world/page/device endpoint 변환](emf-plus-polyline-device-segments.md), Pen 참조와 stream/framing 연결입니다. clipping·Pen stroke 재생과 저장은 미구현입니다.

## 검증 기록

합성 fixture는 P/C 세 형식, P에서 C 무시, L 양쪽, Count 2와 한도, ObjectID 0·63·64, signed i16 양 끝, 비유한 PointF, 혼합폭 PointR과 padding, 모든 prefix·point 잘림, 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

공용 P/C/L mask, Pen ObjectID 64, RecordType, Size 정렬·DataSize 관계·실제 slice, Count 최소값, P/고정 point 최소 폭, 최소 크기 검사, point 한도, 반환 Pen ID·P·C·L·Count, PointData P 전달, stream routing·Pen 존재/타입·집계·overflow를 각각 망가뜨린 24개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 72/72회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 유효 로그는 `/tmp/hwpjs-emfplus-draw-lines-mutants.RVk5Vp`입니다.

첫 캠페인에서는 실제 slice 검사를 제거한 변이가 생존했습니다. 기존 floating wrong-slice fixture가 downstream 고정 PointData 길이에서도 실패해 envelope 축을 독립적으로 증명하지 못한 테스트 위치 편향이었습니다. 유효 relative PointR은 실제 slice로 완성되지만 선언 DataSize만 더 큰 fixture를 추가한 뒤 전체 캠페인을 처음부터 재실행했으며 위 수치는 두 번째 캠페인만 포함합니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,688/1,688 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-lines-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
