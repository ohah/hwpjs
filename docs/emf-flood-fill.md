# EMF 확장 flood fill

## 기준과 범위

Microsoft [EMR_EXTFLOODFILL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4f1b52ba-325a-4da8-bd5b-987c4a572e5f)과 [FloodFill enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/931f06ab-2e8a-41dd-905f-cf56db613f69)을 기준으로 한다. 의미 prefix는 Type, Size, Start(PointL), Color(ColorRef), FloodFillMode의 24바이트다.

## 책임

- `flood_fill_mode.zig`는 `FLOODFILLBORDER=0`, `FLOODFILLSURFACE=1`의 값 영역을 단독 소유한다.
- `flood_fill.zig`는 EXTFLOODFILL만 분류하고 공통 `geometry.PointL`, WMF `color_ref`, `record_extent.requiredEnd`를 조립한다.
- ColorRef의 Reserved=0 규칙을 적용하고 signed 좌표·RGB 원값·mode와 의미 prefix 뒤 `trailing_data`를 보존한다.
- `framing.zig`는 전체 stream 구조 검사에 parser를 연결하고 `flood_fill_records`를 집계한다.

실제 flood fill 탐색, 현재 brush, clipping, 장치 색상 근사와 픽셀 렌더링은 playback 계층 책임이며 이번 wire parser 범위가 아니다.

## 검증 기록

i32 양 극값 좌표, RGB 채널 순서, 두 mode 값, 모든 0~23바이트 절단, 선언/실제 크기 불일치, ColorRef Reserved 비영 값, mode 범위 밖 값, 무관 Type 비수용, trailing data와 framing 오류 전파를 검사한다.

mode 범위 확장, Type 분류 제거, Start offset 이동, ColorRef Reserved 정책 완화, mode offset 이동, 필수 크기 약화, trailing data 손실, framing 집계 제거의 8개 독립 변이를 적용했다. Debug·ReleaseSafe·ReleaseFast의 `24/24` 변이 실행이 모두 실패하여 해당 회귀를 탐지했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1381/1381` 테스트를 통과했다.
