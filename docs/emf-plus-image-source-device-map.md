# EMF+ DrawImagePoints source→device map

## 범위와 단일 출처

`src/image/emf/emf_plus_image_source_device_map.zig`는 image source 좌표를 destination/world 좌표로 보내는 [image affine map](emf-plus-image-affine-map.md)과 [일반 world·page·device mapper](emf-plus-world-page-device.md)를 순서대로 적용합니다. SrcRect→destination 행렬 계수는 affine 계층, world transform과 page/device scale은 공용 mapper가 각각 소유하며 이 계층은 두 결과를 다음 순서로만 연결합니다.

```text
world  = source_to_world.mapPoint(source)
device = world_page_device.mapPoint(world)
```

두 행렬을 미리 합성하거나 device-space destination으로 affine 행렬을 다시 만들지 않습니다. f32에서 연산 결합 순서를 바꾸면 일반 유한값의 반올림과 signed zero·NaN·무한대 결과가 달라질 수 있으므로 source affine, world transform, page scale의 단계 순서를 보존합니다.

`DrawImagePoints.sourceToDeviceMapper()`는 기존 source rectangle과 [destination parallelogram](emf-plus-image-parallelogram.md)을, [DrawImage rectangle adapter](emf-plus-image-rect-device-map.md)는 rectangle에서 만든 공용 affine transform을 이 builder에 전달합니다. wire parser나 record wrapper가 affine 공식과 좌표 변환을 다시 구현하지 않습니다.

## 지원 경계

이 계층은 source point에서 device point까지의 좌표 map만 구현합니다. source crop과 픽셀 sampling, ImageAttributes와 선행 image effect, clipping, interpolation·pixel-offset·compositing, rasterization과 저장은 미구현입니다. SetTSGraphics의 WorldToDevice도 일반 graphics state와 의미가 같다는 근거 없이 적용하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 non-zero SrcRect와 shear destination의 네 corner, 비대칭 world matrix, 서로 다른 x/y page scale, source→world→page→device 순서와 비트 단위 순차 산술, DrawImagePoints 공개 연결을 검사합니다. 기존 image affine map과 world-page-device 집중 검사도 Debug·ReleaseSafe·ReleaseFast에서 함께 실행했습니다.

적대적 검증은 source affine·world/device 단계 생략, 순서 반전, source/world 단계 중복, source/output 축 교환, source/world identity 대체, device scale 축 교환·누락, width/height 분모 교환, upper-right 역할 손상, record의 source dimension·destination role·world mapping 손상이라는 17개 의미 변이를 독립 복사본에 적용했습니다. 변이·모드별 local/global cache를 분리하고 실행 직후 복사본을 제거한 51/51회가 모두 assertion 실패로 검출됐습니다.

최초 source identity 변이는 함수 인자를 미사용으로 만들어 세 모드에서 컴파일 오류가 났으므로 유효 검출에서 제외했습니다. 인자를 명시적으로 소비하면서 identity를 적용하는 동일 의미 변이를 새 복사본·cache에서 실행해 세 모드 모두 검출했습니다. 최종 유효 실행에는 생존·컴파일 오류·panic·timeout이 없고 제품 작업 트리에는 변이를 적용하지 않았습니다. 로그는 `/tmp/hwpjs-image-source-device-mutants.sFkqY5/logs`입니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1973/1973 테스트(native 1934, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-image-source-device-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
