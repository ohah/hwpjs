# EMF+ CustomLineCap 객체

## 책임과 구조

`src/image/emf/emf_plus_custom_line_cap.zig`는 [EmfPlusCustomLineCap](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/1bfe3d89-9dc4-4ced-8fb7-6a80c9874091)의 GraphicsVersion, signed CustomLineCapDataType과 Default/AdjustableArrow dispatch를 소유합니다. 완성된 Object assembler 결과는 `parseCompleted`가 ObjectTypeCustomLineCap인지 확인한 뒤 같은 parser로 전달합니다. 기본 객체 한도는 64 MiB이며 호출자가 낮출 수 있습니다.

`emf_plus_line_values.zig`는 CustomLineCapDataType, sparse LineCapType, LineJoinType과 CustomLineCapData flag를 한 번만 정의합니다. LineCapType은 0x00~0x03, 0x10~0x14, AnchorMask 0xf0과 Custom 0xff만 승인합니다. CustomLineCapData flag는 FillPath와 LinePath 두 비트만 승인하며 원값도 보존합니다. 이 값들은 후속 Pen parser가 그대로 재사용합니다.

`emf_plus_custom_line_cap_arrow.zig`는 [EmfPlusCustomLineCapArrowData](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/82483a79-a9d5-4ea0-949f-2486ea360442)의 정확한 52바이트 배치를 읽습니다. 세 크기 값, FillState 원값, 시작·끝 cap, join, miter limit, width scale과 두 hot spot을 보존합니다. FillState는 명세가 특정 정수 domain을 선언하지 않으므로 0만 false, 나머지는 true로 해석하면서 raw DWORD를 유지합니다. 사용되지 않는 두 hot spot은 명세대로 수치상 {0.0, 0.0}인지 검사합니다.

`emf_plus_custom_line_cap_default.zig`는 [EmfPlusCustomLineCapData](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/2790a571-6b39-482c-853f-f511bd122b77)의 48바이트 고정 필드와 FillData·OutlineData 순서를 소유합니다. 두 hot spot은 0인지 검사하고, 각 flag가 설정된 경우에만 해당 경로를 읽으며 후행 바이트를 허용하지 않습니다.

`emf_plus_sized_path.zig`는 FillPath와 LinePath가 공유하는 signed 길이 prefix와 원자적 cursor 갱신을 소유합니다. 음수·호출자 한도·잘림을 검사하고 선언된 slice만 기존 [Path parser](emf-plus-path-object.md)에 전달합니다. Region과 Pen의 후속 중첩 경로도 이 규칙을 재사용하며 길이 처리나 Path 구조를 다시 구현하지 않습니다.

## 검증과 미지원 경계

합성 fixture는 두 CustomLineCapDataType, sparse LineCapType 전체와 gap, LineJoinType, 두 flag, Arrow의 정확한 52바이트와 모든 잘못된 크기, FillState raw 보존, 두 hot spot, Default의 모든 고정 prefix 잘림, 고정 필드 순서, Fill/Line 단독 flag 귀속과 동시 wire 순서, signed nested size, 정확한 Path slice, 경로 한도, 원자적 실패, 후행 바이트, 객체 한도와 잘못된 ObjectType을 검사합니다.

현재 corpus에는 EMF+ CustomLineCap 실표본이 확인되지 않았으므로 한컴 버전별 payload나 렌더링 동등성을 실측 완료했다고 주장하지 않습니다. 이 계층은 wire 구조를 빌려 읽을 뿐 cap geometry 렌더링, Pen stroke 적용, miter·scale 계산, Path 래스터화나 재직렬화를 구현하지 않습니다.

## 적대적 검증 기록

20개 결함(data type·LineCap·LineJoin domain, flag mask, nested Path 음수·한도·slice·원자성, Arrow 크기·FillState·hot spot·필드 순서, Default 필드 순서·path 선택 비트·path wire 순서·hot spot·후행 바이트, 객체 한도·ObjectType·payload 시작)을 각각 독립 복사본에 주입했습니다. 최초 배치는 각 변이 캐시를 종료 뒤 보존해 디스크가 소진되었고 이후 결과가 오염됐으므로 폐기했습니다. 재실행은 변이별 새 로컬·전역 캐시를 사용한 직후 해당 캐시만 제거했으며, 제품 `src/root.zig`에서 Debug·ReleaseSafe·ReleaseFast 총 60/60을 검출했습니다. 컴파일 실패나 분류되지 않은 종료는 없습니다. 최초 Debug 검증에서는 같은 wire 형식인 FillPath와 LinePath를 모두 넣은 fixture만으로 선택 비트 교환 결함이 생존했으며, 각 flag를 단독 검증한 뒤 세 모드에서 검출했습니다. 변이 복사본은 `/tmp/hwpjs-emfplus-custom-cap-mutants.NPRibj`에 보존했습니다. 실행 당시 유효 로그는 `/tmp/hwpjs-custom-cap-rerun-<변이>-<모드>.log`였으며 임시 디렉터리 정리 뒤에는 지속 보존을 전제하지 않습니다.

전체 감사는 Debug·ReleaseSafe·ReleaseFast를 공유 산출물 충돌 없이 순차 실행했고 각 모드에서 40/40 단계와 1591/1591 테스트가 통과했습니다. 구성은 제품 루트 네이티브 1552개, 차트 소유권 31개, WMF Contents 8개이며 HWP/WASM 감사도 각 모드에서 8,905,827 checks와 imports 0을 보고했습니다. 로그는 `/tmp/hwpjs-emfplus-custom-cap-Debug-audit.log`, `/tmp/hwpjs-emfplus-custom-cap-ReleaseSafe-audit.log`, `/tmp/hwpjs-emfplus-custom-cap-ReleaseFast-audit.log`입니다. 중단된 이전 ReleaseSafe 실행은 통과로 세지 않고 처음부터 다시 실행한 결과만 기록했습니다.
