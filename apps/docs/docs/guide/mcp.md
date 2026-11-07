# MCP로 문서 도구 연결

MCP 클라이언트에 로컬 stdio 서버를 연결하면 HWP5/HWPX 읽기·문서 정보·그림 목록·단일 그림 추출과 한 문단의 문자열 교체를 도구로 사용할 수 있습니다. 서버는 공통 CLI의 파일·SHA·네이티브 검증을 호출하며 별도 문서 파서를 두지 않습니다.

## 서버 준비와 설치 상태

새 패키지는 npm 게시 전의 로컬 후보입니다. [CLI 설치 상태](./cli.md)를 먼저 확인하세요. 새 패키지를 로컬에 설치한 환경의 실행 명령은 다음과 같습니다.

```bash
npx --no-install hwpjs-mcp
npx --no-install hwpjs-mcp --wasm /absolute/path/to/hwpjs.wasm
```

문서 정보·그림 목록·추출 도구가 포함된 새 로컬 패키지에서 설치 후 공식 SDK 클라이언트로 서버를 연결해 두 형식의 실제 조회·추출을 확인했습니다. 앞선 패키지와 동결된 Skill 자산은 별도 세대이며, 새 Skill 자산도 따로 설치 검증합니다. 공개 npm 게시나 배포 완료를 뜻하지 않습니다.

서버 실행 파일과 나란한 WASM이 기본값입니다. stdout은 MCP 프로토콜 전용이며 서버 진단은 stderr로 전달됩니다. 도구 실행의 실패 내용은 응답의 text content에도 포함됩니다. 서버의 작업 디렉터리가 상대 문서 경로의 기준입니다. 실제 경로와 클라이언트의 권한 범위는 사용자가 설정합니다.

자체 CLI·서버·WASM을 포함한 [Skill](./skill.md)을 설치했다면 해당 Skill의 실제 절대경로로 실행할 수도 있습니다.

```json
{
  "command": "node",
  "args": ["/absolute/path/to/hwpjs/scripts/hwpjs.mjs", "mcp"]
}
```

이 객체를 등록하는 위치와 서버 설정의 바깥 구조는 MCP 클라이언트마다 다릅니다. 문서 페이지나 브라우저 체험이 사용자의 클라이언트 설정을 변경하지는 않습니다. 설치된 Skill이 어느 도구 세대인지도 함께 확인하세요.

## 제공 도구

| 도구                     | 입력                                                                                                        | 결과                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `read_document`          | `inputPath`, 선택적 `format`: `text` 또는 `markdown`                                                        | 문서 SHA·원문 ID·논리 뷰를 담은 text content                   |
| `edit_document`          | `inputPath`, `outputPath`, `target`, `expectedSha256`, `findText`, `replacement`, 선택적 `allowStaleLayout` | 새 문서 경로·SHA·변경 및 줄 배치 상태를 담은 text content      |
| `get_document_info`      | `inputPath`, 선택적 `expectedSha256`                                                                        | 포맷·SHA·크기·구역 수와 관측 가능한 메타데이터                 |
| `list_document_images`   | `inputPath`, 선택적 `expectedSha256`                                                                        | 원문 SHA와 그림 ID·상태·MIME·확장자·바이트 수·제한된 관측 범위 |
| `extract_document_image` | `inputPath`, `outputPath`, `id`, `expectedSha256`                                                           | 새 이미지 **파일** 경로·SHA 또는 실패 및 게시 영수증           |

`format` 기본값은 `text`, `allowStaleLayout` 기본값은 `false`입니다. 도구에서 CLI 실행이 실패하면 `isError: true`와 text content가 포함됩니다. 이 도구들은 문서 전체 JSON 객체를 반환하는 변환 API가 아닙니다. 프로토콜 JSON과 사용자가 읽는 논리 뷰는 구분합니다.

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

`markdown`도 같은 논리 뷰이며 전용 문서 Markdown 변환기의 서식·이미지 출력과는 구분합니다. 과거 Rust API의 함수 이름·옵션·문자열을 그대로 재현하는 계약은 아닙니다.

### 수정 요청 예시

`target`과 `expectedSha256`은 같은 읽기 스냅샷에서 얻은 실제 값으로 바꿉니다. 아래 SHA는 형식 설명용 자리표시자입니다.

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

### 그림 선택과 단일 파일 추출

먼저 `list_document_images`에 `inputPath`를 보내 원문 SHA·그림 ID·실제 확장자를 확인합니다. 선택한 ID와 같은 원본의 SHA를 사용해 다음 요청을 보냅니다. 아래 ID·SHA는 실제 목록의 값으로 바꾸며, `.png` 경로는 관측된 확장자가 `.png`인 경우의 예시입니다.

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

[브라우저 체험](../cli-simulation.mdx)은 네이티브 엔진의 결과와 도구 메시지 형식을 설명합니다. 브라우저에서 실제 Node CLI·로컬 파일 시스템·MCP stdio 연결을 실행하거나, 새 도구가 설치된 서버를 대신 검증하지는 않습니다.
