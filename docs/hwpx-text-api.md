# HWPX 공개 section 텍스트 이벤트 API

`js/hwpx.mjs`의 `createHwpxReader(wasm)`는 독립 WASM 인스턴스를 소유합니다. `reader.readTextEvents(Uint8Array | ArrayBuffer)`는 `{ format: "hwpx", branchPolicy: "selected_default", sectionCount, paragraphCount, events }`를 반환합니다. 파일시스템·브라우저 API는 native 코어에 넣지 않습니다. `close()` 뒤 읽기는 ReaderClosed이며 반복 close는 무변경입니다.

각 이벤트는 `section`, `itemIndex`, `paragraph`, `run`, `text`, `kind`, `inlineKind`, `value`, `raw`를 소유합니다. 구역 번호는 0부터, 문단/run/text 번호는 기존 스캐너의 원문 ordinal이며 문단 번호는 1부터입니다. `value`는 content 이벤트에서 정규화 UTF-8 내용이고 다른 경계에서는 원문 태그입니다. text_end의 value/raw는 비어 있습니다. 인라인 kind는 기존 9종 분류를 유지합니다. 이 값을 전체 문단 텍스트나 편집 위치로 합성하지 않습니다.

`src/hwpx/text_preview.zig`는 기존 package.inspectDocument와 [소유 텍스트 스냅샷](hwpx-section-text-snapshot.md)을 호출하고 지원 namespace가 없는 선택 분기 정책을 명시합니다. ZIP/XML·문자 참조·문단/run 범위·분기 규칙을 새로 구현하지 않습니다. 헤더/섹션 선택과 암호화 거부는 기존 파서가 담당합니다. 버전 XML의 모든 값·표/도형/마스터페이지·비본문 part·실제 조판을 이 반환값이 포함한다는 뜻은 아닙니다.

WASM의 hwpx_text_read/ptr/len/free는 이 기능의 출력만 소유하며 HWP5/CFB 세션과 분리합니다. private HXT1은 magic·구역/문단/이벤트 수와 이벤트별 구역·manifest item·문단/run/text 위치·kind·inline kind·UTF-8 길이/바이트를 little-endian u32로 운반합니다. 입력/출력은 각각 64 MiB 한도이며 ZIP 해제·XML·스냅샷의 기존 한도도 적용합니다. 실패 시 부분 출력은 공개하지 않습니다. JS는 framing·종류·UTF-8·잔여 바이트·문단 계수를 검사하고 각 raw를 복사합니다. raw 변경이나 후속 native 읽기가 이전 반환값에 영향을 주지 않습니다.

## 검증 및 미완료

ReleaseSafe 제품에서 추적 HWPX 45개 중 비암호화 44개가 공개 이벤트 읽기에 성공하고 password-12345.hwpx는 EncryptedDocument로 거부됩니다. charshape의 1구역·7문단·106이벤트·본문 204바이트를 확인했습니다. 독립 Python zipfile/ElementTree의 hp:t itertext SHA-256은 `5f701567653360b2e6cd8f9306a4c21b1ebdb268acc475b9226cc68a81e76bc5`로 제품 본문과 일치했습니다. 이 독립 내용 대조는 한 파일이며 나머지 43개의 의미/순서 대조를 대신하지 않습니다.

제품 읽기 테스트 3개는 위 실파일/추적 전수 열기, 실패 후 재읽기·close·소유권, 모든 합성 packet 잘림·잘못된 kind/한도/UTF-8·추가 바이트를 검사합니다. native 공개 전송의 모든 할당 실패 집중 검사도 root 포함 2개 통과했습니다. 전체 native 회귀와 실제 브라우저 검증은 후속 게이트입니다. 실행 명령은 [개발 명령](development-commands.md)이 소유합니다.

## 읽기 전용 Canvas 연결

`web/preview/hwpx-content.mjs`는 native 문단 이벤트의 원본 구역/ordinal과 중첩 stack으로 표시용 문단을 조립합니다. 부모 텍스트와 자식 목록 텍스트를 합치지 않으며 태그를 JS XML 파서로 다시 읽지 않습니다. 원본 ordinal과 배열 인덱스는 다를 수 있고 이 표시 객체는 편집 위치나 저장 모델이 아닙니다. 모든 문단의 editable은 false이며 Worker도 enable/splice/format을 UnsupportedHwpxEditing으로 거부합니다.

탭·전각/줄바꿈 없는 공백·soft hyphen은 표시 문자로, 줄바꿈은 현재 흐름 미리보기의 `↵` 표식으로 표시합니다. 미지원 인라인은 U+FFFC 표식으로 남기며 markpen/title 효과·원본 표/페이지 배치를 합성하지 않습니다. 표시 한도는 200000 UTF-16 유닛·20000 문단이고 surrogate 중간에서 자르지 않습니다. 내용 한도에 한 번 도달하면 후속 이벤트 조각을 끼워 넣지 않아 원문 앞부분만 표시합니다.

HWPX 표시/Worker 회귀 4개는 중첩 소유·읽기 전용 상태, 이벤트 손상, Unicode/내용/문단 한도, 추적 비암호화 44개 전수 표시 projection 및 실제 Worker의 읽기/편집 거부를 검사합니다. 기존 HWP5 Worker 2개와 공개 HWPX 읽기 3개를 함께 실행해 9/9개 통과했습니다. 웹 파일 선택은 HWP/HWPX를 받으며 HWPX 상태에 읽기 전용을 명시하고 고급 편집 폼을 활성화하지 않습니다. 이는 웹 연결 코드와 자동 회귀 결과이며 실제 Chromium 화면 확인은 별도입니다.

후속 전체 ReleaseSafe native 2710/2710개·7/7 단계·종료 코드 0, Debug·ReleaseSafe·ReleaseFast HWPX 제품 audit 각각 7/7개가 통과했습니다. 같은 ReleaseSafe 제품에서 기존 HWP5 편집 audit 69/69개도 통과했습니다. 전체 native는 공개 전송의 실패 해제를 포함하며 JS 표시 검사는 위 별도 제품 audit가 담당합니다.

외부 접속 URL의 실제 Chromium에서 charshape.hwpx를 선택해 ‘HWPX · 읽기 전용 · 7문단’과 Canvas 21행을 확인했습니다. Canvas 클릭 후에도 입력 disabled·caret 빈 값·편집 폼 hidden이 유지됐고, `/private/tmp/hwpjs-hwpx-canvas-preview.png`를 시각적으로 확인했습니다. 암호화 파일 선택은 EncryptedDocument와 0행·빈 대체 텍스트로 이전 결과를 지웠습니다. 이후 HWP5 3문단 파일을 선택하자 Canvas 9행과 편집 폼이 복구됐습니다. agent-browser로 확인한 읽기/상태 전환이며 HWPX 직접 편집·실제 한글 IME·한컴 페이지 조판 검증은 아닙니다.
