# CLI로 원본 읽기·편집·새 문서·변환

HWP5와 HWPX 원본 읽기·정보/개체 조회·그림 추출과 명시 편집을 공통 Native 엔진으로 처리합니다. 새 문서 생성, 명시적인 text-only 교차 변환과 로컬 OCR도 제공합니다. 기본 읽기는 관측한 문서 내용을 텍스트나 Markdown 본문으로 출력합니다. 편집에 필요한 원문 ID·SHA와 진단 상세는 편집 구조 보기에서 확인합니다.

[브라우저 체험](../cli-simulation.mdx)은 로컬 Node CLI 실행과 별개입니다. 페이지가 사용자의 로컬 파일 시스템이나 설치된 CLI를 대신 실행하지는 않습니다. 현재 실습의 읽기·보기 전환·대표 문자열 편집이 아래 apply/create/convert/OCR 화면을 모두 제공한다는 뜻은 아닙니다.

## 공개 npm 설치

CLI와 MCP는 단일 `@ohah/hwpjs` 패키지로 제공하며 WASM이 포함됩니다. Node.js 24.20.0 이상이 필요합니다. 0.1.1은 통합 `hwpjs mcp` 진입점과 16개 MCP 도구를 제공합니다. 이전 0.1.0은 12개 도구입니다. [패키지 이름과 게시 상태](./package-names.md)에서 이전 RC와의 차이를 확인하세요.

```bash
npx -y @ohah/hwpjs --help
npx -y @ohah/hwpjs read ./document.hwpx
```

프로젝트 의존성으로 설치하려면 `npm install @ohah/hwpjs`를 사용합니다. React·Svelte·React Native 어댑터를 쓰는 프로젝트는 해당 peer를 별도로 준비합니다. 기존 설치는 자동 갱신되지 않습니다. 설치 버전과 `--help`, MCP `tools/list`로 제공 기능을 확인하세요. MCP 기본 연결은 `npx -y @ohah/hwpjs mcp`이며 [MCP 연결 가이드](./mcp.md)를 따릅니다.

공개 0.1.0은 인증 정보를 제거한 새 소비자에서 공개 레지스트리 설치와 배포 파일 110개의 일치를 확인했습니다. 실제 설치본의 도움말·HWPX 생성·Noori HWP5 편집/재열기와 독립 CFB/XML 검사, MCP 버전 `0.1.0`·12도구 목록도 확인했습니다. 생성·문단 조회·apply·text-only 변환과 거부 동작의 앞선 설치 검사는 같은 CLI 바이트의 증거이며, 공개 설치 확인만으로 모든 명령을 전수 검증한 것은 아닙니다. OCR 제공자 부재 거부와 실제 Tesseract 인식 성공도 구분합니다. 이전 npm 패키지나 Skill 설치분은 자동 갱신되지 않으며, 브라우저 체험은 별도 실행 경로입니다.

저장소에서는 의존성을 준비한 작업 사본과 명시한 WASM을 사용합니다.

```bash
bun run cli read ./document.hwp --wasm /absolute/path/to/hwpjs.wasm
```

소스는 Node24의 type stripping으로 실행하고 strict 타입 검사는 별도로 수행합니다. 설치 패키지의 bin은 TypeScript 원문이 아닌 JS입니다.

빌드된 CLI의 기본 WASM은 실행 파일 옆의 `hwpjs.wasm`입니다. `--wasm PATH`로 다른 파일을 명시할 수 있으며 상대 경로는 현재 작업 디렉터리 기준입니다. CLI 도움말은 문서나 WASM 없이 볼 수 있습니다.

## 문서 내용 읽기

```bash
npx -y @ohah/hwpjs read ./document.hwp
npx -y @ohah/hwpjs read ./document.hwpx --format markdown
npx -y @ohah/hwpjs read ./문서.hwp --format markdown > ./문서.md
```

기본 `view`는 `content`, 기본 `format`은 `text`입니다. 성공한 단일 읽기의 stdout에는 관측한 문서 본문만 출력하며 `format`·`documentSHA256` 접두사나 `Paragraph`·`Cell` 구조 레이블을 붙이지 않습니다. 이미지·표 등에는 후속 조회를 위한 논리 개체 참조가 포함될 수 있습니다. `--view content`를 명시해도 같습니다. `>`는 셸의 리다이렉션이며 새 읽기 `--output` 옵션이나 stdin·URI 읽기를 뜻하지 않습니다.

Markdown은 관측한 문서 내용을 표현합니다. HTML·PDF 변환, 원본 조판·물리 페이지의 완전한 재현, 이미지 OCR이나 문서 전체 JSON 변환을 제공하는 명령이 아닙니다. 관측하지 못한 내용과 구조는 짧은 미확정 표시로 남길 수 있으며, 상세 원인은 편집 구조 보기에서 확인합니다.

## 본문의 이미지·표 참조로 개체 조회

본문에는 관측된 이미지·표·차트·수식·도형·OLE 등의 논리 참조가 표시될 수 있습니다. 참조 형식은 다음과 같으며, 아래 꺾쇠 부분은 문법 설명입니다. 실제 명령에는 읽기 결과의 참조 전체를 복사합니다.

```text
hwpjs-object:<SHA>/<hwp5|hwpx>/s<section>/<kind>/<node>
```

Markdown의 이미지는 `![이미지 N](참조)`, 텍스트에서는 `[이미지 N: 참조]`로 표시하며 관측된 대체 설명이 있으면 함께 남습니다. 표는 짧은 참조와 실제 셀 내용을 함께 표시합니다. `N`은 출력 순회에서 붙인 표시 순번으로 이미지 추출 ID가 아닙니다.

이 참조는 HTTP 주소·파일 링크·MCP 리소스 URI가 아닙니다. 브라우저에서 열거나 클릭해 추출하지 않고, 같은 입력 파일의 CLI 또는 MCP 인수로 사용합니다.

```bash
npx -y @ohah/hwpjs object ./document.hwpx --ref "$OBJECT_REF"
npx -y @ohah/hwpjs object ./document.hwp --ref "$OBJECT_REF" --format markdown
```

실제 그림이 관측됐지만 추출 inventory와 연결되는 참조를 확인하지 못하면 `[이미지: 추출 참조 확인 불가]`로 표시합니다. 이는 그림이 없다는 뜻이 아니며, 가짜 조회 URI를 만들지 않습니다.

`OBJECT_REF`는 해당 문서를 읽어 얻은 실제 참조입니다. `object`의 `--format`은 기본 `text` 또는 `markdown`이며 기존 `read`의 본문/구조 보기 선택과 별개입니다. 원문 SHA·실제 형식·관측 종류와 inventory 멤버를 검증하므로 오래된 참조, 다른 형식·종류·노드를 가리키는 참조는 거부합니다. 원본이 바뀌면 다시 읽습니다.

CLI 출력은 `상태: available` 또는 `상태: unavailable`로 표시합니다. 내부 JS 조회 결과의 `status` 필드와 터미널에 표시하는 문자열은 구분합니다. 관측 가능한 메타데이터·표 내용·추가 행동 안내와 상세 내용이 미지원인 사유를 구분해 확인합니다. `available`이 완전한 시각적 해석이나 이미지 추출 성공을 보장하지는 않습니다. 이미지 조회는 바이트를 디코딩하지 않으며 추출은 별도 명령입니다.

전용 HWP5 차트·수식 source API가 노출되지 않은 개체는 종류를 추측하지 않고 미분류·참조 미확정으로 남깁니다. 참조가 없는 개체에 가짜 참조를 만들거나 모든 개체가 열거됐다고 판단하지 않습니다. 조회·참조 추출은 `0.1.0`에 포함됩니다. 이전 설치분은 갱신하고, 설치 후 CLI/MCP 연결은 실제 사용할 환경에서 확인하세요.

## 편집 구조 조회

```bash
npx -y @ohah/hwpjs read ./document.hwp --view structure
npx -y @ohah/hwpjs read ./document.hwpx --format markdown --view structure
```

`--view structure`는 머리말·본문·꼬리말 정의, 표의 셀, 그림 메타데이터와 진단 상세를 구분하는 기존 구조 출력을 제공합니다. 출력 첫 부분의 `format`·`documentSHA256`과 `Paragraph s0:p3` 같은 실제 원문 ID를 확인하세요. HWP5 문단 번호는 구역 안에서 0부터, HWPX 문단 번호는 문서 전체에서 1부터 시작합니다. 출력 순서로 번호를 만들지 않습니다.

수정할 대상을 정하려면 이 구조 보기를 읽어 같은 원본의 ID·SHA를 얻습니다. 기본 문서 내용에는 이 편집 정보가 포함되지 않습니다. 두 보기는 같은 관측 모델과 공통 renderer를 사용하며 원본 파싱·편집·저장 모델을 바꾸지 않습니다. `0.1.0`의 보기 계약이며, 이전 설치분은 갱신한 뒤 `--help` 또는 MCP `tools/list`에서 제공 여부를 확인하세요.

## 여러 명시 파일 읽기

`read-many`는 `0.1.0`에 포함된 여러 명시 파일의 읽기 전용 명령입니다. 아래의 기본 `content`와 선택적 `structure` 보기 계약을 사용합니다. 이전 설치분은 갱신한 뒤 `--help` 또는 MCP `tools/list`에서 제공 여부를 확인하세요.

```bash
npx -y @ohah/hwpjs read-many ./one.hwp ./two.hwpx
npx -y @ohah/hwpjs read-many ./one.hwp ./two.hwpx \
  --format markdown --view content --concurrency 2 --max-output-bytes 8388608
```

입력은 사용자가 명시한 파일 1~128개입니다. 기본 출력은 `text`이며 `markdown`도 선택할 수 있습니다. 동시성은 기본 1, 최대 2입니다. 폴더를 자동 탐색하거나 파일을 자동으로 쓰지 않으며, 일괄 편집·이미지 추출·HTML 전용 변환 명령이 아닙니다.

기본 `content` 결과는 입력 순서로 파일 출처·본문과 읽기 실패, 성공·실패 개수를 보고합니다. 일부 파일이 실패해도 다른 파일의 성공 본문을 유지하며 종료코드는 1입니다. 기계 키·원문 SHA·원문 ID와 진단 상세가 필요하면 `--view structure`로 읽습니다. 후속 편집에는 해당 문서의 구조 보기에서 얻은 SHA와 ID를 각각 사용합니다.

`--max-output-bytes`는 UTF-8 보고서 출력 예산입니다. 기본은 4 MiB(`4194304`바이트), 상한은 16 MiB(`16777216`바이트)이며 문서 입력 크기나 전체 메모리 상한이 아닙니다. 본문을 잘라 성공으로 보고하지 않습니다. 예산을 넘는 항목은 실패로 남으며, 파일별 상태를 보고할 공간조차 부족하면 작업 전에 거부할 수 있습니다. 짧은 입력 거부 진단은 본문 보고서 예산과 구분합니다.

stdout 전달 오류가 나면 이미 전달한 내용이 있을 수 있습니다. `batchDelivery`와 읽기 성공·실패 진단을 확인하고 자동 재시도로 중복 전달하지 않습니다.

현재 공개 [브라우저 체험](../cli-simulation.mdx)의 단일 문서 읽기·편집·다운로드 검증은 이 배치 기능을 포함하지 않습니다. 실제 Node CLI 배치 실행과 MCP stdio 검증도 브라우저 체험과 구분합니다.

## 문서 정보 확인

```bash
npx -y @ohah/hwpjs info ./document.hwp
npx -y @ohah/hwpjs info ./document.hwpx --expect-sha256 "$SOURCE_SHA"
```

포맷·원문 SHA·바이트 크기·구역 수와 SDK에서 확인할 수 있는 버전·보호 관련 관측을 텍스트로 출력합니다. 확인하지 못한 값은 `unknown`과 사유로 남습니다. 문단·표·그림·페이지 전체 개수를 수집하는 명령이나 서명 유효성·암호 해제 가능성 검사로 해석하지 마세요. 특정 대상의 편집 가능 여부는 실제 편집 명령에서 네이티브 엔진이 다시 검사합니다.

`--expect-sha256`은 선택 사항입니다. 이전 관측과 같은 원본인지 확인하려면 출력에서 얻은 SHA를 넣으세요.

## 그림 목록과 추출

```bash
npx -y @ohah/hwpjs images ./document.hwpx
npx -y @ohah/hwpjs extract-images ./document.hwpx --output ./images-new
```

`images`는 원문 SHA와 각 그림 ID, 상태·사유·MIME·확장자·바이트 수 등을 출력합니다. 출력에 나온 ID는 해당 SHA의 스냅샷에만 유효합니다. 읽기 실패·미지원 항목도 목록에 남으며, 형식 이름이나 확장자만으로 원시 바이트를 신뢰하지 않습니다.

본문의 **이미지** 참조가 있으면 다음과 같이 추출할 수 있습니다.

```bash
npx -y @ohah/hwpjs extract-images ./document.hwpx \
  --ref "$IMAGE_REF" --output ./referenced-image-new
```

참조에 원문 SHA가 결속돼 있으므로 `--ref` 방식에는 `--id`나 `--expect-sha256`을 함께 전달하지 않습니다. 두 선택 방식의 혼용은 거부합니다. 이미지 외 종류의 참조는 이미지 추출에 사용할 수 없습니다.

기존 방식으로 목록에서 고른 한 ID만 추출하려면 같은 원본의 SHA도 지정합니다.

```bash
npx -y @ohah/hwpjs extract-images ./document.hwpx \
  --id "$IMAGE_ID" --expect-sha256 "$SOURCE_SHA" --output ./selected-images-new
```

CLI의 `--output`은 **새 디렉터리**입니다. 단일 파일 경로가 아닙니다. `--ref`나 `--id`로 단건을 선택해도 새 디렉터리를 만들고, 파일명은 `image-0001.png`처럼 생성합니다. 실제 확장자는 관측 결과에 따릅니다. 기존 ID 방식에서는 SHA가 필수이며, 참조 방식은 결속된 SHA를 검증합니다. 전체 추출은 선택 인수를 생략해도 한 번 열린 원본 스냅샷을 사용합니다. 결과는 생성한 파일의 호스트 경로·SHA이며 이미지 Content나 자동 OCR 결과가 아닙니다.

추출 범위는 구역에서 관측된 그림 참조인 `section-picture-sites`입니다. 마스터 페이지 그림·이미지 채우기·참조되지 않은 리소스는 포함하지 않습니다. 이미지 전체를 빠짐없이 추출하거나 기존 도구와 동일한 범위를 제공한다는 뜻이 아닙니다. OCR·이미지 변환도 수행하지 않습니다. 형식을 판별하지 못한 원시 데이터는 WMF/EMF 등을 포함해 변환 없이 `.bin`으로 보존합니다. 헤더로 형식을 인식했더라도 픽셀 디코딩의 유효성을 검증한 것은 아닙니다.

기존 출력과 symlink 경로는 거부하며 덮어쓰지 않습니다. 일부 추출이 실패하면 종료코드는 1이고 항목별 실패와 이미 게시된 파일의 영수증을 남깁니다. `completeWithinListedScope`는 이 제한된 목록 안의 완료 여부이며 문서 전체 이미지의 완전성을 뜻하지 않습니다. 파일을 게시하기 전 검증에서 거부돼도 새 빈 디렉터리가 남을 수 있습니다.

출력량 제한이나 보고 실패가 나면 상세 영수증 일부가 생략될 수 있으므로 `published`·게시 개수·위치와 생략 표시를 함께 확인하세요. 이미 생성된 파일은 실패 응답만으로 없어지지 않습니다. 같은 경로로 무조건 재시도하지 말고 결과를 확인한 뒤 새 경로를 사용하세요.

## 한 문단의 문자열 교체

먼저 `read --view structure`에서 얻은 원문 ID와 SHA를 사용합니다. 아래 ID·SHA·문자열은 대상 문서의 실제 값으로 바꾸세요.

```bash
npx -y @ohah/hwpjs edit ./document.hwpx \
  --target s0:p3 --replace '기존 내용' --with '수정 내용' \
  --expect-sha256 "$SOURCE_SHA" --output ./document-edited.hwpx
```

찾는 문자열은 선택한 문단에서 정확히 한 번 일치해야 합니다. 겹치는 중복 일치도 거부합니다. `--with ''`는 삭제이며 개행·제어 문자 삽입과 문단 경계를 넘는 교체는 지원하지 않습니다. 읽기에 보이는 문단이라도 네이티브 엔진의 보호·편집 범위 검사를 통과해야 합니다.

원본과 기존 출력 파일은 덮어쓰지 않습니다. 원본이 바뀌면 다시 읽어 새 SHA와 ID로 수정하세요. 저장 결과를 기본 읽기로 확인하고, 다음 편집에는 `read --view structure`에서 새 문서 SHA와 ID를 얻습니다.

HWP5는 저장된 줄 배치가 무효화되는 편집을 기본적으로 거부합니다. 이를 수용할 때만 `--allow-stale-layout`을 추가하세요. 이 옵션은 새 조판 결과를 만들지 않습니다. 저장 후 출력 스트림 오류가 나면 `published: true` 진단이 있을 수 있으므로 결과 파일을 확인하고 무조건 재실행하지 않습니다.

## 문단 원문 조회와 명시 작업 적용

표시 본문과 Native 편집 원문은 다릅니다. `read --view structure`에서 얻은 같은 원본의 SHA·문단 ID로 실제 원문을 조회합니다.

```bash
npx -y @ohah/hwpjs paragraph ./document.hwpx \
  --target "$TARGET_ID" --expect-sha256 "$SOURCE_SHA" --format text
```

출력의 `nativeTextUnits`는 UTF-16 길이입니다. `expectedText (JSON ASCII)` 아래 문자열은 CR·컨트롤·비ASCII·따옴표·역슬래시를 이스케이프한 JSON입니다. 이 JSON을 해석한 문자열을 작업의 `expectedText`·`expectedRangeText` 조건에 사용합니다. HWP5의 종결 CR을 삭제하거나 표시 본문의 이스케이프를 그대로 원문으로 넣지 않습니다. `displayText`나 서식 메타데이터를 관측하지 못하면 미관측으로 표시합니다.

`apply`는 `--patch FILE` 또는 `--operations JSON` 중 하나를 받고 같은 원본 SHA와 새 출력이 필수입니다. patch 파일은 명시 작업 배열이며 문서 전체 JSON 덤프가 아닙니다. 예를 들어, 구조 보기와 문단 조회로 `s0:p3`의 첫 네 단위가 실제로 `보도일시`임을 확인한 경우 다음 배열로 교체할 수 있습니다. 다른 문서는 실제 주소·범위·원문 조건으로 바꿉니다.

```json
[
  {
    "kind": "splice",
    "coordinates": "current-transaction",
    "section": 0,
    "paragraph": 3,
    "startUnit": 0,
    "endUnit": 4,
    "expectedRangeText": "보도일시",
    "text": "내용검증"
  }
]
```

```bash
npx -y @ohah/hwpjs apply ./document.hwpx --patch ./changes.json \
  --expect-sha256 "$SOURCE_SHA" --output ./applied-new.hwpx
```

`coordinates: "current-transaction"`은 모든 작업에 필수입니다. 뒤 작업은 앞 작업 이후의 실제 Native 문단·범위를 사용하며 문단 번호를 자동 보정하지 않습니다. 전체 배열의 타입·키·범위·예산을 먼저 검증하고, 실행 중 Native 원문 사전조건을 대조한 뒤 한 번 저장합니다. 마지막 작업이 실패해도 앞 작업만 적용한 파일을 게시하지 않습니다.

| 작업                                                                                | 지원 범위                                                      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `splice`, `replace-paragraph-ranges`                                                | 명시 범위 교체·여러 문단 교체                                  |
| `split-paragraph`, `merge-paragraph`                                                | 원문 조건을 확인한 문단 분할·병합                              |
| `character-properties`, `character-format`                                          | 크기·bold·italic의 sparse 속성 또는 기존 글자 모양 ID          |
| `paragraph-format`, `paragraph-alignment`, `paragraph-margins`, `paragraph-spacing` | 기존 문단 모양 ID·정렬·여백·간격                               |
| `cell-sizes`, `cell-styles`                                                         | 실제 원본 셀 소유자에 결속된 크기·테두리/채우기 등의 지원 배치 |
| `picture-resize`, `table-insert`                                                    | 실제 그림 크기 조정·관측 리소스로 표 생성                      |

| `created-table-grid` | 같은 세션에서 생성한 비병합 표의 행·열 추가·삭제 |

`created-table-grid`는 GitHub 개발 소스와 해당 optional ABI를 포함한 엔진에서 제공합니다. npm 0.1.1에 새 작업이 게시됐다는 뜻은 아닙니다.

이 15종은 임의 SDK 메서드 호출이나 모든 표 구조 편집을 뜻하지 않습니다. 지원하지 않는 속성·보호된 대상은 거부합니다. 기존 서식·리소스 ID·소유자 좌표를 추측하지 않습니다. 글자 크기 `size`는 1/100pt이며, 표·그림 길이는 Native 단위입니다. 생성한 표의 identity는 결과에 반환됩니다. 일반 `edit`의 한 문단 리터럴 교체는 그대로 유지합니다.

## 새 문서 생성

```bash
npx -y @ohah/hwpjs create --format hwpx \
  --text-file ./body.txt --output ./created-new.hwpx
```

`--format hwp5|hwpx`와 새 출력은 필수이며 `--text-file`을 생략하면 Native 빈 문서를 만듭니다. 초기 본문은 UTF-8 텍스트 파일이며 CRLF/CR은 문단 경계로 정규화합니다. 빈 문단과 끝 빈 문단·Unicode를 유지하고 임의 제어문자는 거부합니다. 본문은 4MiB·최대 4096문단 범위입니다. 샘플 원본을 템플릿으로 복사하지 않습니다.

HWP5 초기 텍스트 저장이 조판 갱신을 요구하면 기본적으로 거부합니다. 사용자가 저장된 줄 배치 무효화를 수용한 경우에만 `--allow-stale-layout`을 명시합니다. 이 옵션은 새 조판을 만들지 않습니다.

## 명시 text-only 교차 변환

```bash
npx -y @ohah/hwpjs convert ./document.hwp --to hwpx \
  --loss-policy text-only --output ./converted-new.hwpx
```

이는 관측한 본문 문자열·빈 문단·Unicode를 타형식 새 문서로 재생성하는 손실 있는 변환입니다. 표의 셀 본문은 관측 순서로 평탄화하고 **표 구조·서식·그림·차트·수식·OLE·머리말/꼬리말·페이지 설정·메타데이터를 보존하지 않습니다.** 원본은 유지하고 결과의 미보존 보고를 확인합니다.

기본 `--loss-policy reject`는 전체 보존 변환이 미구현이므로 `UnsupportedDocumentConversion`과 보고를 반환하고 새 파일을 만들지 않습니다. text-only로 자동 대체하지 않습니다. 같은 형식 요청과 미관측·미배치 본문은 거부하며, HWP5 출력의 조판 허용도 별도 명시가 필요할 수 있습니다. 이 읽기 뷰는 HTML/PDF·완전한 원본 조판·무손실 교차 변환이 아닙니다. 별도 의미 HTML 파일 내보내기는 아래 신규 명령을 따릅니다.

## 그림의 로컬 OCR

다음 미배포 보안 후보는 OCR 자식에게 모델 경로·언어·시스템 설정만 전달하고 인증·실행기 주입 환경변수는 전달하지 않습니다. 직접 CLI의 `--executable` 선택은 유지합니다.

```bash
npx -y @ohah/hwpjs ocr ./document.hwpx \
  --ref "$IMAGE_REF" --provider tesseract --languages kor+eng
```

`--ref`는 실제 이미지 참조이며 생략하면 관측 범위의 구역 그림들을 처리합니다. 기본 제공자는 `tesseract`이며 로컬 실행 파일과 요청 언어 데이터가 있어야 합니다. `--executable PATH`로 Tesseract 실행 파일을 명시할 수 있습니다. macOS에서는 `--provider vision`을 명시해 OS 로컬 Vision을 사용할 수 있으며 이 제공자의 실행 파일은 바꾸지 않습니다.

제공자나 언어 데이터가 없으면 `ProviderUnavailable`로 보고하며 다른 제공자로 자동 전환하지 않습니다. 외부 서버 업로드·자동 다운로드·원본 자동 수정은 수행하지 않습니다. 일부 그림 실패와 실제 빈 인식 결과는 구분하고 성공한 텍스트도 함께 남깁니다. 바탕쪽·이미지 브러시·페이지 전체 렌더링·차트/수식 래스터화는 이 OCR의 범위가 아닙니다.

기존 로컬 Vision의 한국어·영어 이미지/문서 실행 증거와 새 설치의 제공자 부재 거부를 구분합니다. 실제 Tesseract 인식의 양성 사례는 아직 검증하지 않았습니다. 기본 `read`는 OCR을 실행하지 않습니다.

## 한도와 공통 기능 범위

문서 입출력은 각각 64 MiB, WASM 입력은 32 MiB로 제한됩니다. 이미지 참조는 최대 4096개, 수집기에서 허용하는 개별 이미지 바이트는 8 MiB, 보관하는 고유 이미지 바이트와 추출 게시 총량은 각각 32 MiB입니다. HWPX는 네이티브에서 최대 64 MiB 복사가 선행될 수 있어 개별 이미지의 8 MiB 검사가 전체 메모리 상한을 뜻하지는 않습니다.

읽기·편집·저장·변환·이미지를 공통 엔진/API로 연결하는 방향이며, 지원 여부는 각 명령의 실제 관측 범위로 구분합니다. 문자열 `edit`와 명시 `apply`·`create`·`convert`·`ocr`는 서로 다른 범위입니다. 공개 npm 0.1.0에는 표 전체 삭제와 그림 삽입·교체가 없습니다. 현재 소스에는 별도 파일 명령이 추가됐으며 아래의 배포 세대 구분을 따릅니다. 임의 표 행/열 구조 변경·차트/수식 래스터화·OLE 원시 추출·전체 의미 보존 변환까지 지원한다는 뜻은 아닙니다. 빈 문서에서 누리 문서 전체를 동일하게 재생성하는 작업도 완료되지 않았습니다. [MCP 도구](./mcp.md)도 같은 파일·SHA·추출 경계를 사용합니다. 기존 [Skill](./skill.md) 안내와 배포된 자산은 별도로 동결된 세대일 수 있으므로 새 명령이 자동 추가됐다고 가정하지 마세요.

## 새 파일의 표 삭제·그림 삽입·의미 HTML

아래 새 파일 명령은 `@ohah/hwpjs@0.1.1`에 포함됩니다. 이전 0.1.0에는 없으므로 설치 버전과 `--help`를 확인하세요. 패키지에는 필요한 Native WASM이 포함됩니다. 저장소 소스에서 실행할 때는 준비한 의존성과 명시 WASM을 사용합니다. 제한과 게시·오류 계약은 [문서 파일 변환 계약](https://github.com/ohah/hwpjs/blob/main/docs/document-file-transforms.md)이 소유합니다.

표 삭제·그림 삽입 예시의 `$WASM`은 신규 선택 ABI를 포함한 통합 후보입니다. 공개 npm 0.1.0의 기존 WASM820에는 신규 export 8개가 없으므로 현재 소스만 바꿔 실행하면 표 삭제·그림 삽입이 `ABIUnavailable`로 거부될 수 있습니다. 후보 경로·SHA가 확정된 뒤 명시해 사용합니다. 의미 HTML의 읽기 경로는 신규 구조 편집 ABI를 요구하지 않아 기존 WASM820도 사용할 수 있습니다.

`TABLE_REF`는 같은 원본의 실제 표 참조, `TARGET`·`SOURCE_SHA`는 구조 보기의 ID와 SHA, `RAW_TEXT`는 `paragraph`로 조회한 Native 편집 원문입니다. 아래 변수는 각각의 관측값으로 설정하고 출력은 없는 새 경로를 사용하세요. 폭·높이는 HWPUNIT이며 1~2147483647, `unit`은 U32 범위의 UTF-16 좌표입니다. 범위 안 정수라도 실제 위치의 편집 가능성은 서비스가 판정합니다.

```bash
bun run cli delete-table ./input.hwpx --ref "$TABLE_REF" \
  --output ./without-table.hwpx --allow-stale-layout --wasm "$WASM"
bun run cli insert-image ./input.hwpx --target "$TARGET" --unit 0 \
  --expect-text "$RAW_TEXT" --expect-sha256 "$SOURCE_SHA" \
  --image ./picture.png --width 7200 --height 3600 \
  --output ./with-picture.hwpx --allow-stale-layout --wasm "$WASM"
bun run cli export-html ./input.hwpx --output ./document.html \
  --embed-images supported --wasm "$WASM"
```

`--expect-text`에는 argv 제약 때문에 NUL을 전달할 수 없습니다. 원문을 잘라 맞추지 말고 NUL 없는 일반 본문을 선택합니다. CR은 실제 문자열로 전달할 수 있습니다. `secPr` NUL이 있는 첫 문단 등은 다른 지원 대상을 선택하거나 MCP 인프로세스·공통 서비스를 검토하며, 실제 삽입 허용과 1Mi 원문 제한은 [공통 계약](https://github.com/ohah/hwpjs/blob/main/docs/document-file-transforms.md)을 따릅니다.

표 전체 삭제는 셀 글자 비우기와 다릅니다. 그림 삽입은 필드 없는 구역의 plain 최상위 본문 문단에 새 인라인 PNG/JPEG 하나를 넣는 범위입니다. 구역 내 필드가 있으면 문단 중간도 `ProtectedFieldRange`로 거부하며, 이미 개체가 있는 문단·표 셀·글상자 삽입은 지원하지 않습니다. HWP5 접두 구조 예외와 링크 검증은 공통 계약을 따릅니다. 새 조판·미리보기 완료를 뜻하지 않습니다. HTML은 관측한 의미 구조의 파일 출력으로, `read --format markdown`이나 `convert --to hwpx`의 별칭이 아닙니다. 원본 서식·페이지 배치의 동등성이나 과거 Rust HTML 변환기의 동등 지원을 주장하지 않습니다.

### 기존 그림 교체와의 구분

0.1.1의 `replace-image`는 같은 원본의 이미지 참조로 기존 그림을 교체하는 별도 기능입니다. 이전 0.1.0에는 없습니다.

```bash
bun run cli replace-image ./input.hwpx --ref "$IMAGE_REF" \
  --image ./replacement.png --output ./replaced.hwpx --wasm "$WASM"
```

이 파일 명령들은 원본을 덮어쓰지 않고 새 파일을 만듭니다. 현재 웹 UI나 열린 헤드리스 세션의 undo/redo에 연결됐다는 뜻은 아니며 기존 편집기는 저장 결과를 별도로 다시 열어야 합니다. 현재 지원 제한은 [공통 계약](https://github.com/ohah/hwpjs/blob/main/docs/document-file-transforms.md)을 따릅니다.

## 원본 표 행·열 파일 편집 (소스 후보)

현재 소스 CLI에는 `edit-table-grid`가 추가되어 있습니다. 공개 npm 0.1.1의 지원 범위와 구분합니다.

```sh
bun run cli edit-table-grid ./input.hwpx --ref "$TABLE_REF" \
  --action insert-row --index 2 --rows 2 --columns 3 \
  --output ./grid-edited.hwpx --allow-stale-layout --layout spec6 \
  --wasm /absolute/path/candidate.wasm
```

`--action`은 `insert-row`, `delete-row`, `insert-column`, `delete-column` 중 하나입니다. `--ref`는 같은 원본의 구조 보기에서 발급한 표 참조이며 원본 SHA 조건을 포함합니다. `--rows`·`--columns`는 현재 표의 예상 크기(1~4294967295)입니다. `--index`는 0부터 시작하며 삽입은 해당 축 크기까지, 삭제는 크기 미만까지 허용합니다. 마지막 행·열 삭제와 U32 최대 크기의 축 삽입은 거부합니다. 실제 표 지원 여부와 예상 크기 일치는 서비스가 검사합니다.

HWP5와 HWPX 모두 `--allow-stale-layout`이 필수이며 결과는 `layoutRequiresReflow: true`, `previewStale: true`입니다. 선택 `--layout`은 `spec6` 또는 HWP5 전용 `observed8`이며 생략하면 서비스 기본값을 사용합니다. 기존 원본·출력을 덮어쓰지 않고 새 파일 게시 영수증에 출력 경로·SHA·원본 SHA를 보고합니다. 이 연결의 집중 검증은 주입 서비스를 이용한 CLI·공식 MCP 전송 검사이며 실제 Native 저장 검증은 별도입니다.

## 문자 글머리표 정의 작업

이 연산은 **현재 GitHub 구현 기준**이며 npm 릴리스에 포함됐다는 뜻이 아닙니다. 공개 설치 이름은 `npm install @ohah/hwpjs`이며 아래 호출에는 이 기능과 대응 WASM을 포함한 빌드가 필요합니다. 별도 CLI 패키지는 설치하지 않습니다.

기존 `hwpjs apply`와 `--patch`의 배열에 다음 연산을 넣습니다. `section`과 `paragraph`는 `hwpjs read INPUT --view structure`와 `hwpjs paragraph INPUT --target s0:p2`로 확인한 Native 원본 주소입니다. API 플레이그라운드의 화면 문단 번호와 혼용하지 마세요.

```json
[
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
```

이 배열을 `bullet-changes.json`으로 저장하고 구조 보기의 실제 SHA를 사용합니다.

```sh
hwpjs apply ./document.hwpx --patch ./bullet-changes.json \
  --expect-sha256 ACTUAL_DOCUMENT_SHA256 --output ./document-with-bullet.hwpx
```

동일 연산의 수정은 `edit.mode: "update"`와 실제 기존 `edit.id`를 지정하며 definition 전체를 보냅니다. `apply: false`는 정의만 바꾸고, 수정은 같은 ID를 사용하는 모든 문단에 영향을 줍니다. 선택적 `expectedText`는 기존 Native 원문 조건입니다. `charShapeId: 4294967295`는 본문 글자 모양 상속이며 새 글자 모양을 생성하지 않습니다. HWP5도 같은 연산을 사용합니다. HWP5의 원본 Native 문단은0부터, HWPX는1부터이며 자동으로1을 더하거나 빼지 않습니다. HWP5의 BMP 문자와 signed HWPUNIT16 범위는 Native에서 검사합니다. 구형 writer 없는 WASM은 definitionWriter 게이트에서 거절합니다. 전체 작업 검증과 순차 Native 실행·저장·종료가 성공해야 새 출력이 게시됩니다. 후행 연산 실패 시 출력 파일을 만들지 않으며 원본·기존 출력의 덮어쓰기도 거절합니다.

## 원본 셀 나누기

다음은 **현재 GitHub 구현 기준**이며 npm 게시 버전의 지원을 뜻하지 않습니다. 설치 이름은 `npm install @ohah/hwpjs`이고, 실행에는 이 기능과 대응 WASM을 포함한 빌드가 필요합니다. 기존 단일 패키지의 `hwpjs apply`를 사용합니다.

먼저 같은 원본에서 `hwpjs read ./document.hwpx --view structure`를 실행해 문서 SHA와 원하는 표의 `hwpjs-object:…/table/…` reference를 복사합니다. 아래 배열을 `split-cells.json`에 저장하고 reference를 실제 값으로 바꿉니다.

```json
[
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
```

```sh
hwpjs apply ./document.hwpx --patch ./split-cells.json \
  --expect-sha256 ACTUAL_DOCUMENT_SHA256 --output ./document-split.hwpx \
  --allow-stale-layout
```

`expectedRows`/`expectedColumns`는 현재 표 전체의 실제 격자입니다. `top`/`left`는0부터, `bottom`/`right`는 미포함 끝이므로 예제는 왼쪽 위 물리 셀 하나를2줄3칸으로 나눕니다. 두 축의 개수는 각각1~63이며1×1은 거절합니다. `mode: "each"`는 선택한 각 물리 셀을 나누고, `"merge-then-split"`은 물리 셀 둘 이상의 직사각형을 합친 뒤 나눕니다. 병합된 셀은 전체 span을 포함해야 합니다. Native node 번호나 binding을 직접 넣지 않습니다.

HWPX는 위 경로를 지원하며 높이 유지의 일부 요청은 Native에서 거절할 수 있습니다. HWP5는 파일 확장자를 `.hwp`로 바꾸고 같은 연산을 사용하되 표 전체가 비병합·선택 물리 셀 하나·`mode: "each"`·`equalizeRows: true`인 현재 profile만 지원합니다. H497의 외곽 선언과 셀 크기 합이 다른 HWP5 입력은 `UnsupportedSourceTableGrid`로 계속 거절하며 연결 도구가 원본 크기를 보정하지 않습니다.

reference는 첫 변경 전의 원본과 Native binding에 묶습니다. 같은 batch의 앞선 편집 후 이를 현재 숫자 주소로 다시 해석하지 않으며 `StaleSourceTableSplitReference`로 전체 파일 transaction을 거절합니다. 서로 다른 표에 대한 연속 나누기도 첫 변경 뒤에는 새 파일로 저장하고 구조 보기에서 새 SHA/reference를 받아 다시 요청하세요. 후행 오류에는 부분 출력 파일을 만들지 않으며 입력·기존 출력도 덮어쓰지 않습니다. `layoutRequiresReflow: true`는 조판이 필요하다는 뜻으로, 저장·재열기 성공과 화면 재조판 완료를 구분합니다.

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

`--operations`에 다음 배열을 JSON 문자열로 전달합니다. 기존 --patch는 {"version":1,"operations":[...]} envelope를 사용합니다.

```json
[
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
```

```sh
hwpjs apply ./document.hwpx --patch ./character-patch.json \
  --expect-sha256 EXACT_INPUT_SHA256 --output ./character-changed.hwpx \
  --allow-stale-layout --wasm /absolute/path/current-engine.wasm
```

character-patch.json은 `{"version":1,"operations":[위 연산 객체]}` 형식입니다.

`size`는 1/100pt이며1900은19pt입니다. `textColor`는 `#RRGGBB`이고 기존 SDK RGB24 codec을 사용합니다. `underline`은 HWP5 none/bottom/top, HWPX none/bottom/center/top입니다. `fontName`의 language는 hangul/latin/hanja/japanese/other/symbol/user 중 하나이고 이름을 임의 정규화하거나 다른 언어까지 변경하지 않습니다. 글꼴 파일 설치·문자 fallback은 이 쓰기 범위가 아닙니다. 각 optional 값의 null/생략은 기존 값 보존입니다. Native의 unknown/unavailable 관측은 검정색·기본 글꼴로 바꾸지 않으며 해당 대상이 쓰기 불가하면 원래 사유로 거절합니다.

좌표는 Native 원본 UTF-16 단위로, HWP5 문단0부터/HWPX 문단1부터이며 CLI가1을 더하거나 빼지 않습니다. 예제의 paragraph2와 SAM은 합성 입력의 예시일 뿐입니다. 실제 `hwpjs paragraph INPUT --target s0:p2`로 본문·주소를 확인하고 정확한 expectedRangeText를 지정합니다. 확장 서식은 비어 있지 않은 최상위 body 범위만 지원합니다. 셀·각주 등으로 확대하지 않습니다.

현재 후보는 확장 서식 앞에 구조·텍스트 변경이 있는 batch를 StaleCharacterExtensionTarget으로 거절합니다. 같은 본문의 다른 문단이 동일 숫자 슬롯을 차지해도 자동 재대상화하지 않습니다. 서식만 바꾸는 선행 연산과 여러 확장 연산은 기존 Native owner/lineage/session·비되감기 serial을 검증하며 순차 실행합니다. 외부 binding/ref를 입력으로 받지 않고 쓰기 직전 같은 SDK에서 새 binding/target 쌍을 얻습니다.

전체 입력·ABI·요청 필드·현재 대상 입장 검사 후 기존 lazy history V2를 사용합니다. Native 쓰기/후행 연산/저장/종료 중 실패하면 새 출력 파일을 게시하지 않습니다. Native의 uncertain/cleanup/refresh 오류를 재시도하지 않습니다. 성공 operationResults에는 Native before/after 관측을 그대로 담고 known/mixed/unknown/unavailable 상태를 바꾸지 않습니다. size/bold/italic만 쓰는 기존 경로는 확장 ABI를 요구하지 않습니다.

## HWP5/HWPX 편집 용지 변경

이 연산을 포함한 빌드 기준이며 npm 게시 버전의 지원을 뜻하지 않습니다. `@ohah/hwpjs` 단일 패키지에 해당 형식의 page-settings optional Native writer가 필요합니다. HWP5/HWPX 모두 같은 연산을 사용하며 구형 엔진은 `PageSettingsWriteUnavailable`로 첫 변경 전에 거절합니다.

`page-changes.json`에 다음 전체 배열을 저장합니다. 예제의 구역0은 명시 입력이며 자동 선택 기본값이 아닙니다.

```json
[
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
```

```sh
hwpjs apply ./document.hwpx --patch ./page-changes.json \
  --expect-sha256 EXACT_INPUT_SHA256 --output ./page-changed.hwpx \
  --allow-stale-layout --wasm /absolute/path/page-settings-engine.wasm
```

모든 치수는 원본 HWPUNIT 정수입니다. 단위 변환이나 방향에 따른 width/height 교환을 하지 않습니다. `narrowly`는 가로, `widely`는 세로이며 원본 축은 유지합니다. 값·여백의 모든 필드는 필수이고, 내용 영역의 유효성은 기존 SDK와 Native가 검증합니다.

`scope: "section"`에는 0부터 시작하는 명시 `section`이 필수입니다. `scope: "document"`는 `section` 키를 생략하고 모든 구역을 한 번에 처리하며 미지원 구역을 건너뛰지 않습니다. 호출자가 binding·node index·expected snapshot을 직렬화해 전달하지 않습니다. 공통 서비스가 같은 살아 있는 SDK에서 현재 capability를 얻습니다. 전체 batch의 입력·ABI·대상 입장 검사를 먼저 수행하며, 후행 실행·저장·종료 실패 시 결과 파일을 게시하지 않습니다. 원본이나 기존 출력 덮어쓰기도 거절합니다. 편집 후 조판을 다시 계산해야 합니다.

HWP5는 위 예제의 입력·출력 확장자를 `.hwp`로 바꿔 같은 `page-settings` 연산을 사용합니다. 치수는 HWPUNIT 정수(7200=25.4mm)이며 width/height 저장 축을 전치하지 않습니다. 공용 widely는 세로, narrowly는 가로입니다. HWP5의 raw orientation 이름과는 SDK에서 명시 변환하므로 CLI/MCP가 raw flags를 만들지 않습니다.

`scope: "document"`는 현재 구역 모두가 지원되어야 하며 미지원 구역을 건너뛰지 않습니다. `scope: "section"`은 명시한0기준 구역만 대상으로 합니다. Native binding·expected snapshot·targets는 외부 입력으로 받지 않고 같은 살아 있는 SDK에서 admission 및 각 쓰기 직전에 다시 조회합니다. 앞선 편집 뒤 이전 node index를 재사용하지 않습니다.

구형 ABI는 선행 작업이 있어도 history/write/save 전에 거절합니다. 후행 Native 오류·불확실 완료·cleanup/close 실패는 새 출력을 게시하지 않습니다. HWP5 변경 저장에는 기존 `allowStaleLayout` 동의가 필요하며 이 옵션은 전체 조판 완료를 뜻하지 않습니다. 원본·기존 출력은 덮어쓰지 않습니다.

## 폼 상태 변경

현재 GitHub 구현 기준이며 npm 릴리스 지원 표시가 아닙니다. 단일 패키지 설치 이름은 `npm install @ohah/hwpjs`입니다. 해당 CLI와 optional Native 기능을 함께 포함한 빌드에서 사용합니다.

```sh
hwpjs read ./input.hwp --view structure
hwpjs info ./input.hwp
# 위 조회에서 얻은 documentSHA256과 checkbox form reference를 그대로 지정합니다.
hwpjs apply ./input.hwp --expect-sha256 "$SHA" \
  --operations "[{\"kind\":\"form-checkbox-state\",\"coordinates\":\"current-transaction\",\"reference\":\"$CHECK_REF\",\"expectedState\":\"UNCHECKED\",\"state\":\"CHECKED\"}]" \
  --output ./checked.hwp --allow-stale-layout
```

현재 GitHub 구현은 HWP5와 HWPX 모두 체크박스·라디오 선택·편집/콤보 텍스트를 연결합니다. 라디오는 `form-radio-select`에 `expectedState`와 `expectedGroupName`을, 폼텍스트는 `form-text`에 `expectedText`와 `text`를 지정합니다. 텍스트는 UTF-16 최대65535단위이며 기존 전체 요청 예산도 적용합니다. HWPX 라디오·폼텍스트는 새 optional Native getter/writer가 있어야 하며 구형 엔진은 쓰기 전에 명시 거절합니다. 라디오는 같은 이름의 문서 전체 그룹에서 하나만 선택하고 스타일·글꼴·원본 폼 속성은 보존합니다.

폼 reference는 원본 SHA·형식·구역·Native source identity에 묶이며 숫자 formNode를 입력하지 않습니다. 저장된 새 파일에서는 다시 조회합니다. 폼보다 앞선 비폼 연산은 이 후보의 수명 계약에서 거절합니다. 후행 실패 시 앞선 세션 변경도 파일로 게시하지 않습니다. GUI 조판 갱신이나 열린 세션 undo를 뜻하지 않습니다.

새 파일에서 다시 읽은 form reference를 같은 `apply`/MCP `apply_document_changes` 스키마에 사용합니다. 다음은 원본 조회가 `UNCHECKED`, 그룹명이 `Group A`, 텍스트가 `old`였던 경우입니다.

```json
{
  "operations": [
    {
      "kind": "form-radio-select",
      "coordinates": "current-transaction",
      "reference": "FORM_REFERENCE_FROM_READ",
      "expectedState": "UNCHECKED",
      "expectedGroupName": "Group A"
    },
    {
      "kind": "form-text",
      "coordinates": "current-transaction",
      "reference": "TEXT_FORM_REFERENCE_FROM_READ",
      "expectedText": "old",
      "text": "새 값"
    }
  ]
}
```

`@ohah/hwpjs` 단일 패키지의 설치·CLI/MCP 호출 방법은 위 설명을 따릅니다. 위 기능은 현재 GitHub 구현 기준이며 npm 버전 출시를 뜻하지 않습니다.
