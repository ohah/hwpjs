# EMF+ Path 객체

## 책임과 구조

`src/image/emf/emf_plus_path.zig`는 [EmfPlusPath](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/b539cf16-6232-4705-9f6e-6f914705145f)의 Version, PathPointCount, PathPointFlags, points, point types와 0~3바이트 AlignmentPadding의 정확한 경계를 소유합니다. 입력 전체 길이는 4바이트 정렬이어야 하고 의미 필드 뒤에는 최대 3바이트의 무시되는 padding만 허용합니다. 기본 최대 point 수는 16 Mi이며 호출자가 명시적으로 조정할 수 있습니다. 완성된 Object assembler 결과는 `parseCompleted`가 ObjectTypePath인지 확인한 뒤 같은 parser로 전달합니다.

`emf_plus_integer.zig`는 [Integer7](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c2b45b77-c9ce-4b2e-8ede-ff5e90ec7f1b)과 [Integer15](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c5478039-f448-422e-ba0b-ff5eddcada8e)의 부호 확장과 1/2바이트 소비를 소유합니다. Integer15의 두 바이트는 첫 바이트의 marker·상위 7비트와 다음 하위 8비트 순서이며, -16,384~16,383 전체를 검사합니다. -64~63도 Integer15로 표현할 수 있으므로 최단 표현을 강제하지 않습니다.

`emf_plus_geometry.zig`의 [Point](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/a0558721-f6df-4325-b455-a0e6edf63cf4)는 두 i16 절대 좌표를, 공용 `emf_plus_point.zig`의 [PointR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c861a0d4-39f0-4f6c-bad9-e3f7bf63205e)은 X와 Y가 서로 다른 Integer7/15 폭을 가질 수 있는 상대 좌표를 읽습니다. PointF는 [공통 객체 값](emf-plus-common-objects.md)을 재사용합니다. Path는 세 wire 표현을 입력에서 빌리고 iterator로 노출하며 임의로 한 좌표형으로 정규화하지 않습니다.

`emf_plus_path_type.zig`는 [PathPointType](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/08fec462-f1c5-40ee-ac3b-fa316654ebc2)의 Start 0, Line 1, Bezier 3과 [DashMode·PathMarker·CloseSubpath flags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d02829c9-a8e2-433d-bd71-004169c856ec)를 검사합니다. 정의되지 않은 kind와 flag bit는 거부합니다. [PathPointTypeRLE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/1acc6ffc-ff99-40fe-925e-b90869b7d02c)는 고정 1 bit, B, 6비트 RunCount와 중첩 PointType을 보존하며, 확장된 run 합이 PathPointCount를 넘지 않고 정확히 도달해야 합니다. 명세가 0 run을 금지하지 않아 이를 새로 거부하지 않으며, 유한 입력을 소비하다 정상 run에 도달하거나 잘림 오류를 반환합니다.

## PathPointFlags 해석 모드

기본 `specification` 모드는 공식 표의 R `0x0800`을 상대 PointR와 RLE point types에 함께 적용하고, C `0x4000`은 R이 없을 때 i16 Point를 선택합니다. R이 있으면 명세대로 C를 무시합니다. 나머지 0 bit는 거부합니다.

실제 구현 생태계에는 상대 좌표 `0x0800`과 RLE type `0x1000`을 독립적으로 해석한다는 [emf-rs 호환성 기록](https://github.com/mythrnr/emf-rs/blob/master/AGENTS.md)이 있고, LibreOffice도 [0x0800을 PointR로 처리](https://github.com/LibreOffice/core/blob/master/drawinglayer/source/tools/emfppath.cxx)합니다. `independent_rle` 모드는 `0x1000`을 별도 RLE bit로 승인해 상대+일반 type 또는 절대+RLE 조합을 명시적으로 읽습니다. 기본 모드에서 자동 추측하지 않으므로 동일 바이트의 의미가 입력 모양에 따라 바뀌지 않습니다. 현재 로컬 HWP corpus에는 EMF+ Path 표본이 없으므로 이 모드를 한컴 버전별 실측 완료로 주장하지 않습니다.

## 검증과 미지원 경계

공식 3.2.32.21의 19개 PointF, 19개 point type, 0xBF padding으로 된 184바이트 ObjectTypePath 예제를 byte-for-byte 파싱합니다. 별도 합성 fixture는 PointF, i16 Point, X/Y 혼합 폭 PointR, 공식 RLE, 독립 RLE, padding 0~3, 빈 Path, 모든 잘림, 미지 flags/type, RLE 고정 bit·run 초과·0 run, point 한도와 잘못된 ObjectType을 검사합니다. Integer7 전 범위 128개와 Integer15 전 범위 32,768개도 전수 검사합니다.

이 계층은 wire 구조와 의미상 enum·count 경계만 검증합니다. Start/Line/Bezier 배열, figure 상태와 cubic Bézier topology는 별도 [Path geometry 계층](emf-plus-path-geometry.md)이, 명시적 닫힘 직선은 [Path closing segment 계층](emf-plus-path-segments.md)이 조립하며 wire parser가 보정하지 않습니다. [Path device command 계층](emf-plus-path-device-commands.md)은 Move와 빈 figure를 포함한 command metadata를, [Path device figure geometry](emf-plus-path-device-geometry.md)는 figure별 point·command 범위와 닫힘을 소유하고, [Path device figure polyline](emf-plus-path-device-polyline.md)은 원본 command snapshot과 평탄화 point range를 함께 소유합니다. [Path device segment 계층](emf-plus-path-device-segments.md)은 stroke/fill segment의 Line·Bézier·closure 역할과 metadata를 보존해 같은 world/page/device 변환을 적용합니다. [공용 cubic evaluator](emf-plus-cubic-evaluation.md)가 단일 parameter 점을 계산합니다. clip boolean geometry·래스터화는 아직 구현하지 않았습니다. PathGradient boundary와 Region/CustomLineCap의 중첩 Path 연결은 각 상위 객체 파트가 소유합니다. 실제 HWP EMF+ 표본 비교와 렌더링 동등성도 아직 남아 있습니다.

[Path device marker point 반복자](emf-plus-path-device-marker-points.md)는 `Path.deviceMarkerPoints()`에서 원본 Move·Line·Bézier control/end의 PathMarker 위치를 제공합니다. marker의 GDI+ 조작 의미는 아직 적용하지 않습니다.

## 적대적 검증 기록

14개 결함(정수 byte order·부호 확장, point 원자성, 상대/RLE flag 해석, RLE marker·run 초과·0 run, point kind·flag, 전체 정렬·padding, point 한도, ObjectType)을 각각 독립 복사본에 주입했습니다. 캐시를 분리한 Debug·ReleaseSafe·ReleaseFast에서 총 42/42를 모두 검출했습니다. 자동 치환이 실제 diff를 만들지 못한 정수 byte order와 point flag 두 항목은 diff를 확인한 수동 변이로 다시 실행했으며, 무효 실행은 42회에 포함하지 않았습니다. 변이 로그는 `/tmp/hwpjs-emfplus-path-mutants.UDq3zL`에 남겼습니다.

전체 `audit`도 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 step과 1,555/1,555 test를 통과했습니다. 모드별 구성은 native 1,516, chart ownership 31, WMF contents 8이며, 각 HWP/WASM 감사 결과는 8,905,827 checks와 imports 0입니다. 최종 로그는 `/tmp/hwpjs-emfplus-path-{Debug,ReleaseSafe,ReleaseFast}-final-audit.log`에 남겼습니다.
