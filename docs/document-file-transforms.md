# 문서 파일의 구조 변경과 의미 HTML 내보내기

이 문서는 `delete-table`, `insert-image`, `export-html`의 CLI·MCP 파일 호스트 계약을 소유합니다. 문서 파싱·구조 변경·저장은 공통 메모리 서비스가, 파일 읽기·경로 검증·새 파일 게시와 영수증은 호스트가 소유합니다. 형식별 SDK나 파서를 호스트에 복제하지 않습니다.

## 배포 세대와 호출 경계

공개 npm `@ohah/hwpjs@0.1.0`은 이미 게시됐지만 이 세 신규 기능은 포함하지 않습니다. 이 문서의 명령은 현재 개발 소스의 계약이며, 설치 패키지에서 사용하려면 해당 소스가 포함된 후속 배포가 필요합니다. `--help`와 MCP `tools/list`로 실행 중인 세대를 확인합니다. 개발 소스 검사를 npm 설치본·배포된 웹·실기기 검증으로 읽지 않습니다.

표 삭제·그림 삽입 예시의 `$WASM`은 신규 구조 편집용 선택 export 8개를 포함한 **새 통합 후보 WASM**의 경로입니다. 공개 npm 0.1.0에 담긴 기존 WASM(`82031994…`)에는 이 export가 없습니다. 현재 소스만 checkout하고 기존 기본 WASM을 그대로 사용하면 표 삭제·그림 삽입은 `ABIUnavailable`로 거부될 수 있습니다. 통합 후보의 정확한 경로·SHA는 통합 검증에서 확정하며, 확정 전에는 기존 WASM을 호환 후보로 대체하지 않습니다. `--help`·도구 목록에 명령이 보이는 것과 선택 ABI가 실제 제공되는 것은 별개입니다. 의미 HTML 읽기 경로는 이 신규 구조 편집 ABI와 별개이며 기존 WASM820으로도 실행할 수 있습니다.

현재 연결은 로컬 파일을 읽어 새 파일을 만드는 CLI/MCP입니다. 웹 UI나 살아 있는 헤드리스 편집 세션의 명령 큐·undo/redo와 연결됐다는 뜻은 아닙니다. 파일 작업 후 이미 열린 문서는 별도로 다시 열어야 합니다.

## 표 전체 삭제

```sh
bun run cli delete-table ./input.hwpx \
  --ref "$TABLE_REF" --output ./without-table.hwpx \
  --allow-stale-layout --wasm "$WASM"
```

`TABLE_REF`는 동일한 원본을 읽어 얻은 `hwpjs-object:<SHA>/<format>/s<section>/table/<node>` 참조 전체입니다. 표시 순번이나 임의로 구성한 노드 번호를 사용하지 않습니다. 호스트는 참조의 종류·원본 SHA·컨테이너 형식을 확인하고, 서비스가 실제 노드·소유 문맥·지원 가능성을 검증합니다. 오래된 참조는 다시 조회해야 합니다.

표 삭제는 표 자체와 그 셀 내용을 제거하는 작업으로, 기존 `edit --with ''`의 셀 내용 비움과 구분합니다. 요청한 표 밖의 내용·공유 자원의 보존이나 모든 종류의 중첩 구조 지원은 별도 서비스 검증 대상이며 무손실·원본 서식 동치를 주장하지 않습니다.

현재 표 삭제도 필드가 없는 구역으로 제한합니다. 문단을 가로질러 시작·종료하는 필드의 일부를 삭제하지 않도록 구역 전체의 필드 표식을 검사합니다. HWPX의 알려진 XMLDSig와 지원하지 않는 보안 메타데이터도 거부합니다. 임의의 사설 서명 형식을 모두 식별하거나 서명을 다시 생성하는 기능은 아닙니다.

## 이미지 삽입

```sh
bun run cli insert-image ./input.hwpx \
  --target "$TARGET" --unit 0 --expect-text "$RAW_TEXT" \
  --expect-sha256 "$SOURCE_SHA" --image ./picture.png \
  --width 7200 --height 3600 --output ./with-picture.hwpx \
  --allow-stale-layout --wasm "$WASM"
```

`TARGET`은 구조 보기의 실제 `s<section>:p<NativeOrdinal>` ID입니다. HWP5는 구역 안에서 0부터, HWPX는 문서 전체에서 1부터인 Native 번호를 사용합니다. `RAW_TEXT`는 같은 원본의 `paragraph` 조회에서 얻은 편집 원문 문자열이며 표시 본문·정규화 텍스트를 대신 넣지 않습니다. 빈 원문도 `--expect-text ''`로 명시해야 합니다. `unit`의 CLI 정수 범위는 0~4294967295(U32)이며 실제 문단 안의 Native UTF-16 좌표입니다. 표시 글자 수와 다릅니다. 삽입 위치의 제어코드·소유 문맥과 편집 가능성은 서비스가 판정합니다.

CLI의 `--expect-text`는 프로세스 argv로 전달되므로 NUL(U+0000)을 담을 수 없습니다. 셸 변수나 이스케이프로 NUL을 제거·치환해 조건을 맞추면 안 됩니다. 현재 CLI 예시는 NUL이 없는 일반 본문 원문을 대상으로 하며, 문단 끝 CR은 실제 문자열 값으로 전달할 수 있습니다. `secPr` 제어 등으로 NUL을 포함한 첫 문단은 다른 지원 대상 문단을 선택하거나, JSON의 `\u0000`을 문자열로 복원해 전달하는 MCP 인프로세스 경로 또는 공통 메모리 서비스를 사용합니다. MCP도 같은 CLI 파서의 문자열 검증을 거치며 `expectedText`는 최대 1Mi UTF-16 코드 유닛입니다. NUL 전달 가능성이 해당 제어 문단의 삽입 허용을 뜻하지 않으며 소유 문맥·원문 일치·위치는 서비스가 검증합니다.

폭·높이는 1~2147483647(INT32_MAX)의 정수 HWPUNIT(1/7200인치)이며 예시 7200×3600은 1×0.5인치입니다. CLI의 정수 어휘·범위 통과가 임의 좌표·크기의 Native 수용을 보장하지 않습니다. 현재 삽입은 **필드가 없는 구역의 plain 최상위 본문 문단에 새 PNG/JPEG 인라인 그림 하나를 넣는 범위**로 보수적으로 제한합니다. 구역에 `fieldBegin`/`fieldEnd`가 있으면 대상이 문단 중간이어도 `ProtectedFieldRange`로 거부합니다. 이는 표 셀·글상자 등 중첩 문맥 거부와 별개의 구역 보호 조건입니다. 이미 그림·다른 개체가 있는 문단의 일반 삽입은 지원하지 않습니다. HWP5의 `secd`/`cold` 접두 구조는 제한적으로 예외 처리하지만 토큰과 CTRL 링크가 불일치하면 거부합니다. 일반적인 모든 본문 문단을 허용하는 계약이 아닙니다. 이미지 입력은 호스트에서 최대 8MiB로 읽고, 이미지 형식·내용 검증은 서비스가 담당합니다. 기존 그림의 `replace-image`와 삽입은 별개의 작업입니다.

## 배치와 결과 결속

두 구조 편집은 `--allow-stale-layout`이 없으면 파일을 읽기 전에 거부합니다. 이 동의는 호스트가 처리하며 메모리 서비스 옵션으로 넘기지 않습니다. 새 문서 결과는 원본 형식과 같은 형식·실제 컨테이너 시그니처, 동일 `sourceSha256`, 비어 있지 않은 소유 바이트, `layoutRequiresReflow: true`, `previewStale: true`를 갖춰야 합니다. 이미지 삽입 결과의 `imageSha256`도 읽은 이미지와 일치해야 합니다.

이 플래그는 새 조판·미리보기가 생성됐다는 뜻이 아니라 둘 다 오래된 상태임을 명시합니다. 원본 썸네일이나 이전 페이지 배치를 최종 편집 화면이라고 사용하지 않습니다. 호스트의 CFB/ZIP 시그니처 판별은 컨테이너 종류 확인일 뿐 Native 문서 유효성·전체 레코드 보존 검증이 아닙니다.

## 의미 HTML 내보내기

```sh
bun run cli export-html ./input.hwpx \
  --output ./document.html --embed-images supported --wasm "$WASM"
```

기본 `embed-images`는 `supported`이며 `none`도 허용합니다. 관측한 문단·표·머리말/꼬리말 등 의미 구조를 HTML로 표현합니다. 지원 가능한 내장 이미지는 선택적으로 data URI로 포함하고, 누락·미지원 내용은 서비스의 경고·참조로 드러냅니다. 외부 이미지를 가져오거나 개체·스크립트를 실행하는 경로가 아닙니다.

`export-html`은 `read --format markdown`의 별칭이나 `convert --to hwp5|hwpx` 저장 형식 변환이 아닙니다. 원본 페이지 치수·폰트·줄바꿈·서식의 완전 재현, 과거 Rust `toHtml` 변환기와의 동등성을 뜻하지 않습니다. 서비스는 `{format, sourceSha256, html, semanticOnly: true, warnings: string[]}`를 반환합니다. 호스트는 형식·SHA·정상 Unicode 문자열을 확인하고 UTF-8로 인코딩해 새 `.html` 또는 `.htm` 파일에 게시합니다. 원본을 수정하지 않으므로 구조 편집의 stale-layout 동의 플래그는 받지 않습니다.

공개 SDK의 현재 소스는 같은 서비스를 `toHtml(bytes, { wasm, embedImages?, title?, fragment? }): Promise<string>`으로 노출합니다. 입력과 WASM은 호스트가 제공하며 함수가 파일·네트워크를 자동으로 읽지 않습니다. 읽기 모델은 `packages/document`의 공통 구현이고, CLI는 HTML 저장 경로만 추가합니다. 현재 풍부한 관측 SDK가 열 수 있는 문서로 한정하며 HWP5 배포 문서는 `UnsupportedDistributionDocument`로 거부합니다. 암호 해제·원본 수리·PrvText 자동 대체는 수행하지 않습니다.

HTML 문자열은 최대 32Mi UTF-16 코드 유닛, 인코딩된 출력은 최대 64MiB입니다. 경고는 최대 4096개이고 각 문자열은 정상 Unicode·4096코드 유닛 이내여야 하며 전체 진단에도 별도 한도가 있습니다. 경고 getter는 한 번 읽어 검증한 값으로 출력합니다. 알려진 진단 한도 초과는 게시 전에 거부하며 누락을 숨기고 성공으로 만들지 않습니다.

## 새 파일 게시와 오류

출력은 존재하지 않는 새 파일이어야 합니다. 기존 파일·원본 경로·원본을 가리키는 링크는 덮어쓰지 않습니다. HTML 출력은 심볼릭 링크 부모도 거부합니다. 임시 파일에 쓴 뒤 원자적 비대체 게시를 하며, 게시 직전 다른 프로세스가 만든 파일도 보존합니다. 출력 확장자와 문서 형식 불일치는 거부합니다. 실패 시 원본은 유지합니다.

CLI 인자 문법 오류는 종료코드 2, 파일·서비스·출력 실패는 1입니다. 파일 게시 후 stdout이나 정리 단계에서 실패할 수 있으므로 종료코드만 보고 출력이 없다고 가정하지 않습니다. `published: true`와 실제 경로·SHA가 있으면 이미 저장된 결과이며 같은 경로로 자동 재시도하지 않습니다. 게시 전 거부와 게시 후 진단 실패를 구분합니다.

## MCP 대응

| 도구                    | 필수 입력                                                                                                     | 선택 입력                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `delete_document_table` | `inputPath`, `outputPath`, `reference`                                                                        | `allowStaleLayout`(기본 false, 실제 작업은 true 동의 필요) |
| `insert_document_image` | `inputPath`, `outputPath`, `target`, `unit`, `expectedText`, `expectedSha256`, `imagePath`, `width`, `height` | `allowStaleLayout`(동일)                                   |
| `export_document_html`  | `inputPath`, `outputPath`                                                                                     | `embedImages`: `supported`(기본) 또는 `none`               |

새 세 도구를 더한 소스 서버는 기존 그림 교체를 포함해 16도구입니다. 공개 npm 0.1.0의 12도구와 구분합니다. MCP는 엄격한 입력 스키마를 거쳐 같은 CLI 파서·파일 호스트·공통 서비스로 전달하며 자체 Native 구현을 추가하지 않습니다. CLI 실패는 `isError: true`의 text content로 반환하고 stdout에는 MCP 프로토콜만 씁니다. 상대 파일 경로는 서버 작업 디렉터리 기준입니다.

## 검증 범위

`packages/cli/tests/structural-host.test.mjs`는 시그니처가 있는 합성 입력과 DI 서비스로 필수 옵션·원문 조건 전달·선행 동의·결과 오염·원자적 게시·심볼릭 링크·게시 후 오류 및 공식 MCP 전송 계층을 검사합니다. 합성 바이트는 실제 문서가 아니며 실제 Native의 표 제거·이미지 삽입·HTML 내용 정확도, 설치 패키지·웹 UI·현재 열린 세션 undo를 검증한 것으로 세지 않습니다. 실제 문서 저장·재열기와 독립 내용 검사는 해당 서비스의 별도 증거로 확인해야 합니다.

2026-11-09의 분리된 실측은 다음과 같습니다. 아래 결과는 이 두 공식 Noori fixture와 명시한 입력 범위의 근거이며 임의 문서·모든 HWP5 버전·전체 웹한글 기안기 동등성을 뜻하지 않습니다.

- 정규 `test-file-transforms`의 79개 검사가 통과했습니다. HWP5·HWPX의 표 삭제, PNG/JPEG 삽입, 문단 간 필드·알려진 서명 거부, 출력 별칭·할당 실패와 원본 보존을 포함합니다. 테스트의 증거 파일 쓰기를 제거해 같은 작업 디렉터리에서 다시 실행해도 충돌하지 않습니다.
- 최종 파일 변환 WASM은 ReleaseSafe/strip 빌드의 SHA256 `fb730556e71c9ccd9f154e17c85723081155bc779d04a6cedc4bea45b9428f2d`입니다. 고정한 별도 JS 실행 환경에서 서비스·CLI·MCP의 긍정 18건과 거부 44건을 확인했습니다. 독립 Python CFB/ZIP 검사 18건으로 비대상 내용·기존 그림 4개 및 삽입 그림의 실제 바이트를 대조했습니다.
- 이 WASM을 내장한 로컬 패키지를 실제 설치한 뒤 별도 `--wasm` 지정 없이 CLI 4건·MCP 4건을 실행하고 저장·재열기·그림 추출을 확인했습니다. 게시된 npm 0.1.0을 검사하거나 갱신한 결과가 아닙니다.
- 공개 SDK `toHtml`의 로컬 설치본은 기존 820 WASM으로도 두 Noori를 변환했습니다. 브라우저에서 두 HTML의 표 5개·이미지 4개(JPEG 2개/BMP 2개)와 실제 이미지 디코딩을 확인했고 외부 리소스 요청·스크립트는 없었습니다. 검사 브라우저와 전용 서버는 종료했습니다. 원본 Canvas 조판·편집 UI 검사는 아닙니다.
- 별도의 기존 Native820 코호트에서 CLI 검사 545개가 통과했습니다. 새 구조 변경 ABI의 근거는 위 최종 WASM 실행이며, 기존 820·npm 0.1.0에 그 기능이 있다는 뜻은 아닙니다.

실행 원자료는 `zig-out/verification/document-transforms-connect-r1/`, `document-transforms-final-e2e-r1/`, `document-transforms-installed-e2e-r1/`에 보존했습니다. 공개 기능 계약은 이 문서가 소유하며 검사 산출물 경로를 런타임 입력으로 요구하지 않습니다.
