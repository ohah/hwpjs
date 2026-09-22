# EMF+ DrawImage rectangle source→device map

## 범위와 단일 출처

`src/image/emf/emf_plus_image_rect_device_map.zig`는 DrawImage의 source `RectF`와 destination `RectData`를 source→destination affine transform 및 source→device mapper로 연결합니다. `RectData`의 정수/float 통합은 `emf_plus_rect_data.zig`의 `toRectF()`가, affine 계수는 [image affine map](emf-plus-image-affine-map.md)의 `buildFromBasis()`가, world→page→device 순서는 [공용 source→device map](emf-plus-image-source-device-map.md)이 각각 소유합니다.

destination rectangle `(x, y, width, height)`는 upper-left `(x,y)`, upper-right `(x+width,y)`, lower-left `(x,y+height)` 역할로만 바꿉니다. 이 계층은 affine 식이나 point 적용을 복제하지 않습니다. `DrawImage.sourceToDestinationTransform()`과 `sourceToDeviceMapper()`는 이 adapter에 위임합니다.

## 수치와 미지원 경계

compressed destination의 i16 값은 f32로 정확히 변환하고 floating destination은 원값을 그대로 전달합니다. 음수 source/destination 크기와 signed zero·NaN·무한대를 보정하지 않습니다. source 너비나 높이가 0이면 공용 affine 계산에서 무한대 또는 NaN 계수가 생길 수 있습니다.

구현 범위는 좌표 map까지입니다. source crop과 픽셀 sampling, Image/ImageAttributes 및 효과 적용, clipping, interpolation·pixel-offset·compositing, rasterization, stream replay와 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 compressed destination, non-zero source, 비대칭 world matrix와 x/y page scale의 네 corner, floating destination, 음수 source 크기, zero와 negative-zero source 차원을 검사합니다. DrawImage 공개 메서드도 별도 record fixture에서 같은 affine 및 device 좌표를 반환하는지 확인합니다.

적대적 검증은 RectData 축·크기 변환, destination 세 역할, affine width/height와 음수 보존, source affine 및 world/device 단계·순서·축, 모듈 identity 대체와 DrawImage 공개 연결을 각각 손상시키는 18개 의미 변이를 Debug·ReleaseSafe·ReleaseFast에서 변이별 새 local/global cache로 실행했습니다. 최종 유효 54/54회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic·timeout은 없습니다.

첫 실행에서는 compressed RectData 축·크기 교환과 음수 source width 절댓값화의 9회가 생존해 결과를 승인하지 않았습니다. `RectData` 테스트 이름이 `rectangle` 필터에서 빠지는 위치 편향을 고치고 네 필드와 음수 affine 계수를 직접 검증하도록 보강했습니다. 세 변이를 의도한 제품 식에 고정하고 source diff를 확인한 새 복사본·cache에서 9/9회를 다시 검출했습니다. 최초 9회는 최종 수치에서 제외했으며 원래 캠페인 로그는 `/tmp/hwpjs-image-rect-device-mutants.WgiGnO`, 교정 로그와 diff는 `/tmp/hwpjs-image-rect-corrected-mutants.f8ysql`에 있습니다.

제품 트리를 고정한 뒤 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,976/1,976 테스트(native 1,937, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-image-rect-device-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
