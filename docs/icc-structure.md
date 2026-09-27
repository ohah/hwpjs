# ICC 구조 구현 작업

후속 [헤더 식별자 검증](icc-header-identifiers.md)과 연결된 v2/v4 수치 검사는 별도 명시적 API입니다. 아래 기반 파서 자체의 허용 범위는 변경하지 않습니다.

## 현재 경계

`src/image/icc/`는 PNG·압축 계층에 의존하지 않습니다. 이 문서의 기반 계층은 헤더 필드 해석, 전체 버퍼의 선언 길이 검사, v4 프로파일 ID 검사를 담당하고 [태그 테이블·저장 배치](icc-tag-table.md)와 조립됩니다. [식별자](icc-header-identifiers.md)·[v4 수치](icc-header-values.md)·[v2 수치](icc-header-v2-values.md)·[등록 조회](icc-registry-lookup.md)·[필수 태그 존재](icc-required-presence.md)·[선택형 내용](icc-tag-payload-dispatch.md)은 별도 계층의 부분 검사입니다. 개별 함수 성공을 전체 헤더 의미·색상 변환 또는 유효한 ICC 프로파일 인증으로 읽으면 안 됩니다.

근거는 [ICC v2 §6.1](https://www.color.org/specification/ICC.1-2001-04.pdf)와 [ICC v4 §7.2](https://www.color.org/specifications/ICC.1-2022-05.pdf)입니다. 버전별 배치와 검증 의미를 분리하며, 최신 버전의 요구를 구버전 전체에 소급하지 않습니다.

## 책임과 소유권

- `version.zig`: 네 바이트의 BCD 버전과 두 예약 바이트를 검사합니다. major 2/4만 해석합니다. 유효한 minor/bugfix 원값을 보존하지만 해당 revision의 의미까지 지원한다는 뜻은 아닙니다.
- `header.zig`: 정확히 128바이트, acsp 표식, 버전을 검사하고 모든 헤더 필드를 복사합니다. 날짜는 6개 u16, XYZ는 signed fixed-point의 원시 i32입니다. 포인터·힙 할당이 없습니다.
- 헤더 tail은 union으로 구분합니다. v2의 44바이트 예약 영역을 v4 ID로 읽지 않습니다. v4의 16바이트 ID가 0이어도 필드는 존재하며, 이는 계산된 ID가 없다는 상태와 연결됩니다. 예약 영역의 비영 값도 이 필드 파서에서는 보존하며 별도 의미 검증이 필요합니다.
- `extent.zig`: 전체 입력 한도, 헤더와 태그 개수 필드가 들어갈 최소 길이, 선언 크기와 실제 버퍼 길이 일치를 소유합니다. 태그 개수의 유효성은 아직 검사하지 않습니다.
- `profile_id.zig`: v4 지정 방식으로 ID를 계산·비교합니다. 제외할 필드 위치는 헤더 모듈과 공유합니다. 입력 복사·수정 없이 해시를 갱신합니다. v2는 not_defined, v4 ID가 0이면 not_calculated, 비영 값이 일치하면 verified입니다. MD5는 명세상 식별자이며 인증·위변조 방지 수단이 아닙니다.

날짜 범위·플래그·D50·예약 필드와 일부 서명/등록 상태는 현재 별도 v2/v4 검사기로 확인할 수 있지만, 이 기반 파서가 자동으로 적용하지는 않습니다. 클래스별 추가 의미와 등록 상태의 전체 적합성도 별개입니다. 특히 프로파일 ID가 일치해도 이런 필드나 태그의 유효성을 보증하지 않습니다.

태그 테이블의 순서 보존·공유·배치 정책과 해당 검증 기록은 [태그 테이블 문서](icc-tag-table.md)가 소유합니다. 최신 배치 규칙을 구버전에 자동 적용하지 않습니다.

## 2026-09-27 재검증

[ICC.1:2001-04 §6.1](https://www.color.org/specification/ICC.1-2001-04.pdf)과 [ICC.1:2022 §7.2](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 128바이트 헤더·판본별 tail·선언 길이 및 v4 MD5 계산에서 flags 44–47, intent 64–67, ID 84–99를 0으로 취급하는 규칙을 현재 `version.zig`·`header.zig`·`extent.zig`·`profile_id.zig`에 대조했습니다. v2의 84–127은 ID가 아닌 예약 원문이며, MD5 일치는 인증이나 모든 필드 검증이 아닙니다.

Debug·ReleaseSafe·ReleaseFast에서 `ICC header `·`ICC version `·`ICC v4 ID `·`ICC ID v2 ` 필터는 각 모드 각각 root 포함 3/3·2/2·2/2·2/2로 통과했습니다. 기존 로컬 `hwp5-probe.wasm`의 mode143/144/145 독립 JS 넓은 대조는 정상 38,178건·거부 23,551건이 일치하고 헤더 변형 입력 32,768건을 포함합니다. 넓은 대조 전체를 헤더 전용 건수로 세지 않습니다. WASM은 이번에 새로 빌드하지 않았고, 과거 세 모드 전체 audit·공식 외부 ICC 4개·HWP 미리보기 조사는 재실행하지 않았습니다. PNG iCCP 연결은 현재 별도 계층에 구현되어 있으나, 이번 기반 헤더 검증은 색 변환·HWP/HWPX 전체 문서 동치를 증명하지 않습니다.

## 과거 검증 기록

헤더 테스트는 서로 다른 위치별 값으로 모든 필드를 대조합니다. v2/v4 tail, 입력 수정 후 복사값 유지, BCD 두 바이트의 65,536개 조합, 예약 버전 바이트, 128바이트의 모든 잘림·초과 길이, acsp 각 바이트의 256값, signed i32 경계를 검사합니다.

ID 테스트의 기본 기대 해시는 독립 Node `crypto.createHash('md5')`에서 계산했습니다. 132바이트 0 버퍼에 선언 크기 132, 버전 04400000, acsp만 기록한 입력의 MD5는 `5b351cd6ea91c5df5cda03612c0f47ad`입니다. 이 입력은 ID 알고리즘 테스트용이며 완전한 유효 ICC 샘플이 아닙니다. 제외 필드 8바이트의 모든 값, ID 16바이트의 모든 값, 다른 필드 변경에 대한 불일치, v2 예약 영역, 잘림·크기 불일치·한도를 검사합니다.

2026-09-07 헤더 추가 후 네이티브 404/404, ID 추가 후 Debug/ReleaseSafe/ReleaseFast의 `zig build test --summary all`을 순차 실행하여 각각 406/406 통과를 확인했습니다(Release 모드는 해당 optimize 옵션 포함). 포맷·로컬 링크 32개·`git diff --check`도 통과했습니다. 이는 해당 단계의 네이티브 테스트 결과입니다. 이후 [WASM·실파일·전체 audit 기록](icc-verification.md)은 별도 문서에서 관리합니다. 당시 PNG 연결은 미완료였으나 현재는 iCCP 프로파일 검사 경로가 있습니다.
