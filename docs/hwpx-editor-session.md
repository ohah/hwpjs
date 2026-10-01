# HWPX native 편집 세션

일반 문단 `canEdit/splice` 외에 명시적 [필드 라벨 조회·편집](hwpx-field-text-edit.md)을 연결했습니다. 해당 주제가 종류별 정책·dirty 상태·공개 명령·Worker/Canvas·최신 필드 검증을 소유합니다. 아래 일반 문단 검증 수치는 당시 이력이며 모든 필드/객체 지원 범위로 읽지 않습니다.

`src/hwpx/editor_session.zig`는 패키지 선택·원본 소유·일반 문단 명령·ZIP 저장을 조립합니다. XML/ZIP 파서나 텍스트 경계 규칙을 별도로 구현하지 않습니다. `src/wasm/hwpx_edit.zig`와 `js/hwpx-editor.mjs`에 실험용 공개 세션을 연결하고 기존 Worker·Canvas 입력 경로를 재사용합니다. 편집 가능 여부는 `canEdit`가 실제 명령과 같은 native 정책을 적용하며 UI에 별도 규칙을 두지 않습니다.

## 소유권과 위치

`open(allocator, input, options)`는 입력 ZIP을 복사하고 spine 순서대로 section 원문 트리, 현재 텍스트 사이트, 원본 위치를 소유합니다. 호출자는 입력을 해제할 수 있습니다. `Session.deinit()`는 같은 할당자로 전체 상태를 해제하며 중복 호출할 수 없습니다.

`splice(section_index, paragraph, start, deleted, inserted)`의 section 인덱스는 0부터, 문단은 공통 section 스캐너의 문서 전체 1-based 순번입니다. 텍스트 위치와 삭제 길이는 UTF-16 단위입니다. 이모지의 서로게이트 중간 위치는 거부합니다. 편집 가능 범위는 [일반 문단 계약](hwpx-plain-paragraph-edit.md)을 그대로 따릅니다. 컨트롤을 제거하거나 표시 문자열로 평탄화하지 않습니다.

현재 텍스트가 편집 상태의 단일 출처이며 원본 XML 바이트 범위는 저장 연결에만 사용합니다. 저장 결과를 별도 가변 캐시로 유지하지 않습니다.

## 공개 JS 경계

`createHwpxEditor(wasmBytesOrModule)`는 별도 WASM 인스턴스를 생성합니다. 반환 객체의 `open(documentBytes)`는 `{ sectionCount }`를 반환합니다. 성공하면 이전 세션을 교체하고, 실패하면 이전 세션을 유지합니다. `canEdit(section, paragraph)`는 Boolean, `splice(section, paragraph, start, deleted, text)`는 성공 시 반환값 없이 현재 모델을 수정합니다. `save()`는 독립 소유 `Uint8Array` ZIP을 반환합니다. `close()`는 반복 호출할 수 있고, 이후 다른 메서드는 `EditorClosed`를 던집니다.

숫자는 u32 범위 정수만 받으며 강제 형변환하지 않습니다. 입력 문자열의 단독 서로게이트를 거부하고, 삽입 UTF-8은 4 MiB까지 제한합니다. 일반 문단과 별도 명시적 필드 라벨 명령을 제공하며 서식 명령·실행 취소·문단 분할은 아직 제공하지 않습니다. `save()`는 원본 줄 배치 정보를 재조판하지 않으므로 결과를 최종 한컴 조판과 동일하다고 보지 않습니다.

```js
const editor = await createHwpxEditor(wasm);
try {
  editor.open(documentBytes);
  if (editor.canEdit(0, 2)) editor.splice(0, 2, 0, 0, "검증");
  const savedZip = editor.save();
} finally {
  editor.close();
}
```

## native 저장과 한도

`save()`는 각 section의 현재 사이트를 기존 XML 부분 출력기로 직렬화하고 [ZIP 선택 항목 교체](zip-replacement-writer.md)에 전달합니다. 반환 버퍼는 호출자가 세션의 할당자로 해제합니다. 저장 성공·실패 모두 세션을 변경하지 않습니다. 변경 없는 저장과 원래 텍스트로 복원한 저장은 실제 charshape fixture에서 원본 ZIP 바이트와 일치합니다.

입력·출력 ZIP, section XML 합계, 현재 사이트 텍스트 합계, 사이트 수 합계, section 수를 제한합니다. 패키지 메타데이터 검사에는 기존 패키지 검사기의 자체 기본 한도가 적용됩니다. 알 수 없는 ZIP 확장 필드의 내부 오프셋·서명까지 재계산한다는 계약은 아닙니다.

## 검증 현황

- 실제 `charshape.hwpx`의 입력 독립 소유, 무변경 저장, 삽입·재열기·복원 검사를 통과했습니다.
- 실제 파일에서 위치 오류·텍스트 한도·출력 한도 실패 후 이전 편집 출력 보존 검사를 통과했습니다.
- ReleaseSafe native 세션 집중 검사 4/4이 통과했으며 실제 파일의 open·edit·save·reopen 전체 할당 실패를 포함합니다. 별도 암호화 fixture 거부 집중 검사도 2/2 통과했습니다. 두 실행은 각각 root 진입점 테스트를 포함하므로 합산 고유 테스트 수로 읽지 않습니다.
- ReleaseSafe 제품 WASM의 공개 세션 검사 3/3이 통과했습니다. 추적 HWPX 45개 중 비암호화 44개는 세션 열기·무변경 ZIP 바이트 보존, 암호화 1개는 거부를 확인했습니다. charshape 삽입·읽기 API 재열기·복원, 실패한 새 문서 열기 후 상태 보존, 잘못된 JS 숫자·서로게이트 거부도 검사합니다. 전수 문단 편집이나 독립 저장 oracle의 대체 증거는 아닙니다.

이 native 검사는 전체 fixture 편집, 공개 WASM 수명, 브라우저 직접 입력, 한컴 조판 호환성을 증명하지 않습니다.

공개 WASM 문단 전수 조사도 완료했습니다: fixture 45개 중 암호화 1개를 거부했고, 비암호화 파일의 1,379문단에서 1,159건의 삽입·ZIP 저장·제품 재열기·접두어 제거·원본 ZIP 바이트 복원을 확인했습니다. 220건은 `UnsupportedParagraphControl` 212, `UnsupportedInlineControl` 7, `MissingTextSite` 1로 거부했습니다. `canEdit`의 판정과 실제 명령의 수용·거부도 일치했습니다. 이는 제품 자체 재열기 조사이며 독립 decoder 대조나 전체 컨트롤 지원 완료를 의미하지 않습니다.

2026-10-01 실제 Chromium 브라우저에서 외부 preview 주소로 charshape를 열고 Canvas 두 번째 문단을 클릭한 뒤 `브라우저검증😀`를 입력했습니다. native Worker 적용 완료, Canvas 화면과 접근성 텍스트의 동일 변경을 확인했습니다. 증거 이미지는 `/private/tmp/hwpjs-hwpx-native-edit-e2e.png`입니다. 자동 브라우저 텍스트 삽입이며 실제 OS 한글 IME 조합 검증은 아닙니다. 전체 HWPX 제품·Worker 검사 10/10 및 공통 정책 변경 후 native 일반 문단 검사 4/4도 통과했습니다. 전체 컨트롤 편집·문단 분할·실행 취소·RHWP 수준 조판은 미완료입니다.

추가 적대적 검토에서 표시 한도로 잘린 문단을 native 적격성만으로 편집 가능 처리하는 경계를 확인했습니다. 표시 projection은 해당 문단에 `clipped`를 표시하고 Worker가 이를 입력 대상으로 승격하지 않습니다. 클리핑 이후 생략된 문자 조각도 같은 표시를 유지하며 원본 모델을 잘린 표시 문자열로 대체하지 않습니다. 표시 반례 4/4, HWP5·HWPX Canvas/Worker/API 회귀 30/30을 확인했습니다.

공개 세션 집중 검사는 후속 재편집·소유권 반례를 포함해 4/4로 확대했습니다. 저장 ZIP으로 새 편집 세션을 연 뒤 입력 JS 버퍼를 덮어써도 세션 저장이 동일하며, 두 세션의 편집값·수명이 독립적입니다. 새 세션에서 다시 치환·저장한 텍스트를 제품 reader로 확인했습니다.

전체 ReleaseSafe native 실행은 2,738/2,738 테스트 및 7/7 빌드 단계로 완료했습니다. 실행 시작 후 추가된 편집 적격성 정책 연결은 별도 일반 문단 4/4와 최신 제품 audit 11/11로 확인했습니다. 전체 실행은 약 9분, 최대 RSS 44 GiB를 관측했으며 출력이 없는 동안 같은 실행 핸들을 유지했습니다.
