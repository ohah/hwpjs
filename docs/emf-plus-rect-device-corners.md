# EMF+ RectData world·device corner geometry

## 범위와 단일 출처

`src/image/emf/emf_plus_rect_corners.zig`는 공용 `RectData`를 upper-left·upper-right·lower-left·lower-right 네 역할로 조립합니다. compressed 정수의 f32 변환은 `emf_plus_rect_data.zig`의 `toRectF()`만 소유하고, 이 계층은 `right = x + width`, `bottom = y + height`를 한 번씩 계산해 네 역할에서 공유합니다. 음수 width/height도 방향을 바꾸지 않고 원래 역할대로 보존합니다.

Microsoft의 [EmfPlusRect 정의](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/2addbcb6-0baf-4794-a733-048cb7a3e1e4)는 X/Y를 upper-left 좌표, Width/Height를 signed 크기로 정의합니다. [GDI+ 좌표계](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-types-of-coordinate-systems-about)는 drawing 좌표가 world→page→device 순서로 변환된다고 설명합니다.

`src/image/emf/emf_plus_rect_device_corners.zig`는 네 world point를 기존 [world·page·device mapper](emf-plus-world-page-device.md)에 각각 전달합니다. 회전·shear 결과를 axis-aligned bounding rectangle로 축약하지 않습니다. RectArray adapter는 allocation 없이 wire 순서를 유지합니다. 읽기 실패 원자성은 공용 `geometry.readRect/RectF`와 `RectArray.Iterator`가 소유하므로 device iterator가 cursor transaction을 복제하지 않습니다.

[DrawImage rectangle adapter](emf-plus-image-rect-device-map.md)도 같은 world corner 역할에서 upper-left·upper-right·lower-left를 affine basis로 사용합니다. rectangle 산술을 별도로 복제하지 않습니다.

## 수치와 미지원 경계

f32 덧셈과 world/page/device 적용 순서를 보존합니다. signed zero·NaN·무한대, 음수 크기를 거부하거나 절댓값화하지 않습니다. 이름은 좌표의 최종 대소 관계가 아니라 원래 rectangle 역할을 뜻합니다.

이 계층은 rectangle의 device-space 네 corner까지만 제공합니다. [rectangle record 연결](emf-plus-rect-record-device-corners.md)은 이 API를 재사용하고 Ellipse·Arc·Pie의 basis·exact conic·단일 parameter 평가와 [선형 근사](emf-plus-arc-device-polyline.md)는 각 전용 계층이 이어서 소유합니다. Pen/Brush 의미, clipping, rasterization과 저장은 후속 범위입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 compressed 음수 width, floating signed zero·무한대·NaN 산술, 비대칭 shear/translation world matrix, 서로 다른 x/y page scale, 네 device 역할, 두 RectArray 원소의 순서·종료, compressed 및 floating 잘림의 cursor 원복을 검사합니다. 기존 DrawImage rectangle fixture도 공용 corner refactor 뒤 같은 source→device 결과를 확인합니다.

적대적 검증은 right/bottom 축, 네 역할의 원점·끝점, 음수 width/height 절댓값화, device 역할·변환 생략, RectArray 변환 생략·순서, 정수/float reader 원자성, DrawImage basis 연결을 손상시키는 18개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 최종 유효 54/54회가 모두 assertion 실패로 검출됐고 컴파일 오류·panic·timeout은 없습니다.

첫 캠페인의 iterator 변환 생략 3회는 identity fixture 때문에 생존해 최종 수치에서 제외했습니다. 비대칭 mapping으로 보강한 새 복사본에서 3/3회를 검출했습니다. 바깥 device iterator의 pending-copy 제거 3회는 하위 Rect reader와 RectArray iterator가 이미 실패 원자성을 소유해 동등 변이였으므로 제외하고 제품에서도 중복 transaction을 제거했습니다. 실제 하위 정수/float reader의 transaction을 각각 제거한 6회를 새 복사본에서 실행해 모두 검출했습니다. 원 캠페인은 `/tmp/hwpjs-rect-device-corners-mutants.xPSi0o`, 교정 캠페인은 `/tmp/hwpjs-rect-device-corners-corrected.dgDbIP`에 있습니다.

제품 트리를 고정한 뒤 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,980/1,980 테스트(native 1,941, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-rect-device-corners-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
