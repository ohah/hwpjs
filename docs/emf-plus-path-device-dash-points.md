# EMF+ Path device DashMode 플래그 point

## 명세와 책임

[MS-EMFPLUS PathPointType flags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d02829c9-a8e2-433d-bd71-004169c856ec)는 `DashMode`를 point를 지나는 선분의 점선 속성으로 정의합니다. `src/image/emf/emf_plus_path_device_dash_points.zig`는 [공유 원본 point 반복자](emf-plus-path-device-source-points.md)에서 이 비트가 설정된 원본 point만 읽기 전용으로 투영합니다. `Path.deviceDashPoints(mapping)`은 `Path.deviceCommands(mapping)`를 통해 연결됩니다. 입력 Path 바이트는 반복자가 살아 있는 동안 유효해야 합니다.

결과는 device 좌표, 원본 point type·RLE B, figure 및 원본 point index, Move·Line endpoint·Bézier control1/2/endpoint 역할을 보존합니다. Move나 Bézier control에 플래그가 있어도 버리지 않습니다. 오류가 나면 마지막 반환 결과 이후의 반복자 상태가 유지되어 같은 오류를 재현할 수 있습니다.

이 API는 `DashMode`가 나타나는 원본 point의 목록이지, 어떤 평탄화 edge에 점선을 적용할지 결정한 결과가 아닙니다. 공식 문구만으로 control point, closure, Pen의 dash pattern·offset·cap과 결합한 재생 규칙을 단정하지 않습니다. Pen stroke 및 픽셀 출력은 아직 미구현입니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없어 실제 한컴 렌더링 동등성도 주장하지 않습니다.

## 검증

합성 device command 테스트는 비대칭 변환의 Move, Bézier control1·endpoint, 닫힌 빈 figure Move, 다른 figure의 Line endpoint에서 flag 선택·역할·index·좌표·raw type을 대조합니다. 플래그가 없는 point도 index에 반영합니다. 잘못된 Bézier와 플래그 없는 정상 EOF의 상태를 검사합니다. 공개 Path API 테스트는 실제 i16 Path 바이트의 control/end 플래그와 상대 PointR·RLE type의 플래그·B 값을 검사합니다.

공유 역할·index 및 DashMode 필터의 독립 변이 21/21회와 세 모드 전체 audit 결과는 [원본 point 순회 검증 기록](emf-plus-path-device-source-points.md)에 둡니다.
