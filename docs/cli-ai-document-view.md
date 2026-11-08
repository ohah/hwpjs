# AI 문서 읽기·편집 CLI

HWP5와 HWPX를 브라우저 없이 읽고, 문단의 지정 문자열을 바꿔 새 파일로 저장합니다. 읽기용 모델은 기존 Native SDK의 관측을 투영한 파생 값입니다. 편집·저장의 단일 출처는 열린 Native 문서이며, 읽기용 모델을 다시 직렬화해 원본을 만들지 않습니다.

## 읽기용 단순 모델

문서는 구역별 머리말 정의·본문·꼬리말 정의로 나눕니다. 각 영역은 문단, 표, 이미지, 알 수 없는 개체를 포함합니다. 표에는 관측된 셀과 셀 내부 블록만 둡니다. 이미지에는 존재·원문 식별자·관측된 크기 등을 표시하며 이미지 내용의 OCR은 수행하지 않습니다.

예시 구조는 다음과 같습니다. `--view structure`는 `Paragraph`, `Table`, `Image` 등의 레이블과 원문 식별자를 출력합니다. 기본 `content`는 같은 모델에서 문서 본문만 표시합니다.

```text
구역 0
  머리말: 문단 “사업 계획서”
  본문
    문단 s0:p3: “다음과 같이 계획한다.”
    표: 2행 2열
      셀 (0, 0): 문단 “항목”
      셀 (0, 1): 문단 “금액”
    이미지: 원문 식별자와 관측된 크기
  꼬리말: 문단 “담당 부서”
```

물리 페이지마다 머리말을 복제하거나 이전 구역에서의 상속·적용 페이지 범위를 추측하지 않습니다. 직접 관측한 정의와 상속·범위의 미확정 상태를 구분합니다. 소속을 확정하지 못한 항목은 `unplaced`, 읽지 못한 항목은 진단을 가진 `unknown`으로 남깁니다. 관측 불가는 빈 문서·빈 셀·개체 없음과 다릅니다.

문단에는 읽기용 `displayText`와 원문 식별자를 둡니다. 편집용 원문 `text` 복사본은 모델에 보관하지 않습니다. HWP5의 인라인 컨트롤 바이트를 문자로 잘못 표시하지 않도록 표시 텍스트만 출력합니다. 미관측 값은 `null`, 관측된 빈 문자열은 `''`로 구별하며 원문으로 대체하지 않습니다. 실제 수정할 때만 Native에서 대상 문단의 원문·편집 좌표·보호 상태를 조회합니다. 이 모델은 공개 JSON 변환 API가 아닙니다.

HWP5의 `textPresent`는 원본 `PARA_TEXT` 레코드의 존재 여부이며 표시 텍스트의 관측 성공 여부가 아닙니다. 원본 노드와 빈 표시 문자열이 관측되고, 선언 길이가 0 또는 1이며 토큰이 없는 문단은 레코드가 없어도 빈 문단으로 표시합니다. 미리보기 누락, 원본 위치 불일치, 길이·토큰과 모순되는 관측은 계속 미확정으로 남깁니다. 원본의 레코드 부재나 저장 모델은 바꾸지 않습니다. 실제 Noori의 본문 세 문단과 표의 빈 셀 한 문단은 원본 HTML의 빈 줄·빈 셀 및 대응 HWPX와 대조했습니다. 공식 HWP5 명세 §4.3.1~2는 길이 1에서 텍스트 레코드가 생략되는 경우를 명확히 설명하지 않으므로, 이 처리를 모든 레코드 부재의 정상 판정으로 확대하지 않습니다.

## 실행

저장소에서는 WASM 파일을 명시합니다. 문서 JSON 출력은 제공하지 않습니다.

```sh
bun run cli read ./document.hwp --wasm /absolute/path/hwpjs.wasm
bun run cli read ./document.hwpx --format markdown --wasm /absolute/path/hwpjs.wasm
bun run cli read ./document.hwpx --view structure --wasm /absolute/path/hwpjs.wasm
```

기본 `view`는 `content`, 기본 `format`은 `text`입니다. 성공한 단일 읽기는 관측한 문서 본문만 stdout으로 전달하며 `format`·`documentSHA256` 접두사와 문단 편집용 ID를 붙이지 않습니다. 관측 개체의 논리 참조는 본문에 포함될 수 있습니다. `--view structure`에서 기존 구조 레이블·원문 ID·SHA·진단 상세를 조회합니다. `markdown`은 두 보기에서 선택 가능한 출력 형식이며, HTML·원본 조판 전체 변환·페이지 위치 재현·OCR은 범위에 포함하지 않습니다.

본문을 파일로 받는 것은 일반 셸 리다이렉션입니다. 읽기 `--output` 옵션, stdin 입력, URI fetch를 추가하지 않습니다.

```sh
hwpjs read ./문서.hwp --format markdown > ./문서.md
```

공개 패키지 후보를 빌드·설치하면 `@ohah/hwpjs`의 `hwpjs` 실행 파일을 사용합니다. 기본 WASM은 실행 파일과 나란한 `dist/hwpjs.wasm`입니다. 별도 CLI npm 패키지나 `/core` 설치 경로를 추가하지 않습니다. 현재 npm 공개 여부와 로컬 빌드 검증은 별개입니다.

## 개체 논리 참조와 후속 조회

읽기 모델의 관측 개체에는 `reference`를 노출할 수 있습니다. 공통 `object-reference.mjs`의 `buildObjectReference`·`parseObjectReference`·`canonicalImageId`를 단일 출처로 사용하며 호스트나 웹에서 별도 참조 문법을 만들지 않습니다.

```text
hwpjs-object:<SHA>/<hwp5|hwpx>/s<section>/<kind>/<node>
```

이 값은 HTTP·파일 링크나 MCP resources URI가 아닌 도구 인수입니다. Markdown 이미지는 `![이미지 N](참조)`, 텍스트 이미지는 `[이미지 N: 참조]`로 표시하고 관측된 대체 설명을 함께 유지합니다. 표는 짧은 참조와 셀 내용을 보존합니다. `N`은 출력 순회 표시 순번이며 canonical 이미지 추출 ID가 아닙니다. 차트·수식·도형·OLE 등의 참조도 실제 관측 종류에만 부여하며 미확정 위치·종류에는 가짜 참조를 만들지 않습니다.

실제 그림이 관측됐지만 추출 inventory와 연결되는 참조를 확인하지 못하면 `[이미지: 추출 참조 확인 불가]`로 표시합니다. 이는 그림이 없다는 뜻이 아니며, 가짜 조회 URI를 만들지 않습니다.

CLI는 `object INPUT --ref REF --format text|markdown`, MCP는 `get_document_object(inputPath, reference, format?)`로 연결합니다. inspector는 원문 SHA·실제 형식·종류·inventory 멤버를 확인한 뒤 관측 메타데이터·내용·사유를 텍스트로 반환합니다. JS 반환 객체는 `status: available|unavailable` 필드를 가지며 CLI/MCP는 그 객체의 `text`를 출력합니다. 표시 줄은 `상태: available`·`상태: unavailable`이며 별도 MCP 상태 필드와 구분합니다. 이를 완전한 렌더링이나 파일 추출 성공으로 확대하지 않습니다. 이미지 조회에서 바이트를 디코딩하지 않습니다. HWP5의 전용 차트·수식 source API 미노출은 미분류·참조 미확정으로 표시하며 전수 열거 완료로 간주하지 않습니다.

이미지 참조는 CLI `extract-images INPUT --ref REF --output NEWDIR` 또는 MCP `extract_document_image(inputPath, outputPath, reference)`로 별도 추출합니다. 기존 `id`·`expectedSha256` 선택 방식도 유지하지만 참조 방식과 혼용하지 않습니다. 두 방식 모두 같은 원본 스냅샷·이미지 inventory 검증·예산·신규 출력 보호를 적용합니다. 결과는 호스트의 새 파일 경로·SHA이며 자동 OCR이나 MCP 이미지 Content가 아닙니다.

웹 실습은 공통 renderer의 참조가 포함된 본문을 텍스트로 표시합니다. 별도 URL 처리기·이미지 자동 로드·조회/추출 버튼을 추가하지 않으며 실제 로컬 CLI/MCP 인수로 복사하도록 안내합니다. 실습 응답은 참조와 내용을 그대로 유지하고 오래된 SHA의 참조는 정상 본문으로 만들지 않습니다. 이 전송 경계의 주입형 검사는 실제 inventory·CLI/MCP 설치·이미지 추출·공개 브라우저 검증과 분리합니다. 과거 기본 본문 3,741바이트·동일 SHA 기록은 개체 참조를 추가하기 전 코호트이며, 형식별 참조가 포함된 새 출력의 바이트 동일성을 주장하지 않습니다.

## 편집

먼저 `read --view structure` 결과의 `documentSHA256`과 문단 식별자를 확인합니다. 아래 식별자와 해시는 예시이며 대상 파일의 출력값으로 바꿉니다.

```sh
bun run cli edit ./document.hwpx \
  --target s0:p3 --replace '기존 내용' --with '수정 내용' \
  --expect-sha256 <read에서_출력된_64자리_SHA256> \
  --output ./document-edited.hwpx --wasm /absolute/path/hwpjs.wasm
```

식별자는 HWP5에서는 0부터 시작하는 구역 내 문단 번호, HWPX에서는 1부터 시작하는 문서 전체 문단 번호입니다. 화면상의 순서로 번호를 새로 만들지 않습니다. 해당 원문 해시의 스냅샷에만 유효하며 편집 후에는 새 파일을 읽어 결과를 확인하고, 다음 편집용 ID·SHA는 새 파일의 구조 보기에서 얻습니다.

현재 편집은 한 문단 안에서 정확히 한 번 발견되는 리터럴 문자열 교체·삭제입니다. 정규식·문단 삽입·표 구조 변경·이미지 교체·일괄 변경은 제공하지 않습니다. 겹치는 중복 일치도 모호한 대상으로 거부합니다. `--with ''`는 삭제이며 개행·제어 문자와 잘못된 Unicode는 거부합니다. Native 보호·편집 가능 범위 검사도 통과해야 합니다. 읽기에 표시되는 모든 문단이 편집 가능하다는 의미는 아닙니다.

HWP5 저장이 재조판을 요구하면 기본적으로 실패합니다. 원본의 저장된 줄 배치가 무효화되는 것을 수용하는 경우에만 `--allow-stale-layout`을 명시합니다. 이 옵션은 새 조판 결과를 생성하지 않습니다.

입력 원본과 기존 출력 파일은 덮어쓰지 않습니다. 출력은 같은 포맷의 새 경로로만 저장하고 임시 파일의 쓰기·동기화 뒤 덮어쓰기 없는 게시를 수행합니다. 게시 이후 출력 스트림에 오류가 나도 파일은 이미 저장됐을 수 있으므로 `published` 진단을 확인합니다. 문서는 입출력 각각 64MiB, WASM 입력은 32MiB까지 허용합니다.

## 책임 분리와 검증

`packages/cli/src/arguments.mjs`는 명령 계약, `files.mjs`는 파일 스냅샷·신규 출력, `engine.mjs`는 Native 수명·편집·저장을 소유합니다. `document-model.mjs`와 `model/`은 관측·소유권 투영, `render.mjs`는 content·structure 읽기 출력을 소유하며 두 보기가 모델 검증과 출력 예산을 공유합니다. `main.mjs`는 이 경계를 연결하고 `bin.mjs`만 실행 시점을 소유합니다.

소유권 투영은 Map·Set과 메모이제이션으로 관측 노드·관계 수에 비례해 처리하고, 표의 행×열 크기만큼 빈 셀을 만들지 않습니다. 문자열 일치는 KMP로 원문과 검색어 길이에 비례합니다. Native 파싱·저장 전체의 복잡도나 시각적 레이아웃까지 이 보장이 확장되는 것은 아닙니다. 모델 깊이·노드 수·텍스트와 출력 길이에도 제한을 둡니다.

집중 단위 검사는 `packages/cli/tests/`에 있습니다. 실제 파일 CLI 검사는 `tools/tests/cli-document-e2e.test.mjs`에서 명시한 WASM·Noori·머리말/꼬리말 픽스쳐를 고정해 별도 실행합니다. 조작된 모형 검사, 실제 Native 읽기, CLI 프로세스 실행, 독립 CFB/XML 저장 검증, 패키지 실행 검증은 서로 다른 증거로 기록합니다.

## 본문 반환과 편집 구조의 분리

CLI·MCP·공개 실습은 같은 `renderDocument(model, { format, view })`를 사용합니다. 단건 읽기 응답은 `read-operation.mjs`의 순수 `renderReadResponse`로 조립해 content의 본문 그대로 반환과 structure의 형식·SHA 접두사를 공유합니다. 기본 content는 관측 본문을 제공하고, 명시한 structure는 편집에 필요한 식별자와 진단을 제공합니다. 파서·Native·편집 원본은 이 출력 선택으로 바뀌지 않습니다. MCP는 기존 `read_document`·`read_documents`에 `view`를 전달하며 이후 추가된 `get_document_object`를 포함해 현재 도구는 7개입니다. 단건 content의 오류는 CLI 진단이나 MCP 오류 응답으로 분리하고, 배치의 부분 실패는 성공 본문과 함께 유지합니다.

주된 참고는 [MarkItDown MCP 공식 구현](https://github.com/microsoft/markitdown/blob/main/packages/markitdown-mcp/src/markitdown_mcp/__main__.py)입니다. 문서 변환 결과의 Markdown을 직접 반환하고 변환 실패를 `ToolError`로 분리합니다. [공식 CLI](https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/__main__.py)는 본문을 stdout으로 출력합니다. [DOCX 변환기](https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_docx_converter.py)는 mammoth의 HTML 결과를 공통 HTML 변환기에 전달하고, [XLSX 변환기](https://github.com/microsoft/markitdown/blob/main/packages/markitdown/src/markitdown/converters/_xlsx_converter.py)는 시트별 표를 같은 출력 경로로 처리합니다. 여기서는 공통 출력 경로를 공유하는 책임 분리만 참고하며 외부 코드·Python 의존성을 도입하지 않습니다.

보조 참고인 [Docling MCP](https://github.com/docling-project/docling-mcp/blob/main/docling_mcp/tools/generation.py)는 저장된 문서의 Markdown 내보내기를 별도 도구로 제공하고, [Pandoc 사용 설명서](https://pandoc.org/MANUAL.html#using-pandoc)는 기본 stdout 출력을 설명합니다. 이들의 도구 이름이나 URI·OCR·cloud 기능을 추가하는 범위는 아닙니다.

본문·배치 파일명·오류 메시지를 표시할 때의 안전한 escape는 공통 모듈을 단일 출처로 사용합니다. 원문에 적힌 Markdown·HTML·표 문법이 출력 구조로 잘못 해석되지 않도록 표시하며, 원본 문자열과 Native 편집 좌표를 바꾸거나 구조 레이블처럼 생긴 문장을 삭제하지 않습니다.

공개 실습은 기본 문서 내용과 편집 구조 선택을 구분하고 구조 보기를 읽었을 때만 편집용 SHA·대상 폼을 표시합니다. 응답 예시의 content도 본문만 사용하며, 구조 응답에만 형식·SHA 접두사를 붙입니다. 내부 스냅샷의 원문 ID·SHA와 Native 편집 검증은 그대로 유지합니다. 기존 공개 브라우저 증거는 이전 구조 기본값의 검증으로 보존하고, 새 보기의 실제 공개 실행은 배포 후 별도 확인합니다.

실습 전송 경계의 소스 검사에서 기본 content 응답과 본문의 일치, structure의 ID·SHA 접두사, 보기 전환 시 내부 원본 결속, 알 수 없는 보기의 사전 거부를 확인했습니다. 원문에 `Paragraph`나 `documentSHA256:` 같은 문자열이 있어도 삭제하지 않습니다. 이 검사는 주입형 엔진을 사용하는 소스 검사이며 새 패키지의 실물 CLI/MCP나 배포 후 브라우저 검증을 대신하지 않습니다.

## 2026-11-08 본문 출력 검증

본문 보기에서는 문단의 내용을 직접 출력하고, 표의 위치·범위와 전체 셀 배치가 확인된 경우 Markdown 표나 탭으로 구분한 행을 만듭니다. Markdown의 빈 헤더는 표 문법이며 원문의 첫 행을 제목으로 추정한 것이 아닙니다. 허용한 크기·밀도 안의 병합 표는 내용을 한 번만 출력하고 확인된 병합 범위만 빈 칸으로 표현합니다. 큰 병합 표·희소 배치·중첩 등은 관측된 내용을 원문 순서로 표시하고 배치가 단순화됐음을 알립니다. 미관측 셀을 빈 셀로 만들어내거나 모델에 없는 제목·목록 스타일을 추정하지 않습니다.

파일명·오류 메시지의 HTML 문자와 Unicode 제어문자 표시를 공통 이스케이프 정책으로 보완했습니다. 단독 `-`·`+`·`1.`·`1)` 같은 원문이 빈 Markdown 목록으로 바뀌지 않도록 보호합니다. 이는 [CommonMark의 빈 목록 항목 규칙](https://spec.commonmark.org/0.31.2/#example-281)과 대조한 표시 수정이며 원본 문자열·편집 좌표는 바꾸지 않습니다. 정상적인 구조 보기와 본문에 실제로 적힌 `Paragraph`·`Cell`·식별자 형태의 문자열도 유지합니다.

기준 커밋과 명시한 변경만 사용한 격리 패키지에서 Noori와 머리말·꼬리말 예제 네 파일의 본문·구조 보기, 텍스트·Markdown 읽기 및 두 형식의 편집·독립 CFB/XML 저장·재열기를 포함한 CLI 검사 19개가 통과했습니다. 공식 SDK의 실제 stdio 클라이언트로 MCP 읽기·편집·재열기와 배치의 부분 실패도 확인했습니다. 새 출력기의 집중 검사와 주입형 전송 검사는 실제 Native·패키지 검사와 별도 증거로 보존합니다. 원본 픽스처와 기존 WASM·Worker는 변경하지 않았습니다.

이 Noori 쌍의 기본 텍스트 본문은 각각 3,741바이트이며 SHA256과 바이트가 모두 동일했습니다. 이전 구조 기본값의 출력은 HWP5 10,684바이트, HWPX 10,309바이트였습니다. 이는 같은 원본·Native 엔진의 출력량 비교이며 속도 측정이나 모든 HWP5·HWPX의 의미 동치·조판 일치를 뜻하지 않습니다. 공개 실습의 실제 브라우저 검증은 로컬 패키지 결과와 구분합니다.

## 2026-11-07 검증 기록

Node.js 24.20.0과 고정 WASM `82031994…`를 사용했습니다. 소스 통합 검사 107개가 통과했고 실패·생략은 없습니다. 패키지 번들에 같은 실제 파일 E2E 11개를 별도 실행해 통과했습니다. E2E는 Noori HWP/HWPX와 headerfooter HWP/HWPX 네 원본을 해시로 고정하고 텍스트·Markdown 읽기, 문단 ID의 중복 없는 배치, 교체·재열기, 모호한 일치·원문 해시 불일치·기존 출력 경로의 거부를 확인합니다.

HWP5 저장은 독립 CFB 레코드 비교기로 대상 문단과 무관한 스트림·서식 보존을 검사했습니다. HWPX 저장은 Python 일반 실행과 `-O` 각각에서 독립 ZIP/XML 비교를 통과했습니다. 각 비교기는 잘못된 기대값을 거부하는 음성 검사도 포함합니다. 이는 해당 편집·픽스쳐에 대한 검증이며 모든 HWP 문서의 무손실 저장 보장은 아닙니다.

별도 HEAD 기반 소스에 이 CLI 변경만 얹어 공개 패키지 후보를 빌드하고 `npm pack`을 검사했습니다. 생성된 `cli.mjs`는 499,121바이트이며 WASM은 패키지 내 한 벌만 포함합니다. 별도 소비자에 tarball을 설치한 뒤 실제 npm bin 심볼릭 링크·다른 작업 디렉터리·기본 인접 WASM·명시 상대 WASM 경로·WASM 누락 시 도움말과 읽기 오류를 확인했습니다. Node/Bun 읽기와 Bun의 두 포맷 수정 후 Node 재열기를 포함한 11개 실행 시나리오를 통과했습니다. npm 공개와 React Native 기기 검증은 수행하지 않았습니다.

적대적 대조에서 확인한 표 inventory 조회 실패의 잘못된 완료 표시, 잘못된 HWPX snapshot을 빈 문서로 취급하던 문제, 읽기에 불필요한 문단별 편집 원문 조회를 수정했습니다. 미확정 소유권·희소 표·중첩 순환·깊이 제한·누락/빈 표시 텍스트·출력 충돌·쓰기 실패·스트림 오류는 집중 반례로 검증합니다. 초기 소스/이전 계약 검사와 최종 표시 전용 모델의 검사 결과는 구분해 보존했습니다.

재현 명령은 [개발·검증 명령](development-commands.md)을 따릅니다. 세부 영수증은 `zig-out/verification/cli-ai-r1/`에 있으며 저장소에 커밋하지 않습니다. 빌드 환경의 React Native 타입 의존성 누락은 별도 의존성을 갖춘 검증 환경에서 해결했고, Native 엔진은 새로 빌드하지 않았습니다.

## 읽기·편집 경계의 수정 결과

`c22751845` 이후 다음 경계 오류를 수정했습니다.

- **모델의 원문 연결:** 같은 셀 목록에 충돌하는 셀 식별자, 여러 표가 공유하는 목록 식별자, 중복된 문단 원문 노드는 모호한 연결을 만들지 않고 거부합니다. 중복 HWP5 미리보기 구역도 마지막 항목으로 덮어쓰지 않습니다. 문단 수 조회가 실패하더라도 이미 관측된 흐름의 식별자는 남기고 표시 텍스트를 미확정으로 처리합니다. 비정상 SDK 관측을 주입해 확인한 경계이며 실제 Noori에서 이런 모순이 관측됐다는 뜻은 아닙니다.
- **편집 대상과 저장:** 비동기 열기 전에 대상 좌표를 복사해 호출자의 객체 변경에 영향을 받지 않습니다. 동일 문자열 교체도 Native 범위 검증을 통과해야 하며, 유효한 동일 문자열 교체는 이력·저장 바이트를 유지합니다. 빈 저장 결과는 거부합니다.
- **진단 문자열:** 잘린 메시지에 남은 고립 surrogate를 눈에 보이는 escape로 출력합니다. 이 진단 때문에 정상 문서 읽기 전체가 `InvalidRenderedDocument`로 실패하던 문제를 막습니다.
- **파일 호스트:** 임시 파일 충돌·게시 전후 오류·출력 충돌의 추가 반례에서 기존 거부·원본 보존 동작을 확인했습니다. 이 경계에는 새 제품 수정이 필요하지 않았습니다.

수정 후 소스 통합 검사는 **144개 통과, 실패·생략 0개**입니다. 기준 커밋에 CLI 변경만 얹어 만든 실제 설치 패키지에서도 네 픽스쳐 E2E **11개**, Node/Bun 설치 실행 시나리오 **11개**가 각각 통과했습니다. 독립 CFB/XML 저장 비교와 잘못된 기대값 거부를 다시 확인했습니다. 이전 패키지의 102개 산출물과 비교하면 `cli.mjs`만 달라졌고 Worker·WASM·나머지 SDK 파일은 동일했습니다.

깊은 소유권·희소 표와 입력/출력 버퍼 별칭도 대조했습니다. 명령 처리와 모델 투영은 기존 SSOT 경계를 유지하며 새 Native 구현이나 문서 JSON 출력은 추가하지 않았습니다. 세부 증거는 `zig-out/verification/cli-ai-adversarial-r1/`에 보존합니다. 위 경계와 네 실제 픽스쳐를 확인한 결과이며 모든 문서·모든 편집 기능의 완성을 의미하지 않습니다.
