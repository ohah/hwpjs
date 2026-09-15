# EMF gradient fill

## 기준과 배치

Microsoft [EMR_GRADIENTFILL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1a3849c8-be6c-4d30-b5d3-f43b4c70ca0d), [GradientFill enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/699e75a0-28af-4d6f-b7aa-dc76e1b0001a), [TriVertex](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/33578509-8349-46b6-8f8f-107c3f70bace), [GradientRectangle](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/93ba94f7-84fc-4dd5-8c94-3d476aa7588b), [GradientTriangle](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9aa3346c-dc29-448d-9dcf-6a4f6b77d229)을 기준으로 한다.

36바이트 고정부 뒤에 `nVer * 16`바이트 TriVertex 배열과 `nTri * 12`바이트 mesh 배열이 온다. 사각형 mode의 mesh는 8바이트 GradientRectangle 뒤 반드시 존재하지만 무시하는 4바이트 padding이고, triangle mode는 12바이트 GradientTriangle이다.

## 책임

- `gradient_fill_mode.zig`: 수평·수직 사각형과 삼각형 mode 0~2의 값 영역
- `tri_vertex.zig`: signed x/y와 16비트 Red, Green, Blue, Alpha 원값
- `gradient_mesh.zig`: mode별 index/padding 구분 및 모든 index의 `index < nVer` 검사
- `gradient_fill.zig`: Bounds·count·mode와 checked u64 배열 extent 조립, indexed accessor, 의미 끝 뒤 `trailing_data` 보존
- `framing.zig`: 전체 record 순회 연결과 `gradient_fill_records` 집계

명세에 따라 Alpha 필드는 gradient fill 자체에서는 무시하지만 원본 u16 값은 보존한다. Bounds 재계산, 색 보간·dithering, 뒤따르는 ALPHABLEND 결합과 실제 픽셀 렌더링은 playback 계층 책임이다.

## 검증 기록

두 rectangle 방향과 triangle mode, signed 좌표, RGBA 16비트 wire 순서, rectangle padding과 triangle 제3 index 구분, 빈 배열, 복수 mesh offset, 모든 index 위치의 범위, rectangle 0~79바이트와 triangle 0~95바이트의 모든 동적 절단, 선언/실제 크기 불일치, 거대 count, mode 범위, trailing data, accessor 범위와 framing 오류 전파를 검사한다.

mode 범위 확장, Red/Green 교환, Alpha 손실, rectangle padding offset 이동, index 범위 검사 제거, TriVertex stride 축소, mesh stride 축소, trailing data 손실, Type 분류 제거, framing 집계 제거의 10개 독립 변이를 적용했다. Debug·ReleaseSafe·ReleaseFast의 `30/30` 변이 실행이 모두 실패하여 해당 회귀를 탐지했다.

첫 Type 분류 제거의 ReleaseFast 실행은 테스트가 nullable parse 결과를 `.?`로 강제 해제하여 실패 대신 정의되지 않은 값으로 진행하고 거대 반복에 빠졌다. 이 실행은 변이 탐지 근거에서 제외하고 중단했다. 테스트 전용 `expectParsed`가 null을 명시적 오류로 바꾸도록 보강한 뒤 정상 세 모드 기준선과 동일 변이 세 모드를 다시 실행했고, ReleaseFast도 즉시 실패하는 것을 확인했다.

동적 절단 검사 보강 후 최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1390/1390` 테스트를 통과했다.
