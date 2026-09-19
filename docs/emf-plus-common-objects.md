# EMF+ 공통 객체 값

## 책임과 명세 대응

`src/image/emf/emf_plus_graphics_version.zig`는 [EmfPlusGraphicsVersion](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/a60a681e-49ae-4103-a8ce-ef9f65a73fc1)의 20비트 signature를 검사하고 12비트 version을 원값과 함께 보존합니다. version은 vendor-extensible이므로 알려진 1과 2 이외의 값을 거부하지 않습니다. Header도 이 파서를 사용하며 signature 규칙을 복제하지 않습니다.

`emf_plus_argb.zig`는 [EmfPlusARGB](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/10284df9-0c5e-48d0-9196-c91c09de069f)의 Blue, Green, Red, Alpha wire 순서와 원문 u32 왕복을 소유합니다. gradient 색과 후속 Brush가 채널 배치를 다시 구현하지 않습니다.

`emf_plus_geometry.zig`와 `emf_plus_transform_matrix.zig`는 [PointF](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/65ddf0d3-ae37-4da6-9a89-251ded97f1ad), [RectF](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/f02202c0-9ef1-4e0d-b81d-0dbb92757b7c), [TransformMatrix](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d65ccfa9-3674-42c8-93aa-df51fec6a37a)의 IEEE 754 값을 wire 순서대로 읽습니다. 명세에 유한성이나 양수 제약이 없으므로 음수 0, 무한대, NaN의 bit pattern도 임의 정규화하지 않습니다. 복합 읽기가 잘리면 호출자의 공용 reader 위치를 바꾸지 않습니다.

`emf_plus_brush_values.zig`는 [BrushType](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/6a62c568-0916-4032-ab49-7c9e377a3d70), HatchStyle과 BrushData flags를 소유합니다. Brush와 ImageAttributes가 함께 쓰는 [WrapMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/79d01e4a-6a59-4464-bd8c-2d3fe26df5bc)는 `emf_plus_wrap_mode.zig`가 정의된 0~4만 승인하는 단일 출처입니다. BrushData flags는 알려진 비트를 해석하면서 bit 5와 상위 예약 비트까지 원문 u32로 왕복 보존합니다. 어떤 flag 조합이 어떤 BrushType에서 의미 있는지는 개별 Brush 파서가 소유합니다.

`emf_plus_gradient_data.zig`는 [BlendColors](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/bab3d8e7-cc3c-44a4-a6be-2b4b88ab389c), [BlendFactors](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c8a8d3db-09ed-4b79-b7b4-f2c502df1869), [FocusScaleData](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d90f9243-3d44-48e5-9baa-1db4ae5394b4)의 prefix를 읽고 소비 위치를 반환합니다. 배열은 입력을 빌리며 할당하지 않고 bounds-safe accessor가 position, factor, ARGB를 반환합니다. 모든 position/factor는 0 이상 1 이하이고 FocusScale은 두 값 모두 0과 1 사이의 배타 범위여야 합니다. 비교식 자체로 NaN도 거부합니다.

BlendFactors는 명세의 MUST에 따라 count 2 이상, 첫 position 0, 마지막 position 1을 검사합니다. 중간 position이 앞 값보다 크다는 문장은 `generally`이므로 강제하지 않습니다. BlendColors에는 명시된 최소 count나 endpoint 조건이 없어 이를 새로 만들지 않습니다. 두 배열 모두 `count * 4`와 실제 입력 경계를 검사하며 실패 시 reader 위치를 원복합니다.

## 범위

이 계층은 Brush/Pen/Path/Image가 공유하는 값과 gradient 보조 객체만 소유합니다. BoundaryPath/BoundaryPoint의 중첩 Path 검증, 다섯 BrushData 조합, Image 및 실제 렌더링은 완료 범위가 아닙니다. 현재 HWP corpus에는 EMF+ 실파일 표본이 없어 합성 wire 검증을 한컴 버전별 렌더링 동등성으로 확대하지 않습니다.

## 검증 기록

정상 값, 모든 고정 구조 잘림 위치, enum 양 끝과 범위 밖, 예약 flag 보존, vendor graphics version, 배열 잘림·산술 한계, 0/1 경계, 범위 밖·무한대·NaN, BlendFactors endpoint 및 비증가 중간 position을 검사합니다.

적대적 검증은 signature 검사 제거, ARGB 채널 순서 교환, factor 범위 검사 제거, endpoint 검사 제거, FocusScale 경계를 포함 범위로 완화, 의미 오류 전에 reader 위치 갱신, enum 상한 축소, 예약 bit와 FocusScale bit 교환, accessor 상한의 off-by-one의 9개 독립 변이를 주입했습니다. 각 복사본은 실행마다 새 local/global cache를 사용했고 Debug·ReleaseSafe·ReleaseFast에서 27/27회 모두 실패했습니다. 무효인 무변경 치환은 결과에서 제외하고 복사본 diff가 실제 제품 소스와 다른 경우만 셌습니다. 최종 로그는 `/tmp/hwpjs-emfplus-common-final2-mutants.ulcTYd/`에 남겼습니다.

최종 제품 트리의 순차 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 단계, 1,538/1,538 테스트를 통과했습니다. 각 모드는 네이티브 1,499개, 차트 소유권 31개, WMF 8개, HWP/WASM 8,905,827회 검사와 WASM imports 0개를 포함합니다. 로그는 `/tmp/hwpjs-emfplus-common-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 이 수치는 위에 명시한 중첩 객체와 실제 EMF+ corpus 공백을 완료로 바꾸지 않습니다.
