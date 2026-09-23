# EMF+ Path device marker points

## 책임과 명세

[MS-EMFPLUS PathPointType flags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d02829c9-a8e2-433d-bd71-004169c856ec)는 `PathMarker` 비트를 Path point의 위치 marker로 정의합니다. [EmfPlusPath](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/b539cf16-6232-4705-9f6e-6f914705145f)의 모든 원본 point에 point type이 대응합니다. 따라서 marker 검출은 평탄화된 boundary point 배열이 아니라 원본 [device command](emf-plus-path-device-commands.md)의 Move, Line endpoint, Bézier control1·control2·endpoint를 소비합니다. 평탄화로 생성한 point와 추가된 closing point에는 원본 marker를 발명하지 않습니다.

`src/image/emf/emf_plus_path_device_marker_points.zig`는 marker가 설정된 point만 allocation-free로 반환합니다. 각 결과는 device 좌표와 원본 `PathPointType`/RLE B, figure index, 원본 전체 point index, figure 내부 point index 및 다섯 역할 중 하나를 보존합니다. point 소비량은 device command의 `sourcePointCount()`가 단일 출처입니다. `Path.deviceMarkerPoints(mapping)`은 같은 `Path.deviceCommands(mapping)`에서 반복자를 구성합니다. 입력 Path 바이트는 반복자가 살아 있는 동안 유효해야 합니다.

## 진행과 경계

반복자는 command와 pending Bézier point를 값으로 복사해 검사합니다. 중간에 marker가 없는 point도 원본 index에 포함합니다. 새 Move에서 figure 내부 index를 0으로 재시작하며 Move만 있는 figure도 marker가 있으면 반환합니다. 원본 command 오류가 나면 이전에 반환한 marker 이후의 반복자 상태를 보존하여 같은 오류를 재현할 수 있습니다. 정상 EOF는 반복 호출해도 유지됩니다.

이 API는 marker가 붙은 원본 point의 읽기 전용 위치 목록입니다. marker에 따른 GDI+ subpath 조작, DashMode의 선분 처리, Pen stroke, clipping, hit testing, rasterization, record replay는 아직 구현하지 않았습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없으므로 실제 한컴 출력 동등성은 주장하지 않습니다.

## 검증 기록

합성 device command 테스트는 비대칭 world/page/device 변환 후 Move, Line endpoint, Bézier의 두 control point와 endpoint, 닫힌 Move-only figure, 다른 figure의 endpoint marker를 원본 index·역할·좌표·raw type과 대조합니다. marker가 없는 point도 index에 반영하고 반복 EOF를 확인합니다. 잘못된 Bézier sequence는 이미 한 marker를 반환한 뒤에도 같은 오류와 상태 보존을 검사합니다. 공개 `Path.deviceMarkerPoints()` 테스트는 실제 integer Path 바이트의 Bézier control marker와 상대 PointR·RLE type의 B 비트까지 도달하는지 확인합니다.

적대적 검증은 marker 선택, figure/point index 진행, Bézier pending 종료와 다섯 역할·세 Bézier point 선택의 17개 의미 변이를 독립 `src/` 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 51/51회가 모두 assertion으로 검출됐고 생존·컴파일 오류·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-path-marker-mutants.rZomNx`입니다. 앞선 캠페인에서 marker 소실 시 공개 API 테스트가 optional unwrap panic을 냈으므로 그 실행은 제외하고 marker 존재 assertion을 추가한 뒤 전체 캠페인을 다시 실행했습니다.

최종 소스의 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,045/2,045 테스트(native 2,006개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그의 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 확인했습니다. 로그는 `/tmp/hwpjs-path-device-marker-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 검증은 marker 위치·metadata 투영의 근거이며 marker 적용이나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
