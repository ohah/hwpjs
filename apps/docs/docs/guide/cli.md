# CLI로 원본 읽기·정보 확인·이미지 추출·편집

HWP5와 HWPX 원본을 읽고 정보를 확인하거나, 관측된 그림을 추출하고 한 문단의 문자열을 바꿔 새 문서로 저장합니다. 읽기에서는 머리말·본문·꼬리말, 표의 셀, 이미지 메타데이터를 구분하며 미관측 텍스트와 소속을 확인하지 못한 개체를 경고로 남깁니다.

[브라우저 체험](../cli-simulation.mdx)은 로컬 Node CLI 실행과 별개입니다. 페이지가 사용자의 로컬 파일 시스템이나 설치된 CLI를 대신 실행하지는 않습니다.

## 설치 상태와 로컬 패키지

새 CLI가 포함된 `@ohah/hwpjs`는 npm 게시 전의 로컬 패키지 후보입니다. 기존 npm 패키지를 설치했다고 아래 명령이 모두 포함되는 것은 아닙니다. [현재 게시 상태](./package-names.md)를 확인하세요.

`info`·`images`·`extract-images`가 포함된 새 로컬 패키지에서 설치 후 CLI/MCP의 두 형식 조회·추출을 확인했습니다. 앞선 패키지나 동결된 Skill 자산이 자동 갱신되는 것은 아니며, 공개 npm 게시·배포 완료와도 구분합니다.

Node.js 24.20 이상과 새 CLI·WASM을 포함한 로컬 tarball을 준비했다면 다음과 같이 설치합니다. 경로는 실제로 전달받거나 빌드한 파일로 바꾸세요. 이 명령은 npm 공개 버전의 존재를 뜻하지 않습니다.

```bash
npm install --ignore-scripts /absolute/path/to/hwpjs-candidate.tgz
npx --no-install hwpjs --help
```

저장소에서는 의존성을 준비한 작업 사본과 명시한 WASM을 사용합니다.

```bash
bun run cli read ./document.hwp --wasm /absolute/path/to/hwpjs.wasm
```

빌드된 CLI의 기본 WASM은 실행 파일 옆의 `hwpjs.wasm`입니다. `--wasm PATH`로 다른 파일을 명시할 수 있으며 상대 경로는 현재 작업 디렉터리 기준입니다. CLI 도움말은 문서나 WASM 없이 볼 수 있습니다.

## 논리 구조 읽기

```bash
npx --no-install hwpjs read ./document.hwp
npx --no-install hwpjs read ./document.hwpx --format markdown
```

출력 첫 부분의 `format`과 `documentSHA256`을 확인하세요. 이후 `Paragraph s0:p3` 같은 원문 ID와 읽기용 표시 텍스트가 이어집니다. HWP5 문단 번호는 구역 안에서 0부터 시작하고, HWPX 문단 번호는 문서 전체에서 1부터 시작합니다. 출력 순서로 번호를 새로 만들지 않습니다.

`text`가 기본값이며 `markdown`도 같은 논리 뷰입니다. 전용 문서 변환기의 서식·이미지 포함 Markdown 출력과는 구분합니다. 기존 Rust 변환기의 출력 문자열·옵션·함수 이름을 그대로 재현하는 계약도 아닙니다. HTML·PDF 변환이나 시각적 페이지 재현, 문서 전체 JSON 변환을 제공하는 명령은 아닙니다.

## 문서 정보 확인

```bash
npx --no-install hwpjs info ./document.hwp
npx --no-install hwpjs info ./document.hwpx --expect-sha256 "$SOURCE_SHA"
```

포맷·원문 SHA·바이트 크기·구역 수와 SDK에서 확인할 수 있는 버전·보호 관련 관측을 텍스트로 출력합니다. 확인하지 못한 값은 `unknown`과 사유로 남습니다. 문단·표·그림·페이지 전체 개수를 수집하는 명령이나 서명 유효성·암호 해제 가능성 검사로 해석하지 마세요. 특정 대상의 편집 가능 여부는 실제 편집 명령에서 네이티브 엔진이 다시 검사합니다.

`--expect-sha256`은 선택 사항입니다. 이전 관측과 같은 원본인지 확인하려면 출력에서 얻은 SHA를 넣으세요.

## 그림 목록과 추출

```bash
npx --no-install hwpjs images ./document.hwpx
npx --no-install hwpjs extract-images ./document.hwpx --output ./images-new
```

`images`는 원문 SHA와 각 그림 ID, 상태·사유·MIME·확장자·바이트 수 등을 출력합니다. 출력에 나온 ID는 해당 SHA의 스냅샷에만 유효합니다. 읽기 실패·미지원 항목도 목록에 남으며, 형식 이름이나 확장자만으로 원시 바이트를 신뢰하지 않습니다.

목록에서 고른 한 ID만 추출하려면 같은 원본의 SHA도 지정합니다.

```bash
npx --no-install hwpjs extract-images ./document.hwpx \
  --id "$IMAGE_ID" --expect-sha256 "$SOURCE_SHA" --output ./selected-images-new
```

CLI의 `--output`은 **새 디렉터리**입니다. 단일 파일 경로가 아닙니다. `--id`를 지정해도 새 디렉터리를 만들고, 파일명은 `image-0001.png`처럼 생성합니다. 실제 확장자는 관측 결과에 따릅니다. ID를 지정하면 SHA가 필수이며, 전체 추출은 SHA를 생략해도 한 번 열린 원본 스냅샷을 사용합니다.

추출 범위는 구역에서 관측된 그림 참조인 `section-picture-sites`입니다. 마스터 페이지 그림·이미지 채우기·참조되지 않은 리소스는 포함하지 않습니다. 이미지 전체를 빠짐없이 추출하거나 기존 도구와 동일한 범위를 제공한다는 뜻이 아닙니다. OCR·이미지 변환도 수행하지 않습니다. 형식을 판별하지 못한 원시 데이터는 WMF/EMF 등을 포함해 변환 없이 `.bin`으로 보존합니다. 헤더로 형식을 인식했더라도 픽셀 디코딩의 유효성을 검증한 것은 아닙니다.

기존 출력과 symlink 경로는 거부하며 덮어쓰지 않습니다. 일부 추출이 실패하면 종료코드는 1이고 항목별 실패와 이미 게시된 파일의 영수증을 남깁니다. `completeWithinListedScope`는 이 제한된 목록 안의 완료 여부이며 문서 전체 이미지의 완전성을 뜻하지 않습니다. 파일을 게시하기 전 검증에서 거부돼도 새 빈 디렉터리가 남을 수 있습니다.

출력량 제한이나 보고 실패가 나면 상세 영수증 일부가 생략될 수 있으므로 `published`·게시 개수·위치와 생략 표시를 함께 확인하세요. 이미 생성된 파일은 실패 응답만으로 없어지지 않습니다. 같은 경로로 무조건 재시도하지 말고 결과를 확인한 뒤 새 경로를 사용하세요.

## 한 문단의 문자열 교체

먼저 읽기에서 얻은 원문 ID와 SHA를 사용합니다. 아래 ID·SHA·문자열은 대상 문서의 실제 값으로 바꾸세요.

```bash
npx --no-install hwpjs edit ./document.hwpx \
  --target s0:p3 --replace '기존 내용' --with '수정 내용' \
  --expect-sha256 "$SOURCE_SHA" --output ./document-edited.hwpx
```

찾는 문자열은 선택한 문단에서 정확히 한 번 일치해야 합니다. 겹치는 중복 일치도 거부합니다. `--with ''`는 삭제이며 개행·제어 문자 삽입과 문단 경계를 넘는 교체는 지원하지 않습니다. 읽기에 보이는 문단이라도 네이티브 엔진의 보호·편집 범위 검사를 통과해야 합니다.

원본과 기존 출력 파일은 덮어쓰지 않습니다. 원본이 바뀌면 다시 읽어 새 SHA와 ID로 수정하세요. 저장 결과를 다시 읽으면 다음 작업에 사용할 새 문서 SHA를 얻을 수 있습니다.

HWP5는 저장된 줄 배치가 무효화되는 편집을 기본적으로 거부합니다. 이를 수용할 때만 `--allow-stale-layout`을 추가하세요. 이 옵션은 새 조판 결과를 만들지 않습니다. 저장 후 출력 스트림 오류가 나면 `published: true` 진단이 있을 수 있으므로 결과 파일을 확인하고 무조건 재실행하지 않습니다.

## 한도와 공통 기능 범위

문서 입출력은 각각 64 MiB, WASM 입력은 32 MiB로 제한됩니다. 이미지 참조는 최대 4096개, 수집기에서 허용하는 개별 이미지 바이트는 8 MiB, 보관하는 고유 이미지 바이트와 추출 게시 총량은 각각 32 MiB입니다. HWPX는 네이티브에서 최대 64 MiB 복사가 선행될 수 있어 개별 이미지의 8 MiB 검사가 전체 메모리 상한을 뜻하지는 않습니다.

읽기·편집·저장·변환·이미지를 공통 엔진/API로 연결하는 방향이며, 지원 여부는 각 명령의 실제 관측 범위로 구분합니다. 표 구조·셀 크기·이미지 교체·새 문서 작성은 현재 문자열 편집 명령의 범위가 아닙니다. [MCP 도구](./mcp.md)도 같은 파일·SHA·추출 경계를 사용합니다. 기존 [Skill](./skill.md) 안내와 배포된 자산은 별도로 동결된 세대일 수 있으므로 새 명령이 자동 추가됐다고 가정하지 마세요.
