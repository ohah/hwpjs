# ICC 헤더 식별자 검증 (진행 중)

후속 [v4 수치·예약 영역 검사](icc-header-values.md)는 별도 모듈이며, 아래 식별자 검사에 자동 포함하지 않습니다.

이후 WASM 연결과 결과는 [헤더 의미 계층 검증](icc-header-verification.md)에 기록합니다. 아래 실행 기록은 각 네이티브 단계 당시의 결과입니다.

기준은 [ICC v2 §6.1.4~6.1.7](https://www.color.org/specification/ICC.1-2001-04.pdf)과 [ICC v4 §7.2.5~7.2.10](https://www.color.org/specifications/ICC.1-2022-05.pdf)입니다. 기존 header.parse는 원값을 계속 보존하며 새 검사는 명시적으로 호출합니다.

## 책임

- `signatures.zig`: 프로파일 종류 7개, 색 공간 25개와 채널 수, PCS용 XYZ/Lab, 플랫폼 표의 정확한 4바이트 비교를 소유합니다. 대소문자·공백을 보정하지 않습니다. 일반 색 공간과 DeviceLink PCS가 같은 표를 재사용합니다.
- `header_identifiers.inspect`: 파싱된 Header와 명시적인 표 선택(`v2_2001` 또는 `v4_2022`)을 받습니다. 선택과 major가 다르면 오류입니다. minor/bugfix의 모든 역사적 의미를 지원한다는 인증은 아닙니다.
- 일반 프로파일의 PCS는 XYZ/Lab만, DeviceLink는 색 공간 표 전체를 허용합니다. 채널 수는 색상 변환의 구현 여부와 다릅니다.
- 플랫폼 0은 미지정으로 허용합니다. TGNT는 v2 표에만 있습니다. 나머지는 APPL/MSFT/SGI /SUNW입니다.
- CMM·제조사·모델·작성자 식별자는 외부 등록부 대조를 하지 않습니다. 비영 필드 개수를 `registry_fields_deferred`로 반환합니다. 작성자 등록의 권고와 다른 필드의 요구 조건을 같은 오류로 취급하지 않습니다.

이 검사는 식별자에 한정됩니다. 날짜·플래그·속성·렌더링 의도·D50·예약 영역은 별도 수치 API의 책임이며 이 함수에 포함되지 않습니다. 클래스별 추가 제약, 등록부, 필수 태그·내용·PNG 연결은 후속 작업입니다. 전체 헤더 의미 검증이나 프로파일 유효성을 보증하지 않습니다.

## 검증 상태

2026-09-07 첫 두 테스트 추가 후 `zig build test --summary all` 414/414 통과를 확인했습니다. 색 공간 표를 테스트에 독립적으로 열거하여 25×4×256개 바이트 변형을 대조했습니다. 이후 클래스·플랫폼 전 위치 변형과 클래스별 PCS 조건 테스트를 추가했고 같은 명령으로 415/415 통과를 확인했습니다. 이 시점에는 WASM 독립 비교·세 모드 전체 audit·실파일 대조를 실행하기 전이었으며, 이후 결과는 위 검증 문서에서 관리합니다.

이어 `zig build test -Doptimize=ReleaseSafe --summary all`과 `zig build test -Doptimize=ReleaseFast --summary all`을 순차 실행하여 각각 종료 코드 0, 415/415 통과를 확인했습니다. 포맷·diff 검사와 두 관련 문서의 로컬 링크 4개도 통과했습니다. 이는 네이티브 테스트이며 전체 audit 완료로 치환하지 않습니다.
