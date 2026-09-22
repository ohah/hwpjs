# EMF+ DrawImagePoints source affine map

## 범위와 단일 출처

`src/image/emf/emf_plus_image_affine_map.zig`는 source `RectF`를 upper-left·upper-right·lower-left destination basis로 보내는 단일 affine transform을 조립합니다. [parallelogram 계층](emf-plus-image-parallelogram.md)이 DrawImagePoints의 세 역할과 네 번째 점을, [rectangle adapter](emf-plus-image-rect-device-map.md)가 DrawImage destination rectangle의 세 역할을 만들며, `emf_plus_transform_matrix.zig`가 GDI+ row-vector 행렬과 점 적용을 소유합니다. 두 record의 공개 연결은 공용 `buildFromBasis()`에 위임할 뿐 계산을 복제하지 않습니다.

[MS-EMFPLUS EmfPlusDrawImagePoints](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/9bad3867-71b0-46fb-9b90-f7d8fb37ff76)는 source rectangle이 세 destination point가 정하는 parallelogram에 맞게 scale·shear된다고 정의합니다. [GDI+ DrawImage의 RectF/Matrix overload](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusgraphics/nf-gdiplusgraphics-graphics-drawimage%28image_rectf_matrix_effect_imageattributes_unit%29)는 source rectangle에 affine transform을 적용해 destination parallelogram을 만든다고 설명합니다. 행렬 계수의 배치는 [GDI+ Matrix 생성자](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusmatrix/nf-gdiplusmatrix-matrix-matrix%28real_real_real_real_real_real%29)와 [row-vector 표현](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-matrix-representation-of-transformations-about)을 따릅니다.

source `(x, y, width, height)`와 destination `UL`, `UR`, `LL`에 대해 다음 한 식만 사용합니다.

```text
m11 = (UR.x - UL.x) / width
m12 = (UR.y - UL.y) / width
m21 = (LL.x - UL.x) / height
m22 = (LL.y - UL.y) / height
dx  = UL.x - x*m11 - y*m21
dy  = UL.y - x*m12 - y*m22
```

`TransformMatrix.mapPoint()`는 `x' = x*m11 + y*m21 + dx`, `y' = x*m12 + y*m22 + dy`를 소유합니다. 따라서 source의 좌상·우상·좌하·우하가 destination의 네 역할에 각각 대응합니다.

## 수치와 지원 경계

destination의 정수 좌표는 topology 조립 동안 i64로 유지하고 이 map 경계에서 [공용 resolved point 변환](emf-plus-point-resolution.md)을 통해 f32로 바꿉니다. PointF와 SrcRect의 음수 크기·signed zero·NaN·무한대를 임의 거부하거나 보정하지 않으며 Zig f32의 IEEE-754 연산 결과를 그대로 반환합니다. 너비나 높이가 0이면 무한대 또는 NaN 계수가 생길 수 있습니다.

이 계층은 source→destination/world 좌표 transform까지만 구현하고 [source→device map 계층](emf-plus-image-source-device-map.md)이 이 결과에 일반 world/page/device 변환을 순차 적용합니다. source crop, 픽셀 sampling, ImageAttributes와 선행 image effect, clipping, interpolation·pixel-offset·compositing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 non-zero source 원점, scale·양축 shear·translation, 네 source corner, 정수 destination 변환, 음수 source width/height, floating destination, zero와 negative-zero 차원에서의 IEEE 결과를 검사합니다. 별도 행렬 테스트는 비대칭 계수로 row-vector 점 적용의 계수 위치와 translation을 확인하고, DrawImagePoints fixture는 공개 연결이 같은 여섯 계수를 반환하는지 확인합니다.

적대적 검증은 width/height 분모 교환, x/y delta 교환, dx/dy의 source 항 부호·누락, 정수/float x·y 교환, `mapPoint`의 네 계수 교환과 translation 누락, lower-right 오용, 음수 width 절댓값화, 공개 method 연결 제거의 19개 의미 변이를 독립 복사본에 주입했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 57/57회가 모두 assertion 실패로 검출됐고 컴파일 오류·panic·timeout은 없습니다.

첫 실행의 정수 x/y 교환과 width 절댓값화는 Perl의 `@` 보간 때문에 실제 source diff가 없어서 각 3회를 무효로 제외했습니다. escaping 후 diff를 확인한 새 복사본과 cache에서 6회를 다시 실행해 모두 검출했습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1949/1949 테스트(native 1910, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-image-affine-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
