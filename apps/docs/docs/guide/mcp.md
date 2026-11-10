# MCP로 문서 도구 연결

MCP 클라이언트에 로컬 stdio 서버를 연결하면 HWP5/HWPX 읽기·문서/개체 조회·그림 추출과 문단 편집, 명시 변경 묶음·새 문서·text-only 변환·로컬 OCR을 사용할 수 있습니다. 서버는 공통 CLI의 파일·SHA·네이티브 검증을 호출하며 별도 문서 파서를 두지 않습니다.

## 서버 준비와 설치 상태

CLI와 MCP는 단일 `@ohah/hwpjs` 패키지로 제공합니다. Node.js 24.20.0 이상이 필요하며 WASM은 패키지에 포함됩니다.

```bash
npx -y @ohah/hwpjs mcp
```

MCP 클라이언트에는 다음 실행 설정을 등록합니다. 이 객체를 넣는 위치와 작업 디렉터리 지정 방법은 클라이언트마다 다릅니다.

```json
{
  "command": "npx",
  "args": ["-y", "@ohah/hwpjs", "mcp"]
}
```

`-y`(`--yes`)는 최초 다운로드 확인 질문 때문에 MCP 연결이 대기하지 않도록 합니다. 첫 실행에는 패키지를 내려받을 네트워크 연결이 필요합니다.

같은 패키지의 기존 `hwpjs-mcp` 실행 파일도 호환 대안으로 유지합니다. 패키지 이름과 실행 파일 이름이 다르므로 `--package`를 명시합니다.

```bash
npx -y --package=@ohah/hwpjs hwpjs-mcp
```

`--wasm /absolute/path/to/hwpjs.wasm`은 자체 빌드한 엔진으로 교체할 때만 지정합니다. 일반 사용에는 패키지에 포함된 WASM을 사용합니다. [CLI 설치 안내](./cli.md#공개-npm-설치)도 참고하세요.

`@ohah/hwpjs@0.1.1`은 통합 진입점과 16개 도구, 새 Native 엔진을 포함합니다. 이전 0.1.0은 12개 도구이며 통합 `hwpjs mcp` 진입점이 없습니다. 이전 npm 패키지나 Skill 설치분은 자동 갱신되지 않으므로 설치 버전과 `tools/list`를 확인하세요. OCR에는 별도 로컬 제공자가 필요합니다.

서버 실행 파일과 나란한 WASM이 기본값입니다. stdout은 MCP 프로토콜 전용이며 서버 진단은 stderr로 전달됩니다. 도구 실행의 실패 내용은 응답의 text content에도 포함됩니다. 서버의 작업 디렉터리가 상대 문서 경로의 기준입니다. 실제 경로와 클라이언트의 권한 범위는 사용자가 설정합니다.

클라이언트가 설치 프로젝트와 다른 작업 디렉터리에서 서버를 시작한다면, 설치된 JS 진입점의 절대경로를 사용할 수 있습니다. 설정의 바깥 구조와 작업 디렉터리 지정 방법은 클라이언트에 맞춥니다.

```json
{
  "command": "node",
  "args": ["/absolute/path/to/project/node_modules/@ohah/hwpjs/dist/mcp.mjs"]
}
```

자체 CLI·서버·WASM을 포함한 [Skill](./skill.md)을 설치했다면 해당 Skill의 실제 절대경로로 실행할 수도 있습니다.

```json
{
  "command": "node",
  "args": ["/absolute/path/to/hwpjs/scripts/hwpjs.mjs", "mcp"]
}
```

이 객체를 등록하는 위치와 서버 설정의 바깥 구조는 MCP 클라이언트마다 다릅니다. 문서 페이지나 브라우저 체험이 사용자의 클라이언트 설정을 변경하지는 않습니다. 설치된 Skill이 어느 도구 세대인지도 함께 확인하세요.

## 공개 npm 0.1.0의 제공 도구

| 도구                     | 입력                                                                                                        | 결과                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `read_document`          | `inputPath`, 선택적 `format`: `text` 또는 `markdown`, `view`: `content` 또는 `structure`                    | 기본 본문과 개체 참조, `structure`는 편집 ID·SHA·상세                            |
| `read_documents`         | `inputPaths`, 선택적 `format`, `view`, `concurrency`, `maxOutputBytes`                                      | 입력 순서의 문서 내용 또는 편집 구조와 파일별 실패                               |
| `edit_document`          | `inputPath`, `outputPath`, `target`, `expectedSha256`, `findText`, `replacement`, 선택적 `allowStaleLayout` | 새 문서 경로·SHA·변경 및 줄 배치 상태를 담은 text content                        |
| `get_document_info`      | `inputPath`, 선택적 `expectedSha256`                                                                        | 포맷·SHA·크기·구역 수와 관측 가능한 메타데이터                                   |
| `list_document_images`   | `inputPath`, 선택적 `expectedSha256`                                                                        | 원문 SHA와 그림 ID·상태·MIME·확장자·바이트 수·제한된 관측 범위                   |
| `extract_document_image` | `inputPath`, `outputPath`, `reference` 또는 `id`와 `expectedSha256`                                         | 새 이미지 **파일** 경로·SHA 또는 실패 및 게시 영수증                             |
| `get_document_object`    | `inputPath`, `reference`, 선택적 `format`: `text` 또는 `markdown`                                           | 관측 개체 정보·내용·미지원 사유, `상태: available` 또는 `상태: unavailable` 표시 |
| `get_document_paragraph` | `inputPath`, `target`, 선택적 `expectedSha256`, `format`                                                    | 선택한 Native 원문을 ASCII JSON과 UTF-16 길이로 조회                             |
| `apply_document_changes` | `inputPath`, `outputPath`, `expectedSha256`, `operations`, 선택적 `allowStaleLayout`                        | 명시한 지원 작업을 적용해 새 파일 게시                                           |
| `create_document`        | `outputPath`, `format`: `hwp5` 또는 `hwpx`, 선택적 `text`, `allowStaleLayout`                               | Native 새 문서와 초기 본문 저장                                                  |
| `convert_document`       | `inputPath`, `outputPath`, `to`, 선택적 `expectedSha256`, `lossPolicy`, `allowStaleLayout`                  | 명시 text-only 변환의 새 파일·미보존 보고 또는 기본 거부                         |
| `ocr_document`           | `inputPath`, 선택적 `reference`, `provider`, `languages`, `executable`, `format`                            | 로컬 그림 인식 텍스트·이미지별 상태·실패 사유                                    |

`format` 기본값은 `text`, 읽기 `view` 기본값은 `content`, `allowStaleLayout` 기본값은 `false`입니다. 도구에서 CLI 실행이 실패하면 `isError: true`와 text content가 포함됩니다. `apply_document_changes`의 지원 작업은 [CLI의 명시 작업 계약](./cli.md#문단-원문-조회와-명시-작업-적용)을 따릅니다. 공개 npm 0.1.0에는 표 전체 삭제와 이미지 삽입·교체가 없습니다. 의미 HTML 내보내기도 공개 npm 0.1.0에는 없습니다. 0.1.1의 16도구 중 추가 도구는 아래에서 별도로 구분합니다. 이 도구들은 문서 전체 JSON 객체를 반환하는 변환 API가 아닙니다. 프로토콜 JSON과 사용자가 읽는 논리 뷰는 구분합니다.

문서 정보에서 확인하지 못한 버전·보안·편집 상태·내용 집계는 `unknown`과 사유로 남습니다. 특정 편집의 허용 여부나 서명 유효성을 정보 조회만으로 판단하지 않습니다.

### 읽기 요청 예시

연결·초기화된 세션에서의 `tools/call` 메시지 예시입니다. 임의의 stdin 한 줄만으로 초기화된 세션을 대체하거나 HTTP API를 제공한다는 뜻은 아닙니다.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_document",
    "arguments": { "inputPath": "./document.hwpx", "format": "text" }
  }
}
```

기본 `view: "content"`는 관측한 문서 본문만 text content로 반환하며 `format`·`documentSHA256` 접두사나 문단 편집용 ID를 붙이지 않습니다. 이미지·표 등 관측된 개체의 논리 참조는 본문에 포함될 수 있습니다. `markdown`도 이 본문 보기의 출력 형식이며 HTML·원본 조판 전체 변환이나 OCR을 뜻하지 않습니다. 오류는 `isError: true`의 별도 오류 응답으로 확인합니다.

편집할 대상의 원문 ID·SHA와 진단 상세는 같은 `read_document`에 `view: "structure"`를 명시해 조회합니다. 읽기 보기는 기존 도구를 사용합니다. 공개 npm 0.1.0은 총 12도구입니다. 0.1.1의 16도구 목록과 구분합니다.

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "read_document",
    "arguments": { "inputPath": "./document.hwpx", "view": "structure" }
  }
}
```

두 보기는 공통 관측 모델·renderer를 사용합니다. 갱신된 서버가 필요한 옵션이므로 기존 설치분은 `tools/list`의 입력 스키마에서 확인하세요.

### 여러 명시 파일 읽기

`read_documents`는 `0.1.0`에 포함된 여러 명시 파일의 읽기 전용 도구입니다. 아래의 기본 `content`와 선택적 `structure` 보기 계약을 사용합니다. 이전 설치분은 갱신한 뒤 `tools/list`에서 제공 여부를 확인하세요. 현재 공개 브라우저 체험의 단일 문서 실행 증거는 이 배치 도구를 포함하지 않습니다.

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "read_documents",
    "arguments": {
      "inputPaths": ["./one.hwp", "./two.hwpx"],
      "format": "text",
      "view": "content",
      "concurrency": 1,
      "maxOutputBytes": 4194304
    }
  }
}
```

`inputPaths`는 명시 파일 1~128개의 목록입니다. `format`은 기본 `text` 또는 `markdown`, `concurrency`는 기본 1·최대 2입니다. 폴더 자동 탐색·자동 쓰기·일괄 편집·이미지 추출·HTML 전용 변환은 수행하지 않습니다.

응답은 기본 `content`에서 입력 순서의 파일 출처·본문과 읽기 실패, 성공·실패 개수를 제공합니다. `view: "structure"`는 기존 기계 키·원문 SHA·ID와 진단 상세를 제공합니다. 일부 실패 시 `isError: true`여도 성공한 문서 본문을 함께 유지하므로 전체 결과를 버리지 않습니다. 문서 전체 JSON 변환 결과를 반환하지 않습니다.

`maxOutputBytes`는 UTF-8 보고서 예산으로 기본 4 MiB(`4194304`), 상한 16 MiB(`16777216`)입니다. 전체 메모리나 MCP 프로토콜 프레임의 상한이 아닙니다. 본문을 절단하지 않으며, 예산을 넘는 항목은 실패로 보고하고 보고 공간 자체가 부족하면 요청을 거부할 수 있습니다. 제한과 stdout 부분 전달 오류의 의미는 [CLI 배치 읽기](./cli.md#여러-명시-파일-읽기)와 같습니다.

### 수정 요청 예시

`target`과 `expectedSha256`은 `read_document`의 `view: "structure"`에서 얻은 같은 원본의 실제 값으로 바꿉니다. 아래 SHA는 형식 설명용 자리표시자입니다.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "edit_document",
    "arguments": {
      "inputPath": "./document.hwpx",
      "outputPath": "./document-edited.hwpx",
      "target": "s0:p3",
      "expectedSha256": "READ_RESULT_DOCUMENT_SHA256",
      "findText": "기존 내용",
      "replacement": "수정 내용",
      "allowStaleLayout": false
    }
  }
}
```

기존 파일 덮어쓰기·모호한 일치·잘못된 원문 SHA는 CLI와 동일하게 거부합니다. `replacement`를 빈 문자열로 지정하면 유일한 일치를 삭제합니다. HWP5의 줄 배치 무효화 허용은 저장된 배치 무효화를 수용하는 선택이며 새 배치를 생성하지 않습니다.

### Native 문단 원문과 작업 묶음

`get_document_paragraph`는 structure에서 얻은 `target`과 선택적 원본 SHA로 정확한 문단을 조회합니다. `nativeTextUnits`는 Native UTF-16 길이이며 `expectedText (JSON ASCII)`의 JSON 문자열을 해석하면 CR·컨트롤까지 보존한 실제 원문을 얻습니다. 이 값을 apply의 원문 사전조건에 사용하고 표시 텍스트와 혼동하지 않습니다.

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "get_document_paragraph",
    "arguments": { "inputPath": "./document.hwpx", "target": "s0:p3", "format": "text" }
  }
}
```

예시 ID는 실제 구조 보기의 값으로 바꿉니다. `apply_document_changes`에는 같은 원본의 `expectedSha256`, 새 `outputPath`, 명시 `operations` 배열을 전달합니다. 모든 작업의 `coordinates`는 `current-transaction`이어야 하며 뒤 작업은 직전 작업 이후의 실제 좌표입니다. 전체 스키마를 사전 검증하고 Native `expectedText`·`expectedRangeText` 조건을 확인한 뒤 한 번 저장합니다. 마지막 작업 실패 시 앞 변경만 적용한 문서를 게시하지 않습니다.

지원 작업과 실제 patch 예시는 [CLI 명시 작업 적용](./cli.md#문단-원문-조회와-명시-작업-적용)을 따릅니다. 임의 SDK 호출이나 모든 표/그림 편집을 제공하지 않습니다. HWP5 줄 배치 무효화는 사용자가 `allowStaleLayout: true`를 명시한 경우에만 허용하며 새 조판을 생성하지 않습니다.

### 새 문서와 text-only 변환

`create_document`는 Native 빈 문서를 만들고 선택한 초기 본문을 저장합니다. 기존 입력 파일은 없으며 형식과 새 출력이 필수입니다.

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "create_document",
    "arguments": {
      "outputPath": "./created-new.hwpx",
      "format": "hwpx",
      "text": "첫 문단\n\n마지막 문단"
    }
  }
}
```

`convert_document`의 기본 `lossPolicy: "reject"`는 미구현 전체 보존 변환을 거부하며 새 파일을 만들지 않습니다. 사용자가 본문만 이관하는 손실을 선택한 경우 `text-only`를 명시합니다.

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "convert_document",
    "arguments": {
      "inputPath": "./document.hwp",
      "outputPath": "./converted-new.hwpx",
      "to": "hwpx",
      "lossPolicy": "text-only"
    }
  }
}
```

본문 문단·빈 문단·Unicode를 새 문서로 생성하지만 표는 관측 셀 본문으로 평탄화합니다. 표 구조·서식·그림·차트·수식·OLE·머리말/꼬리말·페이지/구역 설정·메타데이터는 보존하지 않습니다. 손실 보고를 확인하며 기본 거부를 text-only로 자동 재시도하지 않습니다. 원본은 유지하고 신규 출력만 게시합니다. 같은 형식 요청과 미관측·미배치 본문은 거부하며 HTML/PDF·완전 조판·무손실 변환으로 안내하지 않습니다.

### 로컬 그림 OCR

`ocr_document`는 기본 `tesseract`, 기본 언어 `kor+eng`입니다. 설치된 로컬 실행 파일·언어 데이터가 필요합니다. 다음 미배포 보안 후보에서는 요청 인수 `executable`을 거부하며, 실행파일은 서버 운영자가 시작할 때 `--ocr-executable /absolute/path/tesseract`로 고정합니다. 현재 공개 npm 0.1.1에는 이 변경이 아직 반영되지 않았습니다. macOS에서 OS Vision을 명시 선택하는 예시는 다음과 같습니다.

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "ocr_document",
    "arguments": {
      "inputPath": "./document.hwpx",
      "provider": "vision",
      "languages": "kor+eng"
    }
  }
}
```

`reference`로 실제 이미지 참조 한 개를 지정할 수 있고 생략하면 관측 구역 그림 범위를 처리합니다. Vision은 macOS 로컬 제공자이며 실행파일을 바꾸지 않습니다. 다음 후보의 OCR 도구는 외부 프로세스 실행을 나타내도록 `readOnlyHint: false`를 사용합니다. 제공자·언어 부재, 실행 실패, 실제 빈 인식 결과를 구분하며 일부 실패 시 성공 텍스트도 유지합니다. 제공자 자동 fallback·외부 업로드·자동 다운로드·원본 자동 수정은 없습니다.

기존 실제 Vision의 한국어·영어 인식 증거와 새 설치의 제공자 부재 오류 검증을 구분합니다. 실제 Tesseract 인식의 양성은 미검증입니다. 페이지 전체·바탕쪽·브러시·차트/수식 래스터화나 OLE 처리를 이 도구의 완료 범위로 추정하지 않습니다. 일반 `read_document`는 OCR을 호출하지 않습니다.

### 본문의 논리 참조로 개체 조회

본문의 `hwpjs-object:<SHA>/<format>/s<section>/<kind>/<node>`는 HTTP·파일 URL이나 MCP resources URI가 아닙니다. `![이미지 N](참조)` 등의 `N`은 표시 순번이며 추출 ID가 아닙니다. 실제 참조 전체를 `get_document_object`의 `reference`로 전달합니다. 아래 `OBJECT_REFERENCE_FROM_READ`는 읽기 결과로 바꾸세요.

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "get_document_object",
    "arguments": {
      "inputPath": "./document.hwpx",
      "reference": "OBJECT_REFERENCE_FROM_READ",
      "format": "text"
    }
  }
}
```

실제 그림이 관측됐지만 추출 inventory와 연결되는 참조를 확인하지 못하면 `[이미지: 추출 참조 확인 불가]`로 표시합니다. 이는 그림이 없다는 뜻이 아니며, 가짜 조회 URI를 만들지 않습니다.

원문 SHA·실제 형식·종류·실제 inventory 멤버를 검증하며 없는 개체나 오래된 참조는 거부합니다. 응답은 inspector의 `text`를 MCP text content로 반환하며, 관측 정보·내용과 `상태: available` 또는 `상태: unavailable`, 미지원 사유를 표시합니다. 내부 JS 반환 객체의 `status` 필드는 상태 값이며, MCP가 별도 `status` 필드를 응답한다는 뜻은 아닙니다. 이미지 조회는 바이트 디코딩을 하지 않으며 실제 파일 추출은 별도입니다. 모든 개체의 완전한 열거·렌더링을 뜻하지 않습니다. 전용 source API가 없는 HWP5 차트·수식은 종류를 추측하지 않고 미분류·참조 미확정으로 남길 수 있습니다.

객체 조회와 참조 추출은 `0.1.0`에 포함됩니다. 이전 설치분은 갱신한 뒤 `tools/list` 스키마를 확인하세요. 이 웹 실습은 본문 참조를 텍스트로 표시하며 실제 조회·추출 stdio 도구를 실행하지 않습니다.

### 그림 선택과 단일 파일 추출

본문에서 얻은 **이미지** 참조가 있으면 `extract_document_image`의 `reference`로 전달합니다. 이 경우 `id`·`expectedSha256`은 함께 보내지 않습니다. 두 방식의 혼용과 이미지가 아닌 참조는 거부합니다.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "extract_document_image",
    "arguments": {
      "inputPath": "./document.hwpx",
      "outputPath": "./referenced-image.jpg",
      "reference": "IMAGE_REFERENCE_FROM_READ"
    }
  }
}
```

위 출력 확장자는 실제 관측 결과가 `.jpg`인 경우의 예시입니다. 필요한 경우 `list_document_images`에서 확장자를 확인합니다. 추출 응답은 새 파일의 호스트 경로·SHA이며 MCP 이미지 Content나 OCR 결과를 반환하지 않습니다.

기존 ID·SHA 방식도 유지합니다. 먼저 `list_document_images`에 `inputPath`를 보내 원문 SHA·그림 ID·실제 확장자를 확인합니다. 선택한 ID와 같은 원본의 SHA를 사용해 다음 요청을 보냅니다. 아래 ID·SHA는 실제 목록의 값으로 바꾸며, `.png` 경로는 관측된 확장자가 `.png`인 경우의 예시입니다.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "extract_document_image",
    "arguments": {
      "inputPath": "./document.hwpx",
      "outputPath": "./selected.png",
      "id": "IMAGE_ID_FROM_LIST",
      "expectedSha256": "LIST_RESULT_DOCUMENT_SHA256"
    }
  }
}
```

MCP의 `outputPath`는 **새 단일 파일**입니다. CLI `extract-images --output`의 새 디렉터리와 다릅니다. 추출할 바이트의 관측 확장자와 출력 확장자가 맞아야 하며 판별하지 못한 원시 데이터는 `.bin`을 사용합니다. 변환이나 OCR을 수행하지 않습니다.

관측·추출 범위는 `section-picture-sites`이며 마스터 페이지 그림·이미지 채우기·참조되지 않은 리소스는 제외합니다. 실패·미지원 그림도 목록에 남기고, 헤더 형식 인식을 픽셀 검증으로 간주하지 않습니다. 기존 도구의 전체 이미지 추출과 같은 범위라고 주장하지 않습니다.

기존 출력이나 symlink 경로는 거부합니다. 실패 응답에서도 이미 파일이 게시됐을 수 있으므로 `published`·경로·SHA를 확인하세요. 영수증 출력량이 제한되면 상세 항목 대신 게시 개수·위치·생략 표시가 남을 수 있습니다. 같은 경로로 무조건 재시도하지 않습니다. `completeWithinListedScope`도 제한된 목록 안의 완료 여부일 뿐 문서 전체 완전성의 증거는 아닙니다. 크기·개수 및 부분 실패의 경계는 [CLI 이미지 추출](./cli.md#그림-목록과-추출)과 같습니다.

[브라우저 체험](../cli-simulation.mdx)은 네이티브 엔진의 결과와 도구 메시지 형식을 설명합니다. 브라우저에서 실제 Node CLI·로컬 파일 시스템·MCP stdio 연결을 실행하거나, 새 도구가 설치된 서버를 대신 검증하지는 않습니다. 현재 실습의 보기 전환·대표 문자열 편집을 apply/create/convert/OCR 화면의 지원으로 해석하지 않습니다.

## 0.1.1의 새 파일 도구

공개 npm `@ohah/hwpjs@0.1.0`에 없는 추가 기능입니다. 0.1.1 서버에는 아래 4도구를 포함해 총 16도구가 있습니다. npm 0.1.0 설치만으로 호출할 수 없습니다. 갱신한 서버의 `tools/list`와 엄격한 입력 스키마를 확인하세요.

| 도구                     | 요청에 사용하는 값                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `delete_document_table`  | `inputPath`, `outputPath`, 원본에 결속된 `reference`, `allowStaleLayout: true`                                                          |
| `insert_document_image`  | `inputPath`, `outputPath`, `target`, `unit`, `expectedText`, `expectedSha256`, `imagePath`, `width`, `height`, `allowStaleLayout: true` |
| `export_document_html`   | `inputPath`, `outputPath`, 선택적 `embedImages`: `supported` 또는 `none`                                                                |
| `replace_document_image` | `inputPath`, `outputPath`, 같은 원본의 이미지 `reference`, `imagePath`                                                                  |

초기화된 MCP 세션에서의 도구 호출 인수 예시입니다. 파일은 서버 작업 디렉터리 기준이며 새 출력 경로를 사용합니다.

```json
{
  "name": "export_document_html",
  "arguments": {
    "inputPath": "./document.hwpx",
    "outputPath": "./document.html",
    "embedImages": "supported"
  }
}
```

표 삭제·그림 삽입에 필요한 신규 선택 ABI는 0.1.1의 기본 WASM에 포함됩니다. 별도 `--wasm` 지정은 필요하지 않습니다. 이전 0.1.0의 WASM을 강제로 연결하면 `ABIUnavailable`로 거부될 수 있습니다.

삽입의 `expectedText`는 정규화한 표시 본문이 아니라 같은 원본의 Native 문단 원문입니다. JSON의 `\u0000`은 인프로세스 문자열로 전달할 수 있어 OS argv의 NUL 제한과 구분됩니다. `expectedText` 상한은 1Mi UTF-16 코드 유닛이며 실제 제어 문맥의 삽입 가능성은 서비스가 판정합니다. 폭·높이는 1~2147483647 HWPUNIT이고 `unit`은 Native UTF-16 좌표입니다. 그림 삽입은 필드 없는 구역의 plain 최상위 본문 문단에 새 인라인 PNG/JPEG 하나로 제한됩니다. 구역 내 필드는 문단 중간도 `ProtectedFieldRange`로 거부하며 기존 개체 문단·표 셀·글상자는 지원하지 않습니다. 표 삭제·그림 삽입은 stale-layout 동의가 필요하며 재조판·미리보기는 오래된 상태로 보고합니다. HTML은 의미 구조 출력이며 서식·페이지 배치 동등성이 아닙니다.

모든 도구는 같은 CLI 파일 호스트를 사용합니다. 현재 웹 UI·열린 편집 세션 undo와는 연결되지 않았습니다. 결과·현재 지원 제한·원자적 게시와 게시 후 오류의 해석은 [문서 파일 변환 계약](https://github.com/ohah/hwpjs/blob/main/docs/document-file-transforms.md)과 [CLI 사용법](./cli.md#새-파일의-표-삭제그림-삽입의미-html)을 따릅니다.


## 개발 중: 반복 읽기 세션

아래 도구 세 개는 새 로컬 후보에 추가한 기능이며 npm 0.1.1에는 아직 배포하지 않았습니다. 기존 파일 도구에 아래 원본 표 grid 도구를 더한 소스 후보는 파일 도구 17개와 세션 도구 3개로, `tools/list`는 20개입니다. 같은 Native 문서를 유지해 반복 읽기 때 다시 열지 않습니다.

| 도구 | 입력 | 결과 |
| --- | --- | --- |
| `open_document_session` | `inputPath`, 선택적 `expectedSha256` | `sessionId`, 포맷, 원본 SHA, 구역 수 |
| `read_document_session` | `sessionId`, 선택적 `format`, `view` | 기존 읽기와 같은 text/Markdown·개체 참조 |
| `close_document_session` | `sessionId` | 핸들 종료와 Native 자원 해제 |

```json
{"name":"open_document_session","arguments":{"inputPath":"/documents/noori.hwpx"}}
{"name":"read_document_session","arguments":{"sessionId":"SERVER_RETURNED_SESSION_ID","format":"markdown"}}
{"name":"close_document_session","arguments":{"sessionId":"SERVER_RETURNED_SESSION_ID"}}
```

세션은 열린 시점의 읽기 전용 스냅샷입니다. 디스크 변경을 자동 반영하지 않으며 세션 편집·undo/redo는 이번 범위에 없습니다. 파일 편집은 기존 `apply_document_changes` 등을 사용합니다. 같은 세션에 읽기를 겹쳐 보내면 `DocumentSessionBusy`로 거부하므로 이전 읽기를 기다린 뒤 다음 요청을 보냅니다.

동시 세션은 4개, 입력은 파일당 64MiB·예약 포함 합계 128MiB, 한 읽기 응답은 UTF-8 16MiB입니다. 입력 한도는 전체 파서 heap/RSS의 상한이 아닙니다. 다른 서버의 핸들이나 종료한 핸들은 사용할 수 없고, 사용 후 close해야 합니다. 서버 종료도 자원을 정리합니다.


## 원본 표 행·열 파일 편집 (소스 후보)

`edit_document_table_grid`는 현재 소스 서버에 추가된 도구이며 공개 npm 0.1.1에는 포함되지 않습니다. 소스 후보의 목록은 파일 도구 17개+세션 도구 3개, 총 20개입니다.

```json
{
  "name": "edit_document_table_grid",
  "arguments": {
    "inputPath": "./input.hwpx",
    "outputPath": "./grid-edited.hwpx",
    "reference": "TABLE_REFERENCE_FROM_STRUCTURE",
    "action": "insert-row",
    "index": 2,
    "expectedRows": 2,
    "expectedColumns": 3,
    "layout": "spec6",
    "allowStaleLayout": true
  }
}
```

`reference`는 같은 원본 SHA를 포함한 실제 표 참조로 바꿔야 합니다. `action`·0 기반 `index`·현재 예상 크기와 선택 `layout`의 범위는 [CLI 계약](./cli.md#원본-표-행열-파일-편집-소스-후보)을 따릅니다. 알 수 없는 키는 거부하며 `allowStaleLayout` 기본값은 false입니다. HWP5/HWPX 모두 명시 동의해야 저장합니다. MCP는 공통 CLI 파일 호스트를 호출하고 별도 파일 쓰기를 수행하지 않습니다. 응답에는 새 파일의 경로·SHA·원본 SHA와 `layoutRequiresReflow: true`, `previewStale: true`가 포함됩니다. 열린 세션을 편집하는 도구가 아닙니다.
