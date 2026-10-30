# 기존 HWP5 각주 문단의 헤드리스 선택

`createParagraphSelection(state, 좌표)`는 전체 HWP5 snapshot에서 확인된 원본 각주·미주 owner를 사용할 수 있습니다. owner/reference/token 인자를 추가하지 않습니다. 본문에 달린 원본 note만 승격하며 생성 note, 표 안 note, window, clipped·중복·불명 소유권은 지원 범위로 추정하지 않습니다.

## 권한과 책임

Native `noteSources`가 확인한 note/list와 `paragraphFlow`의 source node·parent·list를 현재 `currentReference`의 source id·session scope·epoch 및 host 참조와 대조합니다. `hwp5-note-selection-owner.mjs`는 게시할 display identity만 파생합니다. Native 참조·source offsets·editable·raw cache를 바꾸지 않습니다. `reader-runtime.mjs`는 기존 전체 조립과 drawing 진단이 끝난 반환 경계에서 이 투영을 호출합니다.

`createParagraphSelection`과 선택 validator, Native `spliceCurrent`가 기존 문서·generation·revision·scope·epoch·범위 권한을 계속 검사합니다. 이전 문서·편집·undo의 참조를 현재 token으로 전달해도 Native가 거부합니다. 새 Native ABI와 private 브랜드 발급은 없습니다. owner가 생겼다는 이유로 표 삽입 권한을 부여하지 않습니다. note+table 교차 거부 통합 검사는 별도 담당 검증과 구분합니다.

## 검증 범위와 입력

정규 source 검사 위치는 다음과 같습니다.

- `tools/tests/existing-note-selection.test.ts`: canonical ReaderRuntime/Editor 실제 검사 4개.
- `tests/hwp5/note-selection-owner.test.mjs`: 순수 게시 투영 양성 1개와 원 음성 15개. 분리된 고정 DTO를 사용하며 실제 Native 검사로 합산하지 않습니다.

원본 입력은 `legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp`의 SHA256 `360c6dc2c679e03e48396b11d7f31823a577d64e96a9ec75e074390385b865a9` 하나입니다. 기존 명시 WASM은 `d849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb`입니다. 없는 입력이나 잘못된 SHA는 실패하며 skip 또는 다른 artifact로 대체하지 않습니다.

실제 검사 4개는 공개 선택과 한글자 입력, MIT `legacy/cfb.js`를 사용하는 독립 전체 Section·비대상 stream·컨테이너 metadata 대조, undo 원본 bytes 복원, redo 편집 bytes와 재열기 선택을 확인합니다. 위조 owner/추가 옵션/foreign token·Native scope/epoch·load/undo stale·자동번호 보호 범위 거부도 포함합니다. 이 결과를 브라우저·Canvas·Worker transport·모든 원본 검증으로 확대하지 않습니다.

명령의 단일 출처는 [개발·검증 명령](development-commands.md#existing-note-headless-selection)입니다. `HWPJS_TEST_WASM`은 절대경로로 명시하며 source Bun runner를 사용합니다. 별도 입력 폐쇄 사본에서만 `HWPJS_TEST_NOTE_FIXTURE`로 같은 원본의 절대경로를 지정할 수 있고 원본 SHA 검사는 동일합니다. 기본 실행은 증거파일을 쓰지 않습니다. 필요한 경우 `HWPJS_TEST_NOTE_OUTPUT`으로 명시한 소유 디렉터리에만 증거를 씁니다.

작업 트리의 최종 `tools/tests` 진입점으로 실제 검사 4개와 순수 검사 16개가 실패·skip 없이 통과했습니다. 원격 CI, 배포 SDK·Worker와 브라우저는 별도 검증 대상입니다. 두 검사 축의 결과를 하나의 Native 전수 검증 수로 합산하지 않습니다.
