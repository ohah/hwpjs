# EMF+ Arc exact rational quadratic segments

## 범위와 단일 출처

`src/image/emf/emf_plus_arc_device_segments.zig`는 해석된 [affine Arc geometry](emf-plus-arc-device-geometry.md)를 할당 없는 rational quadratic segment iterator로 변환합니다. [Arc point 계층](emf-plus-arc-device-points.md)이 affine ellipse의 점 조립을 소유하며 이 모듈은 각 span의 conic control과 weight, 진행 상태만 소유합니다.

[MS-EMFPLUS EmfPlusDrawPie](https://learn.microsoft.com/en-gb/openspecs/windows_protocols/ms-emfplus/bd93aa68-e96f-42f1-8aea-390920f327fd)의 signed sweep 방향과 ±360도 한도를 보존합니다. 각 span의 절댓값은 최대 90도입니다. 시작각 `a`, signed span `d`, 중간각 `m=a+d/2`, ellipse 중심 `C`, affine 반축 벡터 `U,V`에 대해 다음 homogeneous conic을 반환합니다.

```text
w  = cos(d/2)
P0 = ellipse(a)
P1 = C + U * cos(m)/w + V * sin(m)/w
P2 = ellipse(a+d)

R(t) = ((1-t)^2 P0 + 2w t(1-t) P1 + t^2 P2)
       / ((1-t)^2 + 2w t(1-t) + t^2)
```

90도 이하에서는 `w`가 양수이고 0이 되지 않습니다. 이 표현은 폴리라인이나 cubic Bézier 근사가 아니라 원·ellipse의 정확한 rational quadratic 표현을 affine device space로 옮긴 것입니다. 저장된 f32 좌표와 삼각함수 계산에는 통상적인 부동소수점 반올림이 있습니다.

iterator는 `remaining_degrees`를 부호를 유지한 채 `[-90,90]`으로 잘라 최대 네 segment를 방출합니다. 이전 segment의 `end`를 다음 `start`로 직접 재사용해 bit-level 연결성을 유지합니다. 각 end 각도는 `[0,360)`으로 감싸므로 ±360도는 네 segment 뒤 첫 start와 마지막 end가 같습니다. 0 또는 signed zero sweep은 segment를 만들지 않으며 signed 원값은 iterator 상태에 남습니다.

DrawArc의 `deviceSegments()`와 DrawPie·FillPie의 `deviceArcSegments()`는 기존 `deviceArc()`가 성공한 경우에만 이 iterator를 반환합니다. record 계층은 각도 해석·분할·control 계산을 복제하지 않습니다.

## 지원 경계

이 계층은 exact-conic geometry 표현까지 제공합니다. rational quadratic 평가 API, tolerance 기반 flattening, DrawArc/DrawPie stroke, FillPie의 arc와 radial edge를 합친 닫힌 boundary, Pen/Brush, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 출력 backend가 rational quadratic을 직접 소비하지 못할 때의 subdivision tolerance도 이 계층에서 임의로 정하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 회전·shear affine ellipse의 90도 span에서 start/control/end/weight와 rational midpoint를 독립 평가식으로 대조합니다. 양·음 200도는 `90+90+20`과 `-90-90-20`의 순서·부호·연결성을 검사합니다. 360도 네 segment의 폐합, signed-zero 빈 iterator, 세 record 공개 helper의 공용 iterator 대조와 invalid angle null 전파도 검사합니다.

적대적 검증은 180도 분할, 음수 한도 45도, sweep 절댓값화, 중간각·half-angle·radian divisor 변경, unit weight, control의 두 weight 나눗셈 제거, start/end 오배치, remaining/start 진행 중단, start/sweep metadata 손상, zero sweep 방출, 공통 affine component 교환, 세 record 공개 연결 단절이라는 20개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 수치 경로 개선 뒤 전체 캠페인을 새 복사본에서 다시 실행했으며 최종 60/60회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·무변이·panic은 없습니다. 최종 캠페인은 `/tmp/hwpjs-arc-segments-final-mutants.wjO0xJ`에 있습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,992/1,992 테스트(native 1,953, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-arc-device-segments-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
