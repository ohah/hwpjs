# EMF 기본 점 drawing records

## 범위와 명세

`basic_point_drawing.zig`는 Microsoft [EMR_LINETO](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9b3eccf9-4a55-4a9c-b0df-3c495e7b9a8c)와 EMR_SETPIXELV의 wire payload만 구분한다. LINETO는 Type/Size와 PointL을 합친 정확히 16바이트이며, SETPIXELV는 그 뒤 ColorRef를 추가한 정확히 20바이트다. 선언 Size와 실제 slice 길이를 독립적으로 검사한다.

PointL의 signed i32 little-endian XY는 `geometry.zig`가 단독 소유한다. SETPIXELV의 ColorRef는 `color_records.zig`와 같은 `wmf/color_ref.zig`를 재사용해 Red/Green/Blue/Reserved 순서와 Reserved=0을 적용한다. EMF 전용 색상 순서를 새로 복제하지 않는다.

## 책임 경계와 검증

- i32 최소·최대 좌표와 음수 좌표, RGB 각 채널 및 raw u32를 원문 순서대로 검사한다.
- LINETO의 0..19바이트 중 정확히 16바이트만, SETPIXELV의 0..23바이트 중 정확히 20바이트만 수용한다. 선언 Size만 다르게 만든 경우도 거부한다.
- ColorRef Reserved 비영 값을 거부하고 MOVETOEX·SETTEXTCOLOR를 이 drawing parser가 claim하지 않는지 검사한다.
- 합성 전체 EMF에 LINETO와 SETPIXELV를 함께 삽입하여 framing 연결과 잘못된 색상 오류 전파를 확인한다.

## 적대적 검증 기록

다음 변이를 임시 복사본에만 적용하고 Debug·ReleaseSafe·ReleaseFast에서 각각 테스트가 실패하는지 검사했다. 다섯 변이는 모든 모드에서 감지됐다.

- LINETO의 정확한 16바이트 조건을 최소 크기 조건으로 완화
- SETPIXELV의 정확한 20바이트 조건을 최소 크기 조건으로 완화
- PointL x를 little-endian 대신 big-endian으로 해석
- ColorRef Reserved=0 정책을 미검증 보존으로 완화
- framing의 basic point parser 호출을 제거

첫 변이 실행에서 `src/root.zig --test-filter`가 중첩 import 모듈의 테스트를 수집하지 않고 root collection test만 실행하는 위치 편향을 확인했다. 그 결과는 폐기했고, 대상 모듈과 framing integration을 직접 import하는 임시 test root로 다시 검증한 후 임시 파일을 제거했다.

최종 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,347/1,347 테스트를 통과했다. 이 중 native test는 1,308개이고, HWP corpus는 584개 파일에 대해 8,905,827개 조건을 검사했다.

LINETO가 갱신하는 current position, path bracket 안에서의 선 추가, pen/brush 적용과 SETPIXELV의 clipping·장치 색상 근사는 재생 계층의 책임이다. 구조 파싱 성공을 픽셀 렌더링 지원으로 확대하지 않는다. 실제 HWP corpus 584개에는 EMF가 없어 실제 한글 생성기 표본 근거도 없다.
