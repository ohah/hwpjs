# HWPX OPF 선언 XML 전수 문법 검사

`Document.inspectManifestXml(allocator, options)`는 OPF manifest의 `media-type`이 정확히 `application/xml`인 각 내장 항목을 ZIP 엔트리 인덱스로 찾아 XML 1.0 문서 문법과 namespace를 검사합니다. spine/header/section 선택 여부나 파일 확장자로 항목을 추측하지 않습니다. 같은 ZIP 엔트리를 여러 item ID가 가리키면 한 번만 해제·검사하고 중복 바인딩 수를 남깁니다. `isEmbeded="0"` 외부 XML item은 별도로 세며 접근하지 않습니다. `parsed_entry_indices`는 원본 `Document`가 살아 있을 때 ZIP 이름으로 역참조할 수 있는 인덱스이며, 반환 배열은 `ManifestXmlReport.deinit(allocator)`으로 해제합니다.

XML 문법은 기존 `document_xml.visitBytes`와 공통 `xml.document.visit`가 소유합니다. 순회 callback이 필요 없는 경우에도 동일한 문법·namespace·DTD 거부 정책을 사용하도록 방문자 인자를 optional로 확장했습니다. 새 계층은 media-type 선택·중복 엔트리 제거·전역 XML 예산·보고서만 소유하며 XML 파서 규칙을 복제하지 않습니다. 기본 엔트리당 XML 128 MiB, 합계 256 MiB, 요소 합계 800만, XML item 65,535개 한도를 적용하고 공통 순회의 엔트리별 한도도 유지합니다. ZIP 해제 결과는 ZIP archive 할당자로 해제합니다.

`inspectKnown`에서는 보호 manifest 분류와 모든 ZIP 바이트 무결성 검사 다음에 실행합니다. 단독 `inspectManifestXml`은 보호 의미를 확인하지 않으므로 암호화 문서는 먼저 `inspectProtection`으로 분류해야 합니다. 성공해도 OPF 밖 XML, `application/xml` 외의 XML 유사 media-type, header/section/settings/masterpage의 스키마·필드·표시 의미, 외부 리소스는 검증하지 않습니다. 이 API는 *선언된 XML의 문법 완결성*만 증명합니다.

## 검증

합성 패키지에서 header·section·settings·masterpage, 같은 ZIP 엔트리의 두 OPF ID, 외부 XML과 비XML item을 분리했습니다. 미선택 settings의 닫히지 않은 요소·미선언 접두사와 masterpage의 DTD·미해결 엔터티, 정확한/초과 바이트·요소·item 한도, 서로 다른 report·ZIP 할당자, 모든 할당 실패 지점, `inspectKnown`의 실패 전달을 검사합니다. 선택 corpus와 독립 대조의 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

2026-09-24 독립 `zipfile`/`ElementTree` 조사에서는 두 로컬 corpus의 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개에서 OPF `application/xml` 엔트리 1,536개를 확인했습니다. 내역은 header 476개·section 544개·settings 455개·masterpage 61개이며, 총 해제 XML 246,540,603바이트·요소 3,384,514개입니다. 조사 corpus에서 외부 XML item과 같은 엔트리 중복 바인딩은 각각 0개였습니다. 독립 oracle은 Zig 제품 코드·기대값 배열을 읽지 않지만 Python XML 파서의 문법 허용 범위가 Zig와 완전히 같음을 증명하지는 않습니다.

최종 제품 검사에서도 별도 프로세스의 8개 shard가 모두 통과했으며, 각 shard의 XML 엔트리 수·해제 바이트·요소 수·settings·masterpage 수를 독립 oracle의 고정 결과와 대조했습니다. 검사 대상은 암호화 이전 분류를 통과한 476개 문서뿐입니다. 이 통과를 settings/masterpage 스키마 적합성이나 전 HWPX 버전 호환성으로 확대하지 않습니다.

같은 최종 소스에서 새 전용 5개 테스트(루트 포함)는 Debug·ReleaseSafe·ReleaseFast, `inspectKnown` 통합 8개 테스트는 Debug·ReleaseSafe에서 통과했습니다. 네이티브 `zig build test --summary all`은 2,204/2,204, ReleaseSafe 제품 빌드와 `zig build compare -Doptimize=ReleaseSafe --summary all`(JS 비교 47/47), Debug `zig build audit --summary all`, `zig fmt --check build.zig src`도 종료 코드 0이었습니다. 선택 실파일 shard는 기본 audit에 포함되지 않습니다.
