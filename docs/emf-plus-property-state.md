# EMF+ graphics property 상태

## 책임과 단일 출처

`src/image/emf/emf_plus_property_state.zig`는 SetRenderingOrigin, SetAntiAliasMode, SetTextRenderingHint, SetTextContrast, SetInterpolationMode, SetPixelOffsetMode, SetCompositingMode, SetCompositingQuality의 현재 재생 상태만 소유합니다. 각 wire parser와 enum 모듈이 값 검증의 단일 출처이며 상태 모듈은 필드 배치나 enum domain을 복제하지 않습니다.

초기 Windows/GDI+ 기본값은 이 계층에서 추정하지 않습니다. 각 필드는 첫 해당 record를 관측하기 전에는 `null`이고, 관측 뒤에는 wire 의미를 그대로 보존합니다. 별칭 enum은 정규화하지 않으며 AntiAlias의 A bit와 SmoothingMode도 독립적으로 유지합니다. CompositingQuality는 정의되지 않은 byte와 Windows 유효 fallback을 함께 가진 `WireValue`를 보존합니다. TextRenderingHint와 CompositingMode처럼 조합에 사용 제약이 있는 값도 입력 상태를 서로 고쳐 쓰지 않습니다.

tracked stream은 성공한 comment 끝에 `Report.properties`를 현재 상태와 동기화합니다. Save·BeginContainer·BeginContainerNoParams는 여덟 필드를 함께 snapshot하고 Restore·EndContainer는 대상 시점 상태를 복원합니다. malformed record, 집계 overflow, 할당 실패나 같은 comment의 후반 오류에서는 report와 stack clone을 폐기해 이전 상태를 유지합니다. allocation-free `State.consume`은 재생 상태 API가 아니므로 `Report.properties`가 `null`입니다.

## 미지원 경계

이 구현은 record 순서에 따른 상태 보존과 수명주기만 제공합니다. rendering origin의 hatch/dither 적용, anti-aliasing, glyph hinting과 gamma, image resampling, pixel-center 처리, alpha compositing과 실제 품질 적용은 렌더러가 없으므로 수행하지 않습니다. 초기 플랫폼 기본값, 픽셀 출력, 저장과 실제 한컴 출력 동등성도 주장하지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없습니다.

## 검증 기록

합성 stream은 여덟 property를 서로 구별되는 값으로 적용하고, 미관측 상태, Save/Restore, BeginContainerNoParams/EndContainer, invalid CompositingQuality 원값, malformed comment rollback과 report 동기화를 검사합니다. 독립 상태 테스트는 모든 optional 필드와 정의·미정의 wire 값을 검사합니다.

필드별 오적용 8개, stack snapshot 누락 1개, report 연결 누락 1개의 유효 의미 변이를 변이·모드별 새 cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 30/30 실행이 모두 assertion 실패로 검출됐습니다. 컴파일만 실패한 최초 TextRenderingHint 상수 변이는 폐기하고 유효 enum 오매핑으로 교체했으므로 결과에 포함하지 않습니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,906/1,906 테스트(공통 native 1,867, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-property-state-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
