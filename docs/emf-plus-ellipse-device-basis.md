# EMF+ Ellipse affine device basis

## 범위와 단일 출처

`src/image/emf/emf_plus_ellipse_device_basis.zig`는 [공용 device corners](emf-plus-rect-device-corners.md)의 upper-left·upper-right·lower-left 세 역할로 affine ellipse의 중심과 두 반축 벡터를 조립합니다.

```text
horizontal_radius = (upper_right - upper_left) * 0.5
vertical_radius   = (lower_left  - upper_left) * 0.5
center            = upper_left + horizontal_radius + vertical_radius
```

[Graphics::DrawEllipse](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusgraphics/nf-gdiplusgraphics-graphics-drawellipse%28constpen_int_int_int_int%29)는 입력 rectangle을 ellipse의 bounding rectangle으로 정의합니다. Microsoft의 [global transformation 설명](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-global-and-local-transformations-about)은 world transform 후 ellipse가 비균등 확대·회전될 수 있음을 실제 DrawEllipse 예제로 보여줍니다. 따라서 이 계층은 transformed corners를 axis-aligned bounds로 다시 축약하거나 Bézier 근사를 만들지 않고 정확한 affine basis를 보존합니다.

`DrawEllipse.deviceEllipse()`와 `FillEllipse.deviceEllipse()`는 각 record의 기존 `deviceCorners()` 결과를 이 builder에 위임합니다. rectangle 산술과 world→page→device 변환은 하위 계층의 단일 출처로 남습니다.

## 수치와 미지원 경계

각 f32 빼기·곱하기·더하기 순서를 코드와 위 식대로 유지합니다. 음수 width/height에서 반축 방향을 절댓값화하지 않고 signed zero·NaN·무한대도 정규화하지 않습니다. `horizontal_radius`와 `vertical_radius`는 axis-aligned 길이가 아니라 device-space 벡터이므로 회전·shear 성분을 함께 가질 수 있습니다.

이 계층은 ellipse의 affine geometry basis까지만 구현합니다. 매개변수 각도 평가, flattening, DrawEllipse의 Pen stroke, FillEllipse의 Brush fill, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 회전·shear된 네 corner에서 중심과 두 2D 반축, 반전된 두 축, signed zero·무한대·NaN의 순차 산술을 검사합니다. DrawEllipse와 FillEllipse의 실제 compressed parse fixture는 공개 메서드가 기존 device corner 결과를 그대로 소비하는지 확인합니다.

적대적 검증은 두 반축의 x/y source 교환, 각 성분의 1/2 배율 제거, 중심의 네 반축 성분 누락, 음수 horizontal/vertical 축 절댓값화, DrawEllipse·FillEllipse 공개 연결 제거라는 16개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 48/48회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic·timeout은 없습니다. 로그와 source diff는 `/tmp/hwpjs-ellipse-device-basis-mutants.j2QIZJ`에 있습니다.

제품 트리를 고정한 뒤 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,982/1,982 테스트(native 1,943, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-ellipse-device-basis-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
