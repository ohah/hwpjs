# EMF 기본 점 drawing records

## 범위와 명세

`basic_point_drawing.zig`는 Microsoft [EMR_LINETO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9b3eccf9-4a55-4a9c-b0df-3c495e7b9a8c)와 EMR_SETPIXELV의 wire payload만 구분한다. LINETO는 Type/Size와 PointL을 합친 16바이트 필수 prefix이며, SETPIXELV는 그 뒤 ColorRef를 추가한 20바이트 필수 prefix다. 선언 Size와 실제 slice 길이는 같아야 하며 필수 prefix 뒤의 미정의 extra data는 공식 상위 규칙대로 무시한다.

PointL의 signed i32 little-endian XY는 `geometry.zig`가 단독 소유한다. SETPIXELV의 ColorRef는 `color_records.zig`와 같은 `wmf/color_ref.zig`를 재사용해 Red/Green/Blue/Reserved 순서와 Reserved=0을 적용한다. EMF 전용 색상 순서를 새로 복제하지 않는다.

## 책임 경계와 검증

- i32 최소·최대 좌표와 음수 좌표, RGB 각 채널 및 raw u32를 원문 순서대로 검사한다.
- LINETO 0..15바이트와 SETPIXELV 0..19바이트를 모두 거부하고, 4바이트 extra가 있는 레코드는 수용한다. 선언 Size와 slice 길이가 다르면 거부한다.
- ColorRef Reserved 비영 값을 거부하고 MOVETOEX·SETTEXTCOLOR를 이 drawing parser가 claim하지 않는지 검사한다.
- 합성 전체 EMF에 LINETO와 SETPIXELV를 함께 삽입하여 framing 연결과 잘못된 색상 오류 전파를 확인한다.

## 적대적 검증 기록

최초 구현은 정확히 16/20바이트만 수용했으나, 다음 기본 도형 파트에서 [MS-EMF 상위 record 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)의 미정의 끝 extra data `MUST be ignored`와 충돌함을 발견했다. 기존 정확 크기 변이 검증은 과거 계약에 대한 실행 이력으로만 남고, 현재 계약의 완료 근거로 사용하지 않는다.

수정된 공용 `record_extent.zig`에는 필수 prefix 잘림 허용, 선언/실제 길이 불일치 허용, extra data 거부의 세 변이를 적용했고 Debug·ReleaseSafe·ReleaseFast 모두에서 검출했다. 이 공용 경계를 재사용하는 기본 점 테스트도 같은 임시 root의 167개 테스트에 포함해 실행했다.

첫 변이 실행에서 `src/root.zig --test-filter`가 중첩 import 모듈의 테스트를 수집하지 않고 root collection test만 실행하는 위치 편향을 확인했다. 그 결과는 폐기했고, 대상 모듈과 framing integration을 직접 import하는 임시 test root로 다시 검증한 후 임시 파일을 제거했다.

호환성 수정 후 최종 `zig build audit --summary all`을 처음부터 재실행했다. Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,352/1,352 테스트를 통과했다. 이 중 native test는 1,313개이고, HWP corpus는 584개 파일에 대해 8,905,827개 조건을 검사했다.

LINETO가 갱신하는 current position, path bracket 안에서의 선 추가, pen/brush 적용과 SETPIXELV의 clipping·장치 색상 근사는 재생 계층의 책임이다. 구조 파싱 성공을 픽셀 렌더링 지원으로 확대하지 않는다. 실제 HWP corpus 584개에는 EMF가 없어 실제 한글 생성기 표본 근거도 없다.
