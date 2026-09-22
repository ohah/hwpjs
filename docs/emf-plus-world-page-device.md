# EMF+ world·page·device 좌표 적용

## 범위와 단일 출처

`src/image/emf/emf_plus_world_page_device.zig`는 일반 EMF+ graphics 상태의 한 world point를 page point로 변환한 뒤 device scale을 적용합니다. [Microsoft GDI+ 좌표계 문서](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-types-of-coordinate-systems-about)는 world→page와 page→device를 순서가 있는 두 변환으로 정의하고, [MS-EMFPLUS transform records](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/75d8ca0d-42fc-41b0-a3f4-0c4f0c000aaa)는 SetPageTransform이 page 좌표를 device 좌표로 바꾸는 단위·배율을 지정한다고 정의합니다.

world→page 산술은 `TransformMatrix.mapPoint()`, page→device x/y 배율은 [page transform 계층](emf-plus-page-transform.md)이 소유합니다. 이 모듈은 다음 순서로만 두 결과를 연결합니다.

```text
page   = world_matrix.mapPoint(world_point)
device = (page.x * device_scale.x, page.y * device_scale.y)
```

두 변환을 합성 행렬로 미리 접지 않습니다. f32에서는 결합 순서를 바꾸면 반올림뿐 아니라 signed zero·NaN·무한대의 결과도 달라질 수 있으므로 공식 좌표 단계와 같은 순서로 계산합니다. `GraphicsState.mapWorldPagePointToDevice()`는 현재 일반 world/page 상태를 이 함수에 전달할 뿐 산술을 복제하지 않습니다.

## unknown과 미지원 경계

BeginContainer의 World/Display source unit 때문에 world transform이 unknown이면 `null`을 반환합니다. SetPageTransform의 World/Display처럼 기존 page 계약에서 device scale을 확정하지 못한 경우도 `null`입니다. identity나 pixel scale로 추정해 계속하지 않습니다.

이 API는 이름 그대로 일반 world/page 경로만 적용합니다. [SetTSGraphics의 별도 WorldToDevice](emf-plus-ts-graphics-state.md)는 일반 상태와 의미가 같다는 근거가 없어 적용하지 않습니다. device origin, terminal-server graphics, clip geometry, Pen/Brush local transform, image sampling local transform, pixel offset, rasterization과 저장도 이 계층의 범위가 아닙니다. [Polyline device segment](emf-plus-polyline-device-segments.md), [Bézier device segment](emf-plus-bezier-device-segments.md), [cardinal device span](emf-plus-cardinal-device-spans.md), [Path device segment](emf-plus-path-device-segments.md), [rectangle device corners](emf-plus-rect-device-corners.md), [ellipse affine basis](emf-plus-ellipse-device-basis.md), [DrawImagePoints source→device map](emf-plus-image-source-device-map.md)과 [DrawImage rectangle map](emf-plus-image-rect-device-map.md)이 이 mapper를 소비합니다. 실제 image sampling에는 별도 연결이 더 필요합니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 비대칭 shear/translation world matrix, 서로 다른 x/y DPI와 PageScale, world→page→device 순서, unknown world/page, signed-zero·NaN의 순차 IEEE 결과와 `GraphicsState` 공개 연결을 검사합니다.

적대적 검증은 unknown world/page를 identity로 추정, world 단계 제거, x/y scale 교환, x/y page coordinate 교환, 두 축의 page scale 누락, 상태 공개 연결 입력 교환의 10개 의미 변이를 독립 복사본에 적용했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 30/30회가 모두 assertion 실패로 검출됐고 컴파일 오류·panic·timeout은 없습니다.

이름을 `world-to-device`에서 현재 책임을 정확히 나타내는 `world-page-device`로 좁힌 뒤 첫 최종 캠페인에서는 상태 연결 테스트 이름이 옛 이름에 남아 공개 연결 변이가 3모드에서 생존했습니다. 이 세 실행은 유효 검출로 세지 않았습니다. 테스트 이름을 같은 책임명으로 고쳐 필터가 4개가 아니라 5개 테스트를 수집하는지 확인하고, 새 복사본·cache에서 해당 변이를 다시 실행해 세 모드 모두 검출했습니다. 최종 유효 30회는 이름 변경 후 고정 소스에 대한 27회와 교정 재실행 3회입니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1953/1953 테스트(native 1914, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-world-page-device-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
