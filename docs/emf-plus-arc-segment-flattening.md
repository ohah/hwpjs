# EMF+ Arc rational quadratic 평탄화

## 책임과 계산

[Arc exact segment](emf-plus-arc-device-segments.md)의 `start/control/end`와 양의 control weight를 `src/image/emf/emf_plus_arc_segment_flattening.zig`에서 device-space 선형 point 배열로 평탄화합니다. [MS-EMFPLUS DrawArc](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/f01d82be-b19b-418b-9620-7ae1f2e1efd2)는 Arc가 타원 일부임을 정의합니다. 명세는 raster tolerance를 지정하지 않으므로 이 모듈의 양의 tolerance는 호출자가 정하는 device-space 근사 한도이지 wire 필드가 아닙니다.

세 control을 `(x*w, y*w, w)`의 동차 좌표로 올리고 1/2 de Casteljau 분할을 반복합니다. 자식의 세 weight는 부모 weight의 양의 볼록 조합이므로 모두 양수입니다. 각 조각의 투영된 control에서 endpoint 선분까지의 거리 제곱을 f64로 계산합니다. rational curve가 양의 weight인 control들의 볼록 껍질 안에 있으므로 이 값은 이상적 곡선에서 해당 선분까지의 보수적 상한입니다. 선분 밖으로 되돌아가는 collinear control도 무시하지 않습니다. 허용되면 end를 반환하고 아니면 오른쪽·왼쪽 순서로 스택에 넣어 원래 방향대로 출력합니다. 입력의 start/end f32 원비트는 직접 보존하고 내부 점만 f64 분할 결과를 f32로 반올림합니다. 따라서 극단적인 좌표·극소 tolerance에서 최종 f32 polyline의 엄밀한 절대 오차 보증까지 주장하지 않습니다.

Options는 finite 양의 tolerance, 최대 깊이 0..64, 최소 2개의 최대 출력 point를 요구합니다. 비유한 좌표와 `0 < control_weight <= 1` 밖의 값은 할당 전 거부합니다. 깊이·점 수를 다 쓰면 근사를 조용히 수용하지 않고 오류를 반환합니다. 반환 배열은 호출자가 allocator로 해제합니다. 이 계층은 [기존 단일 parameter 평가](emf-plus-arc-segment-evaluation.md)를 복제하거나 Arc 각도·Pen·fill 의미를 해석하지 않습니다.

## 검증

90도 원호의 257개 평가 표본을 tolerance 0.1의 polyline까지 거리로 독립 대조합니다. flat/collinear overshoot, 부호 있는 zero endpoint, tolerance·weight·좌표·depth·point 경계, 모든 할당 실패의 정리 경로를 검사합니다. 전체 Arc와 여러 record의 연결 검증은 [Arc polyline](emf-plus-arc-device-polyline.md)이 소유합니다.

적대적 검증은 control weight 제거, de Casteljau 첫 보간 변경, control flatness 무시, 선분 밖 projection clamp 제거, 출력 한도 제거, 좌우 출력 순서 교환, Arc joint 중복, Pie center 대체, zero-sweep radial end 대체의 9종 의미 변이를 독립 `src/` 복사본에 적용했습니다. 변이·모드별 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 27/27회가 모두 테스트 assertion으로 검출됐으며 생존·컴파일 오류·panic은 없습니다. 임시 캠페인은 `/private/tmp/hwpjs-arc-polyline-mutants.T5ytgh`에서 실행했고 검증 뒤 복사본·cache를 제거했습니다.

변이 없는 최종 소스의 세 모드 전체 `zig build audit --summary all`은 각각 40/40 단계·2,062/2,062 테스트를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`을 확인했습니다. 로그는 `/tmp/hwpjs-arc-polyline-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 별도 `zig build test --summary all`은 5/5 단계·2,023/2,023 native 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 빌드 단계를 통과했습니다. 이는 합성 Arc geometry와 기존 회귀의 근거이지 실제 한컴 픽셀 동등성의 근거는 아닙니다.
