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
| `apply_document_changes` | `inputPath`, `outputPath`, `target`, `expectedSha256`, `findText`, `replacement`, 선택적 `allowStaleLayout` | 새 문서 경로·SHA·변경 및 줄 배치 상태를 담은 text content                        |
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

| 도구                     | 입력                                 | 결과                                     |
| ------------------------ | ------------------------------------ | ---------------------------------------- |
| `open_document_session`  | `inputPath`, 선택적 `expectedSha256` | `sessionId`, 포맷, 원본 SHA, 구역 수     |
| `read_document_session`  | `sessionId`, 선택적 `format`, `view` | 기존 읽기와 같은 text/Markdown·개체 참조 |
| `close_document_session` | `sessionId`                          | 핸들 종료와 Native 자원 해제             |

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

## 문자 글머리표 정의 생성·수정

현재 GitHub 구현은 기존 `apply_document_changes`에 `paragraph-bullet-definition` 연산을 연결합니다. npm 릴리스 지원을 뜻하지 않습니다. 공개 설치 이름은 `npm install @ohah/hwpjs`, 서버 호출은 `hwpjs mcp`이며 해당 구현과 대응 WASM을 포함한 빌드가 필요합니다. 별도 MCP 패키지는 없습니다.

```json
{
  "name": "apply_document_changes",
  "arguments": {
    "inputPath": "/absolute/document.hwpx",
    "outputPath": "/absolute/document-with-bullet.hwpx",
    "expectedSha256": "ACTUAL_DOCUMENT_SHA256",
    "operations": [
      {
        "kind": "paragraph-bullet-definition",
        "coordinates": "current-transaction",
        "section": 0,
        "paragraph": 2,
        "edit": {
          "mode": "create",
          "apply": true,
          "definition": {
            "marker": 9733,
            "alignment": "RIGHT",
            "useInstanceWidth": false,
            "autoIndent": true,
            "widthAdjust": -50,
            "textOffsetType": "HWPUNIT",
            "textOffset": 750,
            "charShapeId": 4294967295
          }
        }
      }
    ]
  }
}
```

SHA와 Native 문단 주소는 같은 원본의 구조 보기·문단 조회 결과로 바꿉니다. `edit.mode: "update"`와 기존 `edit.id`를 보내면 같은 ID를 사용하는 모든 문단에 영향을 줍니다. `apply: false`는 정의만 수정합니다. 필수 속성·수치 한도와 저장 경계는 [CLI의 공통 계약](./cli.md#문자-글머리표-정의-작업)을 따릅니다. MCP의 strict 스키마 뒤에도 동일 mutation service가 요청을 검증하며, 구형 ABI·후행 오류는 새 파일 게시 없이 실패합니다. HWP5는 .hwp 입력/출력과 원본 Native 문단0-based 주소를 사용하며 HWPX는1-based입니다. 전체 inventory의 definitionWriter를 확인하며 HWP5 저장에는 allowStaleLayout=true가 필요합니다.

## 원본 셀 나누기

**현재 GitHub 구현 기준**입니다. npm 릴리스 제공을 뜻하지 않으며, 공개 설치 이름은 `npm install @ohah/hwpjs`, 서버 호출은 `hwpjs mcp`입니다. 이 기능과 대응 WASM을 포함한 빌드를 사용합니다. 별도 MCP 패키지나 서버를 설치하지 않습니다.

기존 `apply_document_changes`에 공통 명시 연산을 전달합니다. 같은 원본의 `read_document` 구조 보기에서 얻은 SHA와 표 reference를 사용합니다.

```json
{
  "name": "apply_document_changes",
  "arguments": {
    "inputPath": "/absolute/document.hwpx",
    "outputPath": "/absolute/document-split.hwpx",
    "expectedSha256": "ACTUAL_DOCUMENT_SHA256",
    "allowStaleLayout": true,
    "operations": [
      {
        "kind": "source-table-cell-split",
        "coordinates": "current-transaction",
        "reference": "TABLE_REFERENCE_FROM_STRUCTURE",
        "expectedRows": 2,
        "expectedColumns": 2,
        "top": 0,
        "left": 0,
        "bottom": 1,
        "right": 1,
        "rows": 2,
        "columns": 3,
        "mode": "each",
        "equalizeRows": true
      }
    ]
  }
}
```

서버의 strict 스키마와 CLI의 동일 mutation service가 요청을 검증합니다. HWPX 병합 셀 전체·각 셀·합친 후 나누기와 HWP5 단일 비병합 원본 셀 profile은 [CLI의 원본 셀 나누기 계약](./cli.md#원본-셀-나누기)을 따릅니다. 사각형 끝은 미포함이며 물리 셀 수와 Native binding은 서버가 현재 관측에서 발급합니다.

앞선 작업이 binding을 바꾼 뒤 이전 serialized reference를 다른 표의 숫자 주소로 재대상화하지 않습니다. 새 원본 SHA/reference가 필요하면 변경을 새 파일에 먼저 저장한 뒤 새 요청을 시작합니다. stale·foreign·수명 종료·후행 오류는 `isError: true`이며 부분 파일을 게시하지 않습니다. H497의 HWP5 외곽 선언/셀 합 제한도 그대로 거절합니다.

## CLI/MCP 원본 병합 셀 한 개 나누기

현재 GitHub 구현 기준이며 npm 게시 버전의 지원 선언이 아닙니다. 단일 `npm install @ohah/hwpjs` 빌드의 기존 `hwpjs apply` / `apply_document_changes`에서 `source-table-cell-split` 연산을 사용합니다. optional Native capability의 `supportsMergedInput === true`일 때 HWP5의 full-span 단일 물리 셀을 허용합니다. false인 기존 엔진은 표 전체 비병합 제한을 그대로 유지합니다. Native/SDK profile을 임의로 확대하거나 자동 fallback하지 않습니다.

`reference`는 같은 원본 SHA로 read 구조 보기에서 읽은 table reference입니다. expectedRows/expectedColumns는 현재 격자 전체 행열, top/left/bottom/right는 선택 물리 셀의 전체 span 사각형(bottom/right 제외 경계)이어야 합니다. rows/columns는 분할 개수입니다. HWP5는 selected physical cell 정확히1, mode=each, equalizeRows=true만 지원합니다. 일부 span·여러 물리 셀·merge-then-split·기존 높이 보존은 거절합니다. 지원 capability가 true이면 선택하지 않은 다른 병합 셀도 보존할 수 있습니다.

예를 들어 실제2×2 격자 전체를 한 물리 셀이 차지한다면 top0/left0/bottom2/right2로2×2 나누기를 요청합니다. 새 필드나 숫자 Native tableNode/binding을 입력에 추가하지 않습니다. 기존 resolveTableReference·expected grid·현재 owner·fingerprint·session/revision/serial·단일 사용 ticket을 그대로 검사합니다. 앞선 변경으로 Native binding이 달라지면 예전 reference 숫자를 다른 표로 재해석하지 않습니다. 후행 오류에는 새 출력 파일을 게시하지 않고 원본·기존 출력도 덮어쓰지 않습니다.

```json
{
  "kind": "source-table-cell-split",
  "coordinates": "current-transaction",
  "reference": "EXACT_TABLE_REFERENCE_FROM_READ",
  "expectedRows": 2,
  "expectedColumns": 2,
  "top": 0,
  "left": 0,
  "bottom": 2,
  "right": 2,
  "rows": 2,
  "columns": 2,
  "mode": "each",
  "equalizeRows": true
}
```

CLI는 위 연산을 배열로 `--operations`에 전달하거나 `{"version":1,"operations":[...]}` patch 파일로 지정합니다. `hwpjs apply ./document.hwp --patch ./split-patch.json --expect-sha256 EXACT_INPUT_SHA256 --output ./split.hwp --allow-stale-layout --wasm /absolute/current-engine.wasm`입니다. MCP는 `hwpjs mcp --wasm /absolute/current-engine.wasm`에서 같은 연산을 `apply_document_changes`의 operations 배열에 넣습니다.

## 문자 확장 서식: 밑줄·글자색·언어별 글꼴 이름

현재 GitHub 구현 기준이며 npm 릴리스 지원을 뜻하지 않습니다. 설치 이름은 `npm install @ohah/hwpjs`입니다. 해당 CLI 구현과 optional atomic-formatting/lifetime query를 지원하는 Native를 포함한 단일 패키지 빌드가 필요합니다. 기존 `character-properties`의 size/bold/italic은 그대로 유지하고 underline/textColor/fontName을 추가합니다. 확장 필드가 실제 지정되면 기존 Native atomic patch 한 번으로 함께 적용합니다.

서버는 `hwpjs mcp --wasm /absolute/path/current-engine.wasm`로 실행합니다. 기존 apply_document_changes가 CLI와 같은 서비스를 사용합니다.

```json
{
  "name": "apply_document_changes",
  "arguments": {
    "inputPath": "/absolute/document.hwpx",
    "outputPath": "/absolute/character-changed.hwpx",
    "expectedSha256": "EXACT_INPUT_SHA256",
    "allowStaleLayout": true,
    "operations": [
      {
        "kind": "character-properties",
        "coordinates": "current-transaction",
        "section": 0,
        "paragraph": 2,
        "startUnit": 0,
        "endUnit": 3,
        "expectedRangeText": "SAM",
        "properties": {
          "size": 1900,
          "bold": true,
          "italic": true,
          "underline": "bottom",
          "textColor": "#123456",
          "fontName": {
            "language": "latin",
            "name": "Bridge Native Font"
          }
        }
      }
    ]
  }
}
```

`size`는 1/100pt이며1900은19pt입니다. `textColor`는 `#RRGGBB`이고 기존 SDK RGB24 codec을 사용합니다. `underline`은 HWP5 none/bottom/top, HWPX none/bottom/center/top입니다. `fontName`의 language는 hangul/latin/hanja/japanese/other/symbol/user 중 하나이고 이름을 임의 정규화하거나 다른 언어까지 변경하지 않습니다. 글꼴 파일 설치·문자 fallback은 이 쓰기 범위가 아닙니다. 각 optional 값의 null/생략은 기존 값 보존입니다. Native의 unknown/unavailable 관측은 검정색·기본 글꼴로 바꾸지 않으며 해당 대상이 쓰기 불가하면 원래 사유로 거절합니다.

좌표는 Native 원본 UTF-16 단위로, HWP5 문단0부터/HWPX 문단1부터이며 CLI가1을 더하거나 빼지 않습니다. 예제의 paragraph2와 SAM은 합성 입력의 예시일 뿐입니다. 실제 `hwpjs paragraph INPUT --target s0:p2`로 본문·주소를 확인하고 정확한 expectedRangeText를 지정합니다. 확장 서식은 비어 있지 않은 최상위 body 범위만 지원합니다. 셀·각주 등으로 확대하지 않습니다.

현재 후보는 확장 서식 앞에 구조·텍스트 변경이 있는 batch를 StaleCharacterExtensionTarget으로 거절합니다. 같은 본문의 다른 문단이 동일 숫자 슬롯을 차지해도 자동 재대상화하지 않습니다. 서식만 바꾸는 선행 연산과 여러 확장 연산은 기존 Native owner/lineage/session·비되감기 serial을 검증하며 순차 실행합니다. 외부 binding/ref를 입력으로 받지 않고 쓰기 직전 같은 SDK에서 새 binding/target 쌍을 얻습니다.

전체 입력·ABI·요청 필드·현재 대상 입장 검사 후 기존 lazy history V2를 사용합니다. Native 쓰기/후행 연산/저장/종료 중 실패하면 새 출력 파일을 게시하지 않습니다. Native의 uncertain/cleanup/refresh 오류를 재시도하지 않습니다. 성공 operationResults에는 Native before/after 관측을 그대로 담고 known/mixed/unknown/unavailable 상태를 바꾸지 않습니다. size/bold/italic만 쓰는 기존 경로는 확장 ABI를 요구하지 않습니다.

## HWP5/HWPX 편집 용지 변경

이 연산을 포함한 빌드 기준이며 npm 게시 버전의 지원을 뜻하지 않습니다. `@ohah/hwpjs` 단일 패키지에 해당 형식의 page-settings optional Native writer가 필요합니다. HWP5/HWPX 모두 같은 연산을 사용하며 구형 엔진은 `PageSettingsWriteUnavailable`로 첫 변경 전에 거절합니다.

서버는 `hwpjs mcp --wasm /absolute/path/page-settings-engine.wasm`로 실행합니다. 기존 `apply_document_changes`가 CLI와 같은 단일 편집 서비스를 사용합니다.

```json
{
  "name": "apply_document_changes",
  "arguments": {
    "inputPath": "/absolute/document.hwpx",
    "outputPath": "/absolute/page-changed.hwpx",
    "expectedSha256": "EXACT_INPUT_SHA256",
    "allowStaleLayout": true,
    "operations": [
      {
        "kind": "page-settings",
        "coordinates": "current-transaction",
        "scope": "section",
        "section": 0,
        "values": {
          "orientation": "narrowly",
          "width": 64800,
          "height": 86400,
          "gutter_type": "top_bottom",
          "margin": {
            "header": 1800,
            "footer": 1800,
            "gutter": 720,
            "left": 7200,
            "right": 3600,
            "top": 3600,
            "bottom": 5400
          }
        }
      }
    ]
  }
}
```

모든 치수는 원본 HWPUNIT 정수입니다. 단위 변환이나 방향에 따른 width/height 교환을 하지 않습니다. `narrowly`는 가로, `widely`는 세로이며 원본 축은 유지합니다. 값·여백의 모든 필드는 필수이고, 내용 영역의 유효성은 기존 SDK와 Native가 검증합니다.

`scope: "section"`에는 0부터 시작하는 명시 `section`이 필수입니다. `scope: "document"`는 `section` 키를 생략하고 모든 구역을 한 번에 처리하며 미지원 구역을 건너뛰지 않습니다. 호출자가 binding·node index·expected snapshot을 직렬화해 전달하지 않습니다. 공통 서비스가 같은 살아 있는 SDK에서 현재 capability를 얻습니다. 전체 batch의 입력·ABI·대상 입장 검사를 먼저 수행하며, 후행 실행·저장·종료 실패 시 결과 파일을 게시하지 않습니다. 원본이나 기존 출력 덮어쓰기도 거절합니다. 편집 후 조판을 다시 계산해야 합니다.

HWP5는 위 예제의 입력·출력 확장자를 `.hwp`로 바꿔 같은 `page-settings` 연산을 사용합니다. 치수는 HWPUNIT 정수(7200=25.4mm)이며 width/height 저장 축을 전치하지 않습니다. 공용 widely는 세로, narrowly는 가로입니다. HWP5의 raw orientation 이름과는 SDK에서 명시 변환하므로 CLI/MCP가 raw flags를 만들지 않습니다.

`scope: "document"`는 현재 구역 모두가 지원되어야 하며 미지원 구역을 건너뛰지 않습니다. `scope: "section"`은 명시한0기준 구역만 대상으로 합니다. Native binding·expected snapshot·targets는 외부 입력으로 받지 않고 같은 살아 있는 SDK에서 admission 및 각 쓰기 직전에 다시 조회합니다. 앞선 편집 뒤 이전 node index를 재사용하지 않습니다.

구형 ABI는 선행 작업이 있어도 history/write/save 전에 거절합니다. 후행 Native 오류·불확실 완료·cleanup/close 실패는 새 출력을 게시하지 않습니다. HWP5 변경 저장에는 기존 `allowStaleLayout` 동의가 필요하며 이 옵션은 전체 조판 완료를 뜻하지 않습니다. 원본·기존 출력은 덮어쓰지 않습니다.

## 폼 상태 편집

단일 `@ohah/hwpjs` 패키지의 현재 GitHub 구현 기준입니다. 설치 이름은 `npm install @ohah/hwpjs`이며 npm 버전 릴리스에 포함됐다는 뜻은 아닙니다. `read_document`의 `view: "structure"` 또는 `get_document_info`에서 form reference와 원본 SHA를 얻고 기존 `apply_document_changes`를 호출합니다.

```json
{
  "inputPath": "/absolute/input.hwp",
  "outputPath": "/absolute/checked.hwp",
  "expectedSha256": "READ_DOCUMENT_SHA256",
  "allowStaleLayout": true,
  "operations": [
    {
      "kind": "form-checkbox-state",
      "coordinates": "current-transaction",
      "reference": "READ_DOCUMENT_FORM_REFERENCE",
      "expectedState": "UNCHECKED",
      "state": "CHECKED"
    }
  ]
}
```

위 SHA/reference 표시는 조회 결과로 교체합니다. HWP5/HWPX `form-radio-select`는 `reference`, `expectedState`, `expectedGroupName`으로 Native 그룹 선택을 요청합니다. `form-text`는 `reference`, `expectedText`, `text`로 폼텍스트를 바꿉니다. 모든 연산에 `coordinates: "current-transaction"`이 필요합니다. 체크박스 상태는 UNCHECKED/CHECKED/INDETERMINATE이며 마지막 상태는 Native triState 허용이 필요합니다. 라디오는 UNCHECKED/CHECKED만 읽고 선택 요청만 지원합니다. HWPX 라디오/폼텍스트는 새 optional Native getter/writer가 있어야 하며 구형 엔진에서는 쓰기 전에 거절합니다.

CLI와 같은 strict schema·입장 검사·Native writer·새 파일 게시를 사용합니다. 추가 formNode 필드는 거절하며 원본 파일을 덮어쓰지 않습니다. 폼보다 앞선 비폼 변경과 stale/foreign 참조를 거절합니다. 실패한 batch의 변경 바이트는 게시하지 않습니다.

폼 상태는 CLI와 동일한 `apply_document_changes`의 operations 배열을 사용합니다. `read_document`의 structure 또는 `get_document_object`에서 발급받은 form reference를 제출하며 숫자 formNode는 영속 대상이 아닙니다. HWP5/HWPX의 `form-checkbox-state`, `form-radio-select`, `form-text`를 연결하고, HWPX radio/text는 새 optional Native getter/writer를 요구합니다. 현재 값·그룹·텍스트 기대 조건과 문서 수명을 전체 batch 입장 및 쓰기 직전에 검사합니다. 구형 ABI·외부/만료 참조·후행 실패는 새 파일을 게시하지 않습니다. 구체적인 동일 JSON 연산 예제는 [CLI 폼 상태 변경](./cli.md#폼-상태-변경)을 따릅니다. 현재 GitHub 구현 기준이며 npm 출시 버전 지원 선언이 아닙니다.
