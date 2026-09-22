# EMF+ Ellipse exact rational quadratic segments

## 범위와 단일 출처

`src/image/emf/emf_plus_ellipse_device_segments.zig`는 [affine ellipse basis](emf-plus-ellipse-device-basis.md)를 완전한 device-space ellipse의 allocation-free segment iterator로 변환합니다. 별도 삼각함수·control·weight 공식을 만들지 않고 [Arc exact conic segment 계층](emf-plus-arc-device-segments.md)에 다음 하나의 정규 Arc를 전달합니다.

```text
ellipse = 입력 affine basis
start   = 0 degrees
sweep   = 360 degrees
```

따라서 결과는 0→90→180→270→360도의 rational quadratic 네 개이며 각 control weight는 `cos(45 degrees)`입니다. 공용 Arc iterator가 이전 end를 다음 start로 직접 재사용하므로 인접 segment와 마지막 end·첫 start는 bit-level로 연결됩니다. 회전·shear·축 반전·0 radius는 basis 원값에서 그대로 파생하며 axis-aligned bounds나 cubic/polyline으로 바꾸지 않습니다.

DrawEllipse와 FillEllipse의 `deviceSegments()`는 기존 `deviceEllipse()` 결과만 이 모듈에 전달합니다. rectangle mapping, basis 조립과 conic 산술을 record별로 복제하지 않습니다.

## 지원 경계

이 계층은 완전한 ellipse의 exact-conic geometry 표현까지 제공합니다. 각 segment의 단일 parameter 점은 [공용 conic 평가 계층](emf-plus-arc-segment-evaluation.md)이 계산합니다. flattening, DrawEllipse Pen stroke, FillEllipse fill rule·Brush sampling, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

회전·shear affine basis에서 네 segment의 start/sweep, 공통 weight, 모든 접점과 폐합을 검사합니다. 반전된 horizontal radius와 0 vertical radius fixture는 퇴화 ellipse도 생략하거나 축을 정규화하지 않는지 확인합니다. DrawEllipse와 FillEllipse의 compressed record fixture는 공개 iterator 네 항목과 공용 builder를 항목별로 대조하고 종료도 함께 검사합니다.

적대적 검증은 시작각 변경, 완전 회전을 359도로 축소, 두 affine radius 교환, 첫 segment 선소비, DrawEllipse·FillEllipse 공개 helper의 radius 교환이라는 6개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 최종 18/18회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic은 없습니다. 조기 종료를 `.?` panic으로 검출하던 초기 테스트는 명시적 `TestExpectedEllipseSegment` 오류로 교정한 뒤 전체 캠페인을 새 복사본에서 다시 실행했습니다. 최종 캠페인은 `/tmp/hwpjs-ellipse-segment-mutants.mM5ysM`에 있습니다.

최종 전체 감사는 Debug·ReleaseSafe·ReleaseFast 각각 `40/40` 단계와 `2,001/2,001` 테스트(native 1,962, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드에서 HWP5 감사 `8,905,827` checks·imports 0과 CFB 변이 `12,000`건·traps 0을 다시 확인했습니다. 로그는 `/tmp/hwpjs-ellipse-device-segments-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 있습니다.
