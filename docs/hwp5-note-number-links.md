# HWP5 각주·미주 안 자동 번호 관계

[모듈 인덱스](hwp5-modules.md) · [본문 계약](hwp5-body-contracts.md)

## 범위와 소유권

HWP5 형식 명세 4.3.10.5의 자동 번호 표 142·143은 12바이트 필드와 속성 하위 4비트의 종류 1=각주, 2=미주를 정의합니다. 로컬 명세 요약의 ID `autn`은 공식 ID 표·실파일의 `atno`와 다르므로 별칭으로 등록하지 않습니다. 원값은 `number_control.zig`, `fn  `/`en  ` 속성과 명시적 `spec8`·`observed12`·`observed16` 배치는 `note_control.zig`가 소유합니다. 논리적 리스트 범위는 `list_groups.zig`가 소유합니다.

`note_number_links.zig`는 기존 Tree/Groups에서 **주석이 직접 소유한 리스트의 직접 문단 아래**에 있는 `atno`만 연결합니다. 중첩 주석이나 주석 밖의 형제 컨트롤은 가져오지 않습니다. 구역 보고서는 자동 번호 수, 자동 번호가 없는 주석 수, 여러 개인 주석 수, 종류 일치/불일치, 저장 번호 일치/불일치, 저장 번호 불투명 수를 별개 필드로 제공합니다. `spec8`에서는 저장 번호 뜻이 명세에 없어 불투명으로 집계합니다. 다른 두 배치에서는 관측된 32비트 주석 번호와 `atno`의 16비트 번호를 값으로 비교하되 폭을 조용히 맞추지 않습니다.

부재·복수·종류/저장 번호 불일치는 **진단**이며 그 자체로 문서 거부 사유가 아닙니다. 명세만으로 주석마다 자동 번호가 정확히 하나라고 강제할 근거가 없습니다. 컨트롤 텍스트 토큰 대응은 `control_links.zig`, 12바이트 원값의 유효성은 `number_control.zig`/기존 구역 검사가 소유합니다. 이 계층은 표시 번호의 증가·재시작, 본문 표식과 주석 본문의 대응, 페이지/구역별 배치, 편집·저장을 구현하지 않습니다. `section_validation.zig`의 번호 ID 0 해석도 여전히 보류입니다.

## 검증 경계

`zig test src/root.zig --test-filter 'HWP5 note number links'`에서 일치, 누락, 복수, 두 직접 리스트에 분산된 자동 번호, 종류/번호 불일치, 32비트 주석 번호의 상위 비트, 잘못된 `autn` 별칭, `spec8` 불투명, 명시적 `observed16`의 1바이트 잘림, 중첩 주석·형제 컨트롤 분리를 검사합니다. `node --test tests/hwp5/note-number-links.test.mjs`는 독립 oracle 자체의 소유권·종류·번호 반례를 검사합니다. 테스트용 WASM 문서 보고서의 8개 필드는 `tests/hwp5/note-number-links.mjs`가 원시 Section 레코드 수준을 따로 읽어 대조합니다. 이 독립 대조는 **선택된 실파일의 문서 보고서**에 한정되며 모든 HWP5 포맷 또는 저장 동작의 검증이 아닙니다.

2026-09-27 실파일 확인: legacy의 `footnote-endnote.hwp`에는 자동 번호 4건, `reference/rhwp/samples`의 `footnote-01.hwp`에는 9건, `endnote-01.hwp`에는 6건, `footnote-tbox-01.hwp`에는 2건이었습니다. 네 파일 모두 테스트용 WASM의 구역 보고서 8개 필드와 독립 JS 원시 레코드 결과가 `[N,0,0,N,0,N,0,0]`으로 일치했습니다. 뒤의 세 파일은 로컬 `reference/rhwp`에 의존하는 수동 대조이며 기본 audit에 들어가지 않습니다. `reference/rhwp/samples/task1725/text_footnote_tail_overpagination.hwp`에서는 자동 번호 부재/복수 주석도 사전 관측되어 정확히 한 개를 강제하지 않았지만, 이 파일은 문서 보고서 대조까지 통과했다고 주장하지 않습니다. 거부·암호화·손상 파일을 포함한 전체 corpus의 지원률로도 해석하지 않습니다.

같은 날 최초 `zig build test --summary all`은 종료 코드 0·2,653/2,653 테스트 통과, `zig build -Doptimize=ReleaseSafe`는 종료 코드 0이었습니다. 이어 `observed16` 잘림과 두 직접 리스트 반례를 추가한 후의 최종 `zig build audit -Doptimize=ReleaseSafe --summary all`은 종료 코드 0·43/43 단계·2,694/2,694 테스트 통과였습니다. 추가 반례는 Debug·ReleaseSafe·ReleaseFast 집중 테스트에서도 통과했습니다. HWP5 WASM audit의 전체 호출은 8,905,837회로 집계됐으나 이 수치는 모든 포맷 필드 지원률을 뜻하지 않습니다. Zig 테스트 러너의 `failed command:` stderr는 [별도 판정 근거](zig-test-stderr.md)에 따라 종료 코드와 최종 요약으로 판정했습니다.
