# EMF+ 연결 Bézier device polyline

## 범위와 단일 출처

`src/image/emf/emf_plus_bezier_device_polyline.zig`는 연결된 DrawBeziers device segment iterator를 하나의 소유 polyline으로 병합합니다. record bytes·PointR 누적·cubic topology·world/page/device 변환을 다시 구현하지 않고 [device segment 계층](emf-plus-bezier-device-segments.md)을 소비합니다. 각 segment는 [단일 cubic flattening](emf-plus-cubic-flattening.md)에 그대로 위임합니다.

첫 segment는 start와 end를 모두 보존하므로 점 하나에 collapsed된 cubic도 두 개의 동일 point로 표현됩니다. 다음 segment는 첫 point가 이전 출력의 마지막 point와 좌표 비트까지 같아야 하며, 아니면 `DiscontinuousEmfPlusBezierSequence`입니다. 연결점인 첫 point는 건너뛰고 이후 point만 추가합니다. 후속 collapsed segment가 이전 endpoint와 동일한 point만 만들면 geometry 출력에는 새 점을 추가하지 않습니다. 따라서 segment 경계의 공유 endpoint는 한 번만 저장하되 단독 collapsed cubic은 두 point를 유지합니다.

`Options.max_points`는 전체 결과 예산입니다. 첫 segment에는 전체 한도를, 후속 segment에는 `remaining+1`을 전달합니다. `+1`은 병합에서 제거할 공유 start 몫이며 points가 이미 하나 이상이라 overflow하지 않습니다. 정확한 전체 예산은 성공하고 하나 부족하면 하위 flattener의 `EmfPlusCubicPointLimitExceeded`를 그대로 전파합니다. tolerance·depth 검증은 공용 Options가 소유하고 aggregate가 빈 iterator보다 먼저 호출합니다.

결과는 공용 `Polyline` 소유권과 `deinit()`을 사용합니다. source iterator는 값으로 복사해 소비하므로 호출자 상태를 변경하지 않습니다. 빈 sequence는 `EmptyEmfPlusBezierSequence`이며 iterator·좌표·깊이·출력·할당 오류에서 부분 결과를 노출하지 않고 모든 임시 segment polyline과 aggregate storage를 해제합니다.

`DrawBeziers.flatten()`은 기존 `deviceSegments()`를 이 계층에 연결합니다. Pen ID나 stroke 정책은 geometry point 배열에 섞지 않습니다.

## 지원 경계

이 계층은 하나의 DrawBeziers record가 나타내는 연결 cubic sequence까지만 병합합니다. 여러 record 연결, DashMode·PathMarker, Pen 폭·cap·join·dash, clipping, hit testing, anti-aliasing, rasterization과 저장은 후속 책임입니다. Path의 Move·figure·command metadata 소유는 [별도 device figure geometry](emf-plus-path-device-geometry.md)가, figure별 평탄화는 [Path device figure polyline](emf-plus-path-device-polyline.md)이 담당합니다. 실제 한컴 EMF+ corpus 표본이 없으므로 렌더링 동등성을 주장하지 않습니다.

## 검증 기록

위·아래로 휘는 두 segment와 후속 collapsed segment를 사용해 parameter 순서, canonical 개별 결과와의 전체 일치, 공유 endpoint 단일 저장, 첫/끝 좌표를 검사합니다. 단독 collapsed cubic은 같은 point 두 개를 유지합니다. 정확한 전체 예산 성공과 하나 부족 실패, 불연속, 빈 sequence, 둘째 segment iterator 오류, 빈 sequence에서도 option 검증 우선순위를 구분합니다. `checkAllAllocationFailures`로 모든 aggregate·segment 할당 실패 위치의 정리를 검사합니다. 공개 DrawBeziers API는 실제 7-point record에서 두 segment 전체 결과와 global budget 연결을 canonical aggregate와 대조합니다.

적대적 검증은 option 선검증, iterator 오류 전파, segment tolerance·depth 전달, continuity gate, 첫 segment 전체 append, 후속 collapsed dedup, aggregate global-budget gate, segment count·empty gate, x/y와 signed-zero bit equality, DrawBeziers mapping·options 연결이라는 15개 의미 변이를 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 45/45회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-bezier-polyline-mutants.TIRfc3`입니다. 넉넉한 depth fixture, 하위 segment limit으로 이미 제거되는 global gate, 후속 shared start를 다른 dedup이 제거한 의미상 동등 변이, mapping 인자 미사용 컴파일 오류를 드러낸 선행 캠페인은 완료 수치에서 제외하고 테스트·변이를 보정했습니다. 최종 적대적 리뷰에서 첫 segment가 예산을 모두 소진한 뒤 후속 segment의 endpoint가 한 점 초과하는 결함을 재현했고, append 직전의 aggregate gate와 전용 회귀·변이 테스트로 보강했습니다. 이 gate 뒤에서 remaining·segment-limit을 넓히는 변이는 출력과 오류가 동일한 의미상 동등이므로 최종 변이 수에 포함하지 않았습니다.

소스와 테스트를 고정한 최종 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,023/2,023 테스트(공통 native 1,984개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 로그는 `/tmp/hwpjs-bezier-polyline-fixed-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 하나의 DrawBeziers record 내 연결 cubic device polyline 계약의 근거이며 Path figure 재생이나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
