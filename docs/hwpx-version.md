# HWPX 버전 XML 검증

## 책임과 경계

`Document.inspectVersion`은 [패키지 관계](hwpx-package-relationships.md)가 검증한 ZIP에서 정확한 `version.xml` 엔트리를 해제하고, 공통 XML 파서로 문서 전체의 문법·namespace를 검사합니다. 루트는 `http://www.hancom.co.kr/hwpml/2011/version`의 `HCFVersion`이어야 합니다. `major`·`minor`는 10진수 `u32` 필수값으로 읽고, `micro`·`buildNumber`·`patch`·`revision`·`os`는 각각 부재 가능 값으로 유지합니다. `xmlVersion`, 원문 철자인 `tagetApplication`, `application`, `appVersion`도 각각 부재 가능 문자열로 유지합니다. 부재 필드를 0이나 다른 버전 필드로 대체하지 않습니다. 숫자 범위 초과·잘못된 루트·DTD는 오류입니다.

반환 `Version`의 문자열은 호출자가 `deinit`으로 해제합니다. ZIP 입력은 `Document`가 계속 빌립니다. 기본 해제 한도는 1MiB이고 속성별 UTF-8 변환 한도는 4096바이트입니다. 네임스페이스 선언은 공통 XML namespace 규칙으로 검사하지만 일반 속성 조회에서는 제외합니다. 이 계층은 파일의 버전 정보를 관측할 뿐 특정 버전의 모든 본문 필드 지원이나 저장 호환성을 선언하지 않습니다.

[한컴의 HWPX 구성요소 설명](https://tech.hancom.com/hwpxformat/)은 `version.xml`이 OWPML 형식 버전과 저장 환경을 담는다고 설명합니다. [한컴 공개 모델의 버전 읽기 코드](https://github.com/hancom-io/hwpx-owpml-model/blob/main/OWPML/Document.cpp)는 `HCFVersion`의 `major`·`minor`·`micro`·`buildNumber`를 읽습니다. 구현에서는 이 참고 자료를 실파일과 대조하고, 관측되지 않은 호환성 규칙을 추가하지 않습니다.

## 실파일·적대적 검증

2026-09-23 두 corpus의 `.hwpx` 484개 중 패키지로 열린 478개 모두 버전 XML 파서가 통과했습니다. 나머지 6개는 기존 ZIP 단계의 `MissingEndRecord`입니다. 열린 478개의 `major`는 모두 5였고 `minor=0`은 6개, `minor=1`은 472개였습니다. 한 `minor=0` 파일은 `micro`·`buildNumber` 대신 `patch`·`revision`을 사용하므로 네 값을 독립적으로 보존합니다. 관측 `xmlVersion`은 `1.1`, `1.2`, `1.3`, `1.31`, `1.4`, `1.5`로 다양합니다. 이 숫자는 필드별 구현 완료율이 아닙니다.

실파일 양쪽 변형, 잘못된 namespace·누락된 필수 숫자·음수·`u32` 초과, XML 참조를 사용한 속성 값, 정확한 바이트 한도, 모든 할당 실패와 명시적 해제 회계를 테스트합니다. 후속 [암호화 분류](hwpx-protection.md), [header·spine 구조](hwpx-document-structure.md), [header 리소스 ID 색인](hwpx-header-resources.md)은 별도 책임으로 구현됐습니다. [section p/run 서식 참조](hwpx-section-references.md)는 별도 계층이며, 나머지 section 내부 자원 참조와 편집·저장은 남아 있습니다.

적대적 검증은 원본과 분리한 소스 복사본에서 필수 `major` 누락 허용, `patch`를 `micro` 기본값으로 합치기, namespace 선언을 일반 속성으로 취급하기, `application` 문자열 해제 누락을 각각 주입했습니다. 앞의 세 변이는 Debug 테스트에서, 마지막 변이는 ReleaseFast의 명시적 할당 회계에서 실패했습니다. 컴파일 실패가 아니라 계약 위반을 검출한 결과이며, 임시 변이는 제품 소스에 반영하지 않았습니다.

최종 소스에서 HWPX 전용 테스트 28/28, `zig build test --summary all` 2050/2050, ReleaseSafe 제품 빌드 5/5 단계, `zig build compare -Doptimize=ReleaseSafe --summary all` 8/8 단계를 통과했습니다. 전체 `zig build audit --summary all`은 Debug·ReleaseSafe·ReleaseFast에서 모두 종료 코드 0이었고, ReleaseSafe·ReleaseFast 출력은 각각 40/40 단계·2089/2089 테스트였습니다. `zig fmt --check build.zig src`, 변경 문서 링크, diff 공백 검사도 확인합니다. 이 수치는 전체 HWPX 본문 의미 검증의 완료율이 아닙니다.
