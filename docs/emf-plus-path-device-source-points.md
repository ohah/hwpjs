# EMF+ Path device 원본 point 순회

## 책임과 근거

[EmfPlusPath](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/b539cf16-6232-4705-9f6e-6f914705145f)는 모든 원본 point에 point type을 연결하며 Bézier의 start, control1, control2, end 순서를 지정합니다. `src/image/emf/emf_plus_path_device_source_points.zig`는 기존 [device command](emf-plus-path-device-commands.md)를 소비해 Move, Line endpoint, Bézier control1·control2·endpoint의 원본 point를 순서대로 반환합니다. 좌표 변환이나 Path wire 문법을 다시 구현하지 않습니다.

반복자는 각 point의 device 좌표, 원본 `PathPointType`과 RLE B, 전체·figure별 원본 index, figure index와 역할을 제공합니다. Bézier가 평탄화되기 전에 순회하므로 control point를 잃지 않고, 생성된 중간점·closing point를 원본으로 취급하지 않습니다. 오류 시 이전에 반환된 point 이후의 반복자 상태를 유지합니다. 이 계층은 [marker 위치](emf-plus-path-device-marker-points.md)와 [DashMode 위치](emf-plus-path-device-dash-points.md)의 단일 point/role/index 출처입니다.

## 검증과 경계

합성 입력에서 Move·Line·Bézier의 다섯 역할, 닫힌 figure 뒤 새 Move, 원본 전체/figure별 index, 비대칭 좌표 변환과 raw type을 대조합니다. 잘못된 Bézier sequence에서 같은 오류가 반복되고 상태가 변하지 않는지도 검사합니다. source point 순회는 실제 stroke/fill, Pen dash, marker 조작, 렌더링을 수행하지 않습니다.

적대적 검증에서는 control1·control2 역할 교환, 전역 point index 진행, 새 figure의 내부 index 재시작, DashMode/PathMarker 필터 교환과 DashMode 조건 반전의 7종 의미 변이를 독립 `src/` 복사본에 적용했습니다. 변이·모드마다 별도 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 총 21/21회가 모두 테스트 assertion으로 검출됐으며 컴파일 오류·panic·생존은 없습니다. 캠페인은 `/private/tmp/hwpjs-path-dash-mutants.T3R1uS`에서 실행했고 임시 복사본·cache는 검증 후 제거했습니다.

변이 없는 최종 소스의 세 모드 전체 `zig build audit --summary all`은 각각 40/40 단계, 2,050/2,050 테스트를 통과했습니다. Debug·ReleaseSafe·ReleaseFast 로그는 `/tmp/hwpjs-path-dash-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 각 로그에서 HWP/WASM 검사 `checks=8,905,827`, `imports=0`을 확인했습니다. 이 수치는 원본 point/flag 투영과 기존 회귀 검증의 근거이며 실제 점선 출력의 근거가 아닙니다.

별도의 `zig build test --summary all`은 5/5 단계·2,011/2,011 native 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 빌드 단계를 통과했습니다.
