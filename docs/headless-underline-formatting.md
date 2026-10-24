# 공개 밑줄 명령과 데모 연결

`SET_CHARACTER_UNDERLINE_COMMAND`의 payload는 `{target,kind}`이며 kind는 `none`, `bottom`, `center`, `top`입니다. 명령은 다른 typed 서식과 같은 FIFO/조합 중 입력 정리/토큰·owner·UTF-16 경계·Native 이력·결과 callback 계약을 따릅니다. 새 문서 모델이나 별도 서식 캐시를 만들지 않습니다. 본문·원본 표 셀·원본 글상자/도형 캡션의 유효한 원본 선택만 기존 정책대로 허용합니다.

`commands/underline.ts`가 공개 명령을 canonical `character-underline` 요청으로 변환합니다. 기존 `characterUnderlineArg`를 사용해 의미 이름을 검사하며 Native enum 값을 다시 정의하지 않습니다. target 검증은 공통 `validateFormattingTarget`에 capability 이름을 주입합니다. 밑줄은 `characterUnderlineAvailable`로 허용하고 일반 문자 속성 capability에 종속시키지 않습니다. 표시 좌표는 공통 source 변환을 적용하며 native ID/문단 ordinal을 추정하지 않습니다.

Native 형식별 제한은 유지합니다. HWP5의 `center`는 `UnsupportedCharacterUnderlineKind`로 미적용 거부됩니다. 이 실패 후 원본 저장 바이트와 redo가 보존되는 실제 회귀를 포함합니다. API의 종류 이름이 모든 형식·개체에서 지원된다는 의미는 아닙니다.

`getSelectionFormatting()`은 `underline`의 true/false/mixed/null과 `underlineAvailableReason`을 별도로 반환합니다. 값은 현재 `characterUnderlines`/characterRanges에서 공통 selector로 계산합니다. 정보 부재를 false로 바꾸지 않습니다. 사유가 null이어도 관측값이 null이면 UI 토글은 비활성화합니다. 빈 선택·미지원 owner·오래된 토큰도 거부합니다.

데모 bridge는 current selection을 호출 순간 다시 읽고 공개 명령만 사용합니다. true이면 none, false/mixed이면 bottom으로 토글합니다. pending·Native 실패·refresh-required는 기존 서식 흐름으로 보고하며 다른 명령이나 raw runtime 호출로 우회하지 않습니다. 취소선 버튼 연결은 이 변경에 포함하지 않습니다. 현재 앱 코드는 작업 트리 데모에 있고 source SDK 게시와 전체 UI 패키지 게시를 구분합니다.

## 검증

- core command/state 집중8건: 독립 capability, source offset, mixed/unknown, 잘못된 종류/owner/UTF-16 경계/stale target 미적용 검사.
- `typed-underline.test.ts` 실제 HWP5/HWPX × 본문/글상자/도형 캡션/표 셀8건: bottom/none·선택 유지·독립 전체 CFB/DocInfo/Section 및 ZIP/XML 일반/-O oracle·오답 거부·undo/redo·재열기, HWP5 center 실패 후 redo 보존.
- 현재 작업 트리 패키지200건·타입 검사, 데모 bridge8건, 기존 underline painter/decoder3건 통과.
- 실제 제품 Canvas `demo-formatting-underline/2026-10-24T17-13-05-373Z`: 세 프레임워크 × 두 형식6건. 물리 선택·굵게/기울임/밑줄/크기/정렬의 다섯 툴바 동작·실제 다운로드·별도 WASM 재열기·다섯 undo/redo·재업로드를 확인합니다. 독립 CFB/XML oracle와 별도 WASM 관측은 서로 다른 근거입니다. 실제 밑줄 픽셀의 한글 프로그램 동치나 전체 객체 조판 검증으로 확대하지 않습니다. 소유 브라우저는 종료했습니다.

원본 참조는 [현재 참조 계약](hwp5-sdk-current-references.md), 글상자/캡션 범위는 [도형 텍스트 서식](headless-drawing-text-formatting.md), 표 셀은 [셀 서식](headless-original-cell-formatting.md)을 따릅니다. 전체 fixture·모든 서식·타이핑 중 상속 서식 지원을 완료했다는 뜻은 아닙니다.

Vanilla 실제 noori 셀에서도 `demo-cell-formatting-underline/2026-10-24T17-19-08-843Z`와 `17-19-20-565Z`의 두 형식이 같은 툴바/저장/이력/재업로드를 통과했습니다. 캡션의 독립 XML 검사는 기존 anchor-properties 모드로 자동 번호 전체와 위치 보존을 대조하며, plain run 전용 모드의 초기 거부를 제품 실패로 합산하지 않습니다.

게시 대상 source SDK만 분리한 후보에서는 기존 회귀와 새 명령/관측·원본 네 owner 범위를 합친161건이 모두 통과했습니다. 원래 작업 트리의 후속 renderer/Native 구현을 이 소스 검사에 끼워 넣지 않았습니다.

데모를 같은 포트8082에 반영한 뒤 `monorepo-demo-deployment-check/2026-10-24T17-22-36-391Z`에서 HTTPS11개 아티팩트의 로컬 바이트 일치와 누락 URL404를 확인했습니다. 공개 주소의 실제 HWPX 밑줄 툴바·다운로드·이력·재업로드 재검증은 `demo-formatting-underline/2026-10-24T17-22-56-601Z`에서1건 통과했습니다. source SDK는1727cf64로 게시됐고, 전체 UI 패키지 게시와 구분합니다. 소유 브라우저/임시49002 서버는 종료하고8082 데모만 유지했습니다.
