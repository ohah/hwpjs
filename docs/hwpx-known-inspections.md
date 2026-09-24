# HWPX 현재 지원 검사 묶음

`Document.inspectKnown(allocator, options)`는 같은 패키지 문서에 현재 공개된 개별 검사를 순서대로 적용하고 `KnownReport`를 반환합니다. ZIP/OCF/OPF 관계는 선행 `inspectDocument`가 검사합니다. 이 API는 보호 manifest를 먼저 확인한 뒤 version XML, header·spine 구조, header 리소스 ID, section/헤더 서식 참조, 언어별 글꼴, 번호·글머리표, 이진 리소스 연결, 차트 경로·캐시·수식 구조, section 텍스트 이벤트, 문단 메타 속성, header 시작 번호의 기존 보고서를 묶습니다. 같은 이름의 파서나 참조 규칙을 새로 만들지 않고 `Document`의 각 진입점을 호출합니다.

반환 보고서는 소유 문자열·배열을 `deinit(allocator)`으로 해제합니다. 원본 `Document`·ZIP 바이트를 해제해도 보고서의 소유 값은 유효하지만 manifest item 인덱스를 파일 경로로 역참조하려면 원본 문서가 필요합니다. 암호화된 항목이 보호 manifest에 있으면 `EncryptedDocument`로 멈추며, 암호화 분류만 필요하면 기존 `inspectProtection`을 사용합니다. 구조·서식 참조·차트 등의 미해결 항목은 해당 보고서의 진단값으로 남습니다. `inspectKnown`의 성공은 이 진단값이 모두 0이거나 **전체 문서가 유효하다는 뜻이 아닙니다.**

각 단계의 `options`와 메모리·해제 바이트 한도는 기존 검사 계약 그대로 독립 적용됩니다. 하나의 전역 해제량 예산이나 전체 문서 스키마 검증을 새로 제공하지 않습니다. 일부 XML을 여러 단계에서 다시 읽으므로 큰 문서에서는 비용이 높습니다. 호출 중 어느 단계에서든 오류가 나면 이전 단계의 소유 보고서와 임시 XML 트리를 정리합니다.

미구현 범위는 2011 외 OWPML namespace의 의미, 전체 header/section XSD 및 조건부 분기, 참조가 없는 남은 패키지 part와 BinData 실제 바이트, 차트 수식의 의미·표시, 문서 모델·레이아웃, 편집·저장·무손실 왕복입니다. 이 API의 이름을 `validateDocument`나 완료 판정으로 바꾸지 않는 이유입니다.

현재 Zig 코어 API이며 제품 JS/WASM 공개 API에는 아직 연결되지 않았습니다.

## 검증

합성 패키지와 실제 HWPX 예제에서 모든 보고서의 구역 수 연결, 원본 해제 뒤 보고서 수명, 단계별 한도, 마지막 단계 실패 뒤 명시적 할당 회계, 모든 할당 실패 지점의 원자적 정리를 검사합니다. 암호화 manifest와 손상된 version XML이 함께 있으면 암호화 진단이 먼저 나오며 누수가 없는지도 검사합니다. 선택 실파일 검사는 기존 두 corpus를 8개 독립 shard로 나눠 수행하며 결과와 재현 명령은 [개발·검증 명령](development-commands.md)에 기록합니다.

2026-09-24 실측에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 544개 section·215,146개 문단을 8개 shard에서 묶음 검사했습니다. `beginNum` 존재 455개·문단 `id` 부재 0개와 section 수가 독립 Python 조사 및 개별 보고서와 일치했습니다. 성공 보고서에도 스타일 대상 테이블 부재 같은 미해결 진단이 남을 수 있음을 합성 패키지로 확인했습니다. 이 집계는 **문서별 모든 의미 필드의 적합성**이나 전체 HWPX 스키마 적합성을 증명하지 않습니다.

첫 조사 방식은 하나의 테스트 할당자를 shard의 모든 문서에 재사용한 채 여러 shard를 병렬 실행해 RSS가 과도하게 증가했습니다. 해당 실행은 결과를 기다리지 않고 종료했습니다. 수정한 선택 조사에서는 문서마다 안전 검사 할당자를 새로 만들고 동시 요청 바이트 2 GiB 상한 및 종료 시 잔여 0바이트를 확인합니다. 이 방식으로 8개 shard를 재실행해 모두 통과했습니다. 초기 RSS 증가의 내부 원인을 제품 누수로 단정하지 않으며, 묶음 API가 동일 XML을 여러 번 읽는 비용은 별도로 개선해야 합니다.

수정한 조사기는 기존 XML 트리 조사기와 같은 Zig 기대값 파일 `src/hwpx_corpus_expectations.zig`를 공유합니다. 독립 Python ZIP/XML 조사 `tools/hwpx-section-text-oracle.py`는 그 파일을 읽지 않습니다.

같은 최종 소스의 네이티브 Debug 전체 테스트 2,193개와 전용 테스트 6개(Debug·ReleaseSafe·ReleaseFast), ReleaseSafe 제품 빌드 및 전체 Debug `zig build audit --summary all`이 통과했습니다. 선택 실파일 8개 shard와 독립 Python 조사도 재실행해 위 수치가 일치했습니다. 실파일 검사는 기본 audit에 포함되지 않습니다.
