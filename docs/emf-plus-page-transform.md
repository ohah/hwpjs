# EMF+ page transform 재생

## 책임과 단일 출처

`src/image/emf/emf_plus_unit_scale.zig`가 EMF+ 물리 단위의 DPI 환산을 단독 소유하며 BeginContainer와 page transform이 이를 함께 사용합니다. pixel은 1, point는 DPI/72, inch는 DPI, document는 DPI/300, millimeter는 DPI/25.4입니다.

`src/image/emf/emf_plus_page_transform.zig`는 wire 값인 PageUnit·PageScale과 계산된 page-to-device x/y scale을 분리해 보존합니다. x/y는 EmfPlusHeader의 LogicalDpiX/Y를 각각 사용하고 물리 단위의 device scale은 `unit scale * PageScale`입니다. world transform은 별도 상태이므로 두 변환을 하나의 행렬로 조기에 합치지 않습니다.

World와 Display는 SetPageTransform에서 SHOULD NOT인 호환 입력입니다. parser와 경고 계수는 원값을 보존하지만 문서만으로 device scale을 확정하지 않고 `device_scale = null`로 둡니다. PageScale의 signed zero, NaN, 무한대와 0 DPI도 IEEE-754 의미를 임의 보정하지 않습니다.

tracked stream은 SetPageTransform을 현재 graphics state에 적용하고 성공한 comment 뒤 `Report.page_transform`에 같은 값을 노출합니다. Save와 BeginContainer snapshot은 page transform도 값으로 저장하며 Restore와 EndContainer가 함께 복원합니다. 실패한 comment는 cloned stack과 report를 모두 폐기합니다. allocation-free `State.consume`은 상태 재생 API가 아니므로 report 값이 `null`입니다.

## 미지원 경계

현재 구현은 page-to-device scale 상태와 수명주기를 재생하며 [world·page·device 좌표 계층](emf-plus-world-page-device.md)이 일반 point에 이를 순차 적용합니다. 개별 geometry 전체 순회, device origin과 rasterization은 구현 범위가 아닙니다. [여덟 graphics property](emf-plus-property-state.md)는 별도 상태로 추적하고, clip은 [별도 보수적 상태](emf-plus-clip-state.md)로 재생하지만 geometry clipping은 하지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력의 픽셀 동등성도 주장하지 않습니다.

## 검증 계약

- 일곱 UnitType의 공용 환산과 World/Display 미확정 처리를 검사합니다.
- 비대칭 DPI, PageScale, signed zero와 무한대가 page state에 그대로 반영되는지 검사합니다.
- tracked stream에서 Header DPI 유지, report 동기화, Save/Restore 복원과 malformed comment 원자성을 검사합니다.
- 환산 상수, x/y DPI, PageScale 적용, stream 상태 적용, snapshot 보존, report 연결과 context-sensitive 단위 처리의 의미 변이를 Debug·ReleaseSafe·ReleaseFast에서 각각 검출합니다.

위 일곱 의미 변이를 세 모드에서 실행한 최종 유효 결과는 21/21 테스트 의미 실패이며 생존·컴파일 오류·timeout은 0입니다. 상태 적용을 제거해 Zig unused-local 컴파일 오류만 만든 최초 변이는 증거에서 제외하고, 입력을 소비하면서 잘못된 pixel 상태를 적용하는 유효 변이로 다시 검사했습니다. 로그는 `/tmp/hwpjs-mutant-{point,axis,scale,apply,snapshot,report,context}-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

BeginContainer/EndContainer 복원 검사까지 추가한 최종 소스를 고정한 뒤 전체 `audit`를 세 모드에서 다시 순차 실행했습니다. 각 모드는 40/40 단계와 1,900/1,900 테스트(native 1,861, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했습니다. 로그는 `/tmp/hwpjs-page-transform-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
