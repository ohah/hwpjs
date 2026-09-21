# EMF+ BeginContainer transform 재생

## 근거와 해석

MS-EMFPLUS 2.3.7.1은 DestRect와 SrcRect가 컨테이너 transform을 지정한다고 정의합니다. 해당 표의 “DestRect에 적용하면 SrcRect” 문장은 Microsoft GDI+ `Graphics::BeginContainer(dstrect, srcrect, unit)` API 설명 및 공식 예제의 SrcRect→DestRect 결과와 방향이 반대입니다. 공식 예제의 source `(0,0,200,100)`과 destination `(100,100,200,200)`은 컨테이너 안에서 `(100,100)` 이동과 y축 2배 확대가 적용된다고 명시합니다.

명세가 행렬 산식을 직접 주지 않는 부분은 Windows 호환 구현의 실제 재생 경로를 독립 대조했습니다. Wine `dlls/gdiplus/metafile.c`는 LogicalDpiX/Y로 source 단위를 pixel로 바꾸고 `dest.width / scaled_source.width`, `dest.height / scaled_source.height`, `dest.x - scaled_source.x`, `dest.y - scaled_source.y`를 구성한 뒤 기존 world transform에 prepend합니다. 이 프로젝트는 코드를 복제하지 않고 같은 관측 계약을 별도 Zig 산술로 구현합니다.

## 책임과 단일 출처

`src/image/emf/emf_plus_container_transform.zig`가 컨테이너 행렬 구성을 소유하고 `emf_plus_unit_scale.zig`의 공용 단위 환산을 사용합니다. pixel은 1, point는 DPI/72, inch는 DPI, document는 DPI/300, millimeter는 DPI/25.4입니다. x/y는 EmfPlusHeader의 LogicalDpiX/Y를 각각 사용합니다. 0 크기·0 DPI·NaN·무한대는 wire parser가 보존한 값에 IEEE-754 산술을 적용하며 임의 보정하지 않습니다.

tracked stream은 BeginContainer 직전에 현재 graphics state를 snapshot하고 계산된 행렬을 기존 world transform에 prepend합니다. EndContainer 또는 바깥 Restore는 snapshot을 복원합니다. DPI는 `State.report.header`가 유일하게 소유하며 stack에 복제하지 않습니다.

MS-EMFPLUS가 SHOULD NOT으로 표시한 World와 Display는 parser 단계에서는 기존 호환 계약대로 허용하지만 단위 환산을 추정하지 않습니다. 이 경우 현재 world transform을 unknown(`null`)으로 바꾸고 `begin_container_unknown_transform_records`를 증가시킵니다. 뒤의 SetWorldTransform 또는 ResetWorldTransform은 다시 알려진 상태를 확립할 수 있습니다. pixel~millimeter 적용 성공은 `begin_container_transform_records`로 별도 집계합니다.

## 미지원 경계

이 단계는 BeginContainer의 world-transform 효과를 재생합니다. 공용 graphics snapshot에는 [page transform](emf-plus-page-transform.md), [보수적 일반 clip state](emf-plus-clip-state.md), [소유 terminal-server clip rectangles](emf-plus-ts-clip-state.md), [소유 terminal-server graphics와 Palette](emf-plus-ts-graphics-state.md), [여덟 graphics property](emf-plus-property-state.md)도 포함됩니다. 실제 GDI+ 렌더러나 픽셀 동등성은 구현 범위가 아닙니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성을 주장하지 않습니다.

## 검증 기록

공식 GDI+ 예제의 pixel 이동·배율, 각 물리 단위와 비대칭 DPI, 비대칭 source offset, 0 크기의 IEEE 결과, World/Display unknown을 순수 행렬 테스트로 검사합니다. stream 테스트는 Header DPI의 comment 간 유지, 비identity 기존 행렬에 대한 prepend, 적용/unknown 보고, unknown 뒤 SetWorldTransform 회복, EndContainer/Restore 복원과 두 신규 counter overflow의 comment 원자성을 검사합니다. 새 모듈은 filtered test에서도 누락되지 않도록 `src/root.zig` 테스트 인덱스에 직접 등록했습니다.

point 환산, height ratio, source offset, discouraged 단위 처리, x/y DPI 선택, prepend 순서, unknown 상태, 적용 counter와 stack 복원의 9개 의미 변이를 독립 source 복사본과 mode별 cache, 120초 watchdog으로 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 첫 실행에서 순수 모듈 테스트가 filter에 수집되지 않는 문제와 무효 변이 1개를 발견해 root 인덱스와 변이를 고친 뒤 재검증했습니다. 최종 유효 결과는 27/27 테스트 의미 실패이며 생존·컴파일 오류·timeout 0입니다. 로그는 `/tmp/hwpjs-container-transform-mutants`에 있습니다.

변경 소스를 고정한 뒤 전체 `audit`를 세 모드에서 순차 실행했습니다. 각 모드는 40/40 단계와 1,896/1,896 테스트(native 1,857, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-container-transform-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
