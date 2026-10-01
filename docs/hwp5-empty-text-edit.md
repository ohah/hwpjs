# HWP5 기존 빈 문단 텍스트 편집

[중첩 목록 편집](hwp5-nested-text-edit.md)의 소유권 검사와 [텍스트 명령](hwp5-plain-text-edit-experiment.md)의 원자성·저장 정책을 그대로 사용합니다. 새 문단 생성이나 표 구조 변경은 아닙니다.

## 원본과 편집 값

텍스트 레코드가 없고 선언 문자 수가 0 또는 1인 기존 문단을 빈 입력 후보로 처리합니다. 1인 생략 형식은 실제 픽스쳐에서 관측한 호환 정책이며 모든 생산자의 명세 준수를 주장하지 않습니다. 기존 글자 모양 run이 필요하며 없는 서식이나 문자를 추정해 만들지 않습니다. 선언 수가 1보다 큰 누락 텍스트는 계속 `UnsupportedMissingText`로 거부합니다. 기존 개수·리소스·소유권·제어 검사를 우회하지 않습니다.

`plain_text_content.editableTextBytes`만 편집용 논리 PARA_BREAK를 제공합니다. 원본 읽기와 `copyText`는 생략된 텍스트를 여전히 0바이트로 반환합니다. 빈 splice나 빈 범위 서식 명령은 원본을 바꾸지 않습니다. 실제 삽입이 성공하면 기존 스타일을 상속한 텍스트와 끝 PARA_BREAK를 모델에 반영하고 `text_present=true`로 전환합니다. 모든 할당·검사를 마친 뒤에만 값을 반영합니다.

`text_section_writer`는 불변 원본 Tree와 기존 직접 자식 수집기를 사용합니다. 원본에 텍스트 레코드가 없는 수정 문단에만 헤더 다음 level+1 PARA_TEXT를 삽입합니다. 원본에 길이 0의 텍스트 레코드가 있으면 기존 레코드를 교체합니다. 반복 명령·저장에도 텍스트 레코드를 중복 생성하지 않습니다. 원본 존재 여부를 별도 가변 캐시로 복제하지 않습니다.

삽입 후 전체 삭제는 명시적 PARA_BREAK 문단을 남기며 원래 생략 표현으로 되돌리는 명령은 아닙니다. 기본 저장은 여전히 `LayoutReflowRequired`를 반환합니다. opt-in 저장은 레코드 보존 실험이며 줄 캐시·표 크기·페이지 조판의 재계산을 보장하지 않습니다.

## Canvas 경계

표시 projection은 선언 수 0/1의 누락 문단만 빈 입력 후보로 제공합니다. 최종 허용은 native가 판정합니다. Worker는 실제 텍스트 응답이 있을 때만 표시 존재 여부를 갱신하며 0바이트 무변경 응답에는 원래 projection을 유지합니다. JS는 논리 PARA_BREAK나 저장 레코드를 생성하지 않습니다.

## 2026-10-01 검증

`empty-editor.test.mjs`는 실제 table·table2·software·example·facename의 빈 문단에서 무변경, 삽입, 반복 삽입, 전체 삭제, 저장·재열기를 검사합니다. 독립 CFB.js/Node 레코드 oracle이 전체 Section과 비대상 스트림을 대조합니다. 선언 수 0의 생략/길이 0 텍스트, 비어 있지 않은 누락 텍스트, 서식 누락 반례도 포함합니다. native 할당 실패 검사는 실패 후 원래 텍스트 부재와 byte-exact 저장을 확인합니다.

ReleaseSafe 전체 Zig 2,689개, Debug·ReleaseSafe·ReleaseFast 제품 편집 집중 Node 각 43개, 별도 Canvas/빈 문단 projection 검사 포함 Node 25개가 통과했습니다. 이 수치는 전체 편집 기능 완료를 의미하지 않습니다.

추적 HWP 전수 검사에서는 1,481문단 중 1,095개가 삽입·저장 원시 텍스트 대조를 통과했습니다. 나머지는 텍스트 제어 228개·구역 제어 157개·중첩 소유 1개로 거부됩니다. HWP 3개는 미리보기 단계에서 거부되며 추적 HWPX 45개는 공개 파서/편집 연결이 아직 없습니다. 지원 거부를 성공으로 계산하지 않습니다.

agent-browser로 공개 Chromium 화면에서 software의 원본 빈 중첩 문단 1을 좌표 클릭했습니다. `한😀` 입력과 Worker 확정 응답, Backspace의 이모지 삭제, Meta+A/Backspace 전체 삭제, `재입력😀` 재입력과 대체 텍스트 반영을 확인했습니다. 브라우저 오류 목록은 비어 있었고 `/private/tmp/hwpjs-empty-software-input.png`에서 렌더링과 caret를 확인했습니다. 자동 Unicode 입력은 실제 OS IME 검증이 아닙니다.

실행 명령은 [개발 명령](development-commands.md)이 소유합니다. 제어 포함 텍스트·문단 생성/분할·원본 페이지 레이아웃·HWPX 공개 편집은 아직 남아 있습니다.
