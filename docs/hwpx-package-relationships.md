# HWPX 패키지 관계 검증

## 책임과 소유권

`package.inspectDocument`는 [ZIP·mimetype 경계](hwpx-zip-container.md) 뒤에서 `META-INF/container.xml`의 패키지 루트와 그 루트 OPF의 manifest·spine을 연결합니다. 반환 `Document`는 ZIP 엔트리 인덱스, 루트 경로, manifest 항목·spine 인덱스를 소유하지만 ZIP 입력 바이트는 빌립니다. 호출자는 `Document.deinit` 후에 원본 입력을 해제합니다. 두 XML 엔트리의 해제량은 단일 `max_total_xml_bytes` 한도에서 차감합니다. 이 단계는 문서 헤더·section XML의 의미를 해석하거나 BinData를 해제하지 않습니다.

`xml.document.visit`는 기존 XML 문법·DTD 거부·namespace 검사와 같은 순회에서 태그를 동기적으로 전달합니다. 호출 중에만 유효한 태그·scope를 `hwpx/xml_attributes.zig`가 URI/로컬명으로 대조하고, 속성 값은 공통 XML 값 iterator를 통해 UTF-8로 복사합니다. 주석/CDATA 문자열이나 다른 namespace의 같은 로컬명은 manifest 항목이 아닙니다. UTF-8·UTF-16LE XML을 같은 규칙으로 검사합니다. XML 파서를 HWPX에 복제하지 않습니다.

`container_manifest.zig`는 OCF namespace의 직접 `rootfiles/rootfile`에서 `application/hwpml-package+xml` 루트 하나를 찾고 ZIP 정확 경로를 요구합니다. 부가 rootfile의 누락은 보고서의 `missing_optional_roots`로 남깁니다. 실제 `rowbreak-problem-pages.hwpx`에는 선언한 `Preview/PrvText.txt`가 없으므로 이를 필수 패키지 루트와 같은 오류로 처리하지 않습니다.

`content_manifest.zig`는 OPF namespace의 직접 `manifest/item` 및 `spine/itemref`를 수집합니다. ID 중복·끊어진 idref·내장 항목의 안전하지 않은 href 또는 ZIP 항목 부재는 오류입니다. `isEmbeded`의 부재(null), 명시적 1, 명시적 0을 구분합니다. `0`의 외부 경로는 원문 UTF-8로 보존하고 파일·네트워크에 접근하지 않습니다. `linear`도 부재(null)와 yes/no를 구분합니다. 내장 href는 현재 확인된 HWPX의 ZIP 루트 기준 정확 이름으로 찾고 basename 재검색이나 실패 후 상대 경로 fallback을 하지 않습니다. 입력 원문·XML 자체는 별도로 보존해야 할 편집/쓰기 단계의 책임입니다.

[W3C OCF 구조](https://www.w3.org/TR/epub-33/#sec-container-metainf-container.xml)와 [패키지 manifest·spine 구조](https://www.w3.org/TR/epub-33/#sec-pkg-manifest)를 관계 검증의 참고로 삼되, EPUB의 모든 규칙을 HWPX에 자동 적용하지 않습니다. 예를 들어 실제 HWPX에는 DEFLATE된 `mimetype`이 있어 EPUB의 저장 방식 요구로 거부하지 않고 해제 바이트·CRC·정확한 MIME 값을 검사합니다. ZIP 레코드 정책은 [ZIP 주제](hwpx-zip-container.md)가 소유합니다.

## 실파일 경계와 미완료 범위

2026-09-23 읽기 전용 조사에서 기존 두 corpus의 `.hwpx` 484개 중 478개가 ZIP으로 열렸고 6개는 EOCD 부재로 ZIP 파서가 거부했습니다. 유효 478개 모두 `Contents/content.hpf`를 패키지 루트로 가리켰습니다. 정규식 기반 사전 조사는 내장 manifest href의 ZIP 이름 일치와 spine idref의 존재를 확인했으며, ZIP에 없는 href 네 개는 `isEmbeded="0"` 외부 이미지였습니다. 한 부가 rootfile은 누락됐습니다. 제품 Zig 패키지 관계 파서를 동일 484개에 적용한 결과도 478개 성공·6개 `MissingEndRecord`였으며, 이 수치는 파일의 모든 section/그림/렌더링 검증을 뜻하지 않습니다.

유효 478개에서 `mimetype`의 해제 문자열은 모두 `application/hwp+zip`이었지만 ZIP 방법은 저장 451개·DEFLATE 27개였습니다. 두 방법을 모두 허용해도 CRC와 정확한 해제 내용 검사에는 예외가 없습니다. 현재 corpus의 가장 큰 선언 비압축 엔트리는 29,175,070바이트였으며, HWPX 문서 진입 기본 ZIP 인덱스 한도 512MiB는 이 실측 필요량이 아니라 외부 문서까지 고려한 상한입니다. 실제 콘텐츠 해제에는 별도 소비 한도가 계속 필요합니다.

적대적 검증은 독립 소스 복사본의 Debug 모드에서 내장 href의 ZIP 존재 검사, 끊어진 spine ID 검사, 명시적 외부 링크 구분, 두 XML의 공유 바이트 차감을 각각 제거해 수행했습니다. 네 변이 모두 해당 HWPX 테스트에서 기대한 실패를 냈습니다. 뜻밖에 성공한 `inspectDocument` 결과도 테스트 도우미가 해제하므로 변이 실패를 누수 오류와 혼동하지 않습니다. 이 검증은 위 네 계약에 국한되며 section 내용의 정확성을 증명하지 않습니다.

최종 소스의 `zig test src/root.zig --test-filter HWPX`는 24/24, `zig build test --summary all`은 2046/2046 통과했습니다. `zig build audit --summary all`을 Debug·ReleaseSafe·ReleaseFast 순서로 실행해 모두 종료 코드 0을 확인했으며, ReleaseFast 출력의 전체 요약은 40/40 단계·2085/2085 테스트 통과였습니다. ReleaseSafe 제품 빌드와 `zig build compare -Doptimize=ReleaseSafe --summary all`(8/8 단계), `zig fmt --check build.zig src`, `git diff --check`, 변경 문서의 로컬 링크 검사도 통과했습니다. 전체 audit의 HWP5/WASM 검사를 새로운 HWPX section 의미 검증으로 계산하지 않습니다.

후속 [버전 XML 검증](hwpx-version.md)은 별도 진입점으로 구현했습니다. 남은 작업은 암호화 분류와 버전별 호환성, `Contents/header.xml`과 section 순서·실제 XML 노드/참조·BinData 리소스 연결, HWP5 공통 문서 모델, 편집·쓰기·공개 WASM/JS API입니다. manifest 관계 검증 통과를 전체 HWPX 문서 검증 완료로 표시하지 않습니다.
