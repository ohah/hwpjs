# HWPX 각주·미주 본문 텍스트 편집

## 현재 계약

기존 native Session.splice와 공개 WASM/Worker 편집 경로에서 직접 `footNote/endNote → subList → p` 본문의 텍스트를 수정합니다. `retained_note_number.zig`는 첫 텍스트 사이트보다 앞에 있는 `run/ctrl/autoNum/autoNumFormat`을 원문 보존 가능한 번호 prefix로 판정합니다. 저장 모델의 SSOT는 기존 Sites이며 번호 값을 복제하거나 번호를 새로 생성하지 않습니다.

번호의 namespace·직접 소유·단일 자식·leaf 형식을 확인합니다. wrapper/번호/형식에 숨은 문자·CDATA·주석·처리 지시나 추가 자식이 있으면 거부합니다. 번호가 텍스트 사이에 있거나 주석의 직접 목록 문단 밖에 있으면 기존 UnsupportedParagraphControl을 유지합니다. 알려진 속성을 변경하거나 누락 기본값을 채우지 않으며 번호 속성 의미 검사는 [번호 컨트롤 원값](hwpx-number-controls.md)의 별도 책임입니다.

`plain_paragraph_policy.zig`가 이 보존 predicate를 연결하고 기존 위치·원자적 splice·XML 부분 writer·ZIP 저장기를 그대로 사용합니다. 번호는 현재 표시 텍스트에 포함되지 않는 prefix이며 번호를 삭제하거나 수정하는 명령은 아직 없습니다. 본문 텍스트 전체를 삭제해도 번호 XML은 유지됩니다.

## 검증

`note_edit_tests.zig`는 실제 footnote-endnote.hwpx의 2·3·5·6번 문단 편집, 네 autoNum 원문 일치, 저장·재열기·원래 세션 복원 ZIP 일치를 확인합니다. 합성 검사에는 잘못된 소유, 중간 번호, 필드 혼합, wrapper/번호/형식의 숨은 문자, 중첩 텍스트, 외부 namespace와 모든 할당 실패 뒤 현재 텍스트 보존을 포함합니다. Debug·ReleaseSafe·ReleaseFast 집중 필터 각각 4/4가 통과했습니다.

공개 `tests/hwpx/note-editor.test.mjs`는 네 본문에 `검증😀<&`를 삽입하고 독립 Python ZIP/ElementTree로 기대 텍스트 외 **전체 XML 요소·속성·본문·tail**와 나머지 ZIP payload를 비교합니다. 일반 Python·`-O` 모두 통과했습니다. 원문 번호를 포함하는 바깥 문단 거부, 서로게이트 분할 거부 뒤 저장 동일성, 원래 세션 복원, 저장 파일 재열기 후 무변경 저장도 검사합니다. 재열기 후 복원은 새 원본의 ZIP 압축 방식을 사용하므로 최초 파일 압축 바이트 복원과 혼동하지 않습니다.

공개 주석 검사 2/2에서 네 본문 전체 삭제·저장·재열기·재입력과 번호 유지도 확인했습니다. 독립 전체 XML/ZIP oracle은 번호 속성·본문·다른 ZIP payload 손상 세 가지를 일반 Python·`-O`에서 모두 거부했습니다.

실제 외부 Chromium에서 각주 문단 2를 포인터로 클릭해 `웹검증😀` 입력, 전체 삭제, `재입력😀` 입력과 native 응답·표시 갱신을 확인했습니다. 미주 문단 5의 `미주검증😀` 입력도 확인했습니다. 미주 첫 자동 클릭은 브라우저 화면 밖 좌표를 사용해 적용되지 않았으며 페이지 스크롤·실제 Canvas 좌표를 확인한 뒤 성공했습니다. 캡처 `/private/tmp/hwpjs-hwpx-note-e2e.png`와 `/private/tmp/hwpjs-hwpx-endnote-e2e.png`도 직접 확인했습니다. agent-browser inserttext 검증이며 실제 OS IME 또는 페이지 조판의 증명은 아닙니다.

ReleaseSafe 제품 빌드 5/5와 최신 반례를 포함한 제품 HWPX audit 20/20·빌드 7/7이 통과했습니다. 공개 fixture 전수 검사는 45개 파일(암호화 1개 별도)·1379문단에서 삽입/저장/복원 1170개, UnsupportedParagraphControl 161개, InvalidFormulaNumber 48개로 종료했습니다. 이전 단계 대비 주석 본문 4개가 추가로 편집됩니다. 최신 전체 ReleaseSafe native 회귀 2780/2780·빌드 7/7도 통과했습니다. 이 결과는 남은 구조 편집·주석 조판의 완료 증명이 아닙니다. 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

## 남은 범위

바깥 본문 문단의 주석 참조는 후속 [보호 앵커 편집](hwpx-anchor-text-positions.md)의 별도 위치 계약으로 연결합니다. 중간 번호의 위치 보호, 새 주석 생성/삭제, 표시 번호·증가/재시작 계산, 실제 쪽 하단/미주 배치와 원본 페이지 조판은 미완료입니다. 이 변경은 모든 컨트롤 문단 허용이나 주석 UI 완료가 아닙니다. OS IME는 이번 검사로 증명하지 않습니다.
