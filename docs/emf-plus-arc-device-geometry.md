# EMF+ Arc and Pie affine device geometry

## 범위와 단일 출처

`src/image/emf/emf_plus_arc_angles.zig`는 arc/pie의 wire 각도를 geometry 의미로 해석합니다. [MS-EMFPLUS EmfPlusDrawPie](https://learn.microsoft.com/en-gb/openspecs/windows_protocols/ms-emfplus/bd93aa68-e96f-42f1-8aea-390920f327fd)는 StartAngle을 non-negative degree 값으로 정의하고 modulo 360 결과를 `[0,360)`에서 사용하도록 하며, SweepAngle은 `[-360,360]`으로 clamp하고 양수를 clockwise, 음수를 counter-clockwise로 정의합니다.

wire parser는 호환 관측과 원문 보존을 위해 모든 f32 bit를 계속 보존합니다. geometry resolver만 다음 정책을 적용합니다.

```text
finite start < 0  -> uninterpretable (null)
non-finite angle  -> uninterpretable (null)
start             -> start mod 360
sweep             -> clamp(sweep, -360, 360)
```

음수 StartAngle을 임의로 양수로 보정하지 않습니다. `-0.0`은 음수 비교에 해당하지 않으며 modulo와 clamp의 signed-zero 결과를 보존합니다.

`src/image/emf/emf_plus_arc_device_geometry.zig`는 해석된 각도와 [affine ellipse basis](emf-plus-ellipse-device-basis.md)를 하나의 `Arc`로 조립합니다. DrawArc·DrawPie·FillPie의 `deviceArc()`는 기존 `deviceCorners()`와 wire 각도를 이 builder에 전달할 뿐 각도나 ellipse 산술을 복제하지 않습니다. [GDI+ AddArc](https://learn.microsoft.com/en-us/windows/win32/api/gdipluspath/nf-gdipluspath-graphicspath-addarc%28constrectf__real_real%29)도 시작각을 ellipse horizontal axis 기준 clockwise angle로 정의합니다.

## 지원 경계

이 계층은 affine ellipse basis와 정규화된 start/sweep까지 제공합니다. 삼각함수 기반 start/end point와 Pie radial edge는 [별도 평가 계층](emf-plus-arc-device-points.md)이 소유합니다. arc flattening, DrawArc stroke, DrawPie/FillPie의 닫힌 fill boundary, Pen/Brush, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 양수 sweep의 clockwise 의미는 부호로 보존하지만 이 단계에서 point 순회를 생성하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 450° modulo, 정확한 360° wrap, modulo 180과 구별되는 270°, 양·음 sweep clamp, signed zero, 음수 StartAngle, 네 종류의 비유한 위치, 회전·shear ellipse basis 결합을 검사합니다. DrawArc·DrawPie·FillPie의 실제 compressed parse fixture는 공개 연결을 공용 builder 결과와 대조합니다.

적대적 검증은 start/sweep 유한성, 음수 StartAngle 거부, modulo 제거·잘못된 180 divisor, clamp 제거·잘못된 180 bound, angle 필드 교환, 두 signed zero 손실, sweep 절댓값화, ellipse basis 제거, Arc 필드 교환, resolver 우회, 세 record 공개 연결 제거라는 17개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 최종 유효 51/51회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic·timeout은 없습니다.

첫 캠페인의 modulo 180 변이 3회는 450°와 360° fixture만으로 구별되지 않아 생존했으므로 제외했습니다. 270° 반례를 추가한 새 복사본에서 3/3회를 검출했습니다. 세 record 연결 제거의 최초 9회는 pointless discard 컴파일 오류였으므로 제외하고, 원래 계산을 실제로 소비한 뒤 결과만 null로 만드는 변이로 교체해 9/9회를 검출했습니다. 원 캠페인은 `/tmp/hwpjs-arc-device-geometry-mutants.RZ0qNJ`, 교정 캠페인은 `/tmp/hwpjs-arc-device-geometry-corrected.n33Vrz`에 있습니다.

제품 트리를 고정한 뒤 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,986/1,986 테스트(native 1,947, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-arc-device-geometry-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
