# Canvas 직접 텍스트 입력 실험

HWP5 텍스트 화면의 최상위 단순 문단에 마우스를 올리면 I-beam, 클릭하면 caret, 드래그하면 선택 영역을 Canvas에 그립니다. 첫 클릭이 실험용 편집 세션을 엽니다. 별도 숫자 입력 폼은 접힌 고급 API 실험으로 남깁니다. [native 편집 API](hwp5-editor-api.md)의 적격성·범위·저장 정책을 완화하지 않습니다.

## 책임과 SSOT

- `content.mjs`: 구역/문단 식별자와 보수적인 직접 편집 후보 여부. 중첩·제어 포함·텍스트 없는 문단과 UTF-16 표시가 잘린 문단은 후보에서 제외합니다. 실제 허용 여부는 native 명령이 최종 판정합니다.
- `layout.mjs`: 기존 줄 흐름에 문단 식별자·UTF-16 시작/끝과 grapheme별 폭/경계를 추가합니다. 행 한도로 문단이 일부만 생성되면 해당 문단 전체를 편집 후보에서 제외합니다.
- `text-geometry.mjs`: CSS 픽셀·스크롤 문서 좌표에서 hit-test, 줄 경계 affinity, caret 위치·선택 사각형을 계산합니다. DPR은 그리기만 확대하며 UTF-16 위치에 곱하지 않습니다.
- `text-navigation.mjs`: 같은 문단 안의 grapheme 이동, Shift 선택, 줄 Home/End·상하 이동을 소유합니다.
- `text-input.mjs`: 문자열 차이에서 surrogate를 자르지 않는 UTF-16 교체 범위를 계산합니다. 문서 토큰·서식 이동·저장은 재구현하지 않습니다.
- `canvas-editor.mjs`: 포인터/DOM 입력·조합·단일 진행 명령과 임시 입력 상태를 연결합니다. 실제 편집은 기존 Worker→JS→Zig 명령에만 위임합니다.
- `renderer.mjs`: 동일 grapheme 폭으로 텍스트·선택·깜빡이는 caret·임시 조합 밑줄을 그립니다. 리사이즈·스크롤에 따라 위치를 다시 계산하며 입력 대상도 caret 근처에 둡니다.

Zig 세션이 확정된 문서 값의 단일 출처입니다. textarea 값은 현재 문단의 입력 중 임시 사본이지 저장 모델이 아닙니다. 한 명령만 진행하며 그동안 이어진 입력은 임시 버퍼에 남겨 두고, native 응답으로 확정한 텍스트를 기준으로 다음 차이만 보냅니다. 표시 결과를 임의로 native 확정값으로 승격하지 않습니다.

## 키보드·조합·실패

투명한 2px textarea를 `display:none`이나 화면 밖에 숨기지 않고 실제 caret 근처에 배치합니다. 클릭 시 포커스를 전달하고 브라우저의 문자열 입력·삭제·plain-text clipboard 경로를 사용합니다. Canvas는 폰트/원본 조판 대신 현재 시스템 글꼴의 실험용 흐름을 계속 사용합니다.

Left/Right는 grapheme 경계, Up/Down은 현재 표시 줄, Home/End는 표시 줄 끝으로 이동합니다. Shift는 같은 문단의 선택을 확장하고 Ctrl/Meta+Home/End는 문단 끝으로 이동합니다. Ctrl/Meta+A는 현재 문단 전체를 명시적으로 선택합니다. 일반 브라우저의 복사/잘라내기/붙여넣기도 현재 textarea 문단 범위입니다. 문서 전체 선택이 아닙니다. 포인터 드래그는 같은 문단으로 제한합니다. 문단 분할/병합·Enter·실행 취소/다시 실행·단어 이동 규칙·완전한 키보드 접근성·모바일 선택 핸들은 미구현입니다.

`compositionstart`부터 중간 DOM 값을 임시 Canvas에 표시하되 native 명령은 보내지 않습니다. `compositionend` 뒤 최종 DOM 값을 반영하며 뒤따르는 최종 input 이벤트와 중복 적용하지 않습니다. IME 문자열은 이벤트 data를 수동 이어 붙이지 않습니다. 파일 재선택은 조합/임시 선택을 비우고 이전 Worker를 종료합니다.

native 거부 시 임시 입력과 대기 입력을 버리고 확정 텍스트/유효 선택을 복원하며 오류를 알립니다. 변경 성공 뒤 표시 갱신 실패는 기존 API처럼 재선택을 요구합니다. 변경 후 표시 projection이 잘리면 직접 입력을 중단합니다. 특히 부분 문자열을 확정 문단으로 삼아 대기 입력을 재전송하지 않습니다. 이미 성공한 변경은 native 모델에 유지됩니다.

웹 다운로드·서식/페이지 조판·HWPX 직접 편집은 추가하지 않습니다. 원본 파일은 변경하지 않습니다. RTL/복잡한 shaping·원본 폰트와 글자 폭 동등성은 여전히 미지원입니다.

## 2026-10-01 검증

새 집중 검사 16개(하위 실파일 검사 5개 포함)는 grapheme/UTF-16 경계·줄 affinity·선택 사각형·빈 문단·문단 소유·표시 한도·121개 문자열 쌍의 교체 재구성, native WASM에 연결한 실파일 5개(`charshape`, `parashape`, `linespacing`, `facename`, `underline-styles`)의 연속 입력, 조합 종료 단일 반영, newline 거부 후 복원, reset 후 늦은 조합 종료, 부분 표시 응답 뒤 재전송 방지, 명시적 전체 선택/전체 삭제 뒤 재입력을 검사합니다. DOM 장치를 모사하되 native 편집은 제품 WASM을 사용합니다. 명령은 [개발 명령](development-commands.md)이 소유합니다.

agent-browser Chromium의 외부 공개 화면에서 실제 `charshape.hwp`로 I-beam·클릭·caret·`한😀` 삽입·이모지 Backspace·드래그 선택 교체·Home/Shift 선택을 확인했습니다. 합성 composition 이벤트로 중간 Worker 명령 0건, 종료/최종 input 뒤 splice 1건을 관측했습니다. Enter 거부·newline 입력 거부 후 복원·조합 중 다른 파일 재선택 후 이전 문자열 누출 없음도 확인했습니다. 390×844 viewport에서 실제 삽입 텍스트 줄바꿈·상하 이동/Shift+End 선택과 가로 넘침 없음을 확인했고 브라우저 오류 목록은 비어 있었습니다. 스크린샷은 `/private/tmp/hwpjs-canvas-direct-selection.png`와 `/private/tmp/hwpjs-canvas-direct-wrap.png`입니다.

자동 조합 이벤트는 실제 macOS 한글 HID 입력/후보창 증명이 아닙니다. 실제 한글 입력기·후보창 위치·클립보드 OS 권한·Safari/Firefox·실제 모바일·최대 크기 부하는 별도 미검증입니다.

브라우저의 기본 Meta+A에 위임했을 때 전체 선택이 되지 않은 반례를 확인했습니다. Ctrl/Meta+A 명시적 선택 처리로 수정한 뒤 Chromium에서 선택 범위 `[0, 6)`과 native 반영 완료까지의 전체 삭제, 빈 문단에 `복원😀` 재입력 성공을 확인했습니다. 이는 기본 OS 키 동작 전체를 검증한 결과가 아닙니다.

최종 집중 API/직접 입력 검사 21개는 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. 기존 CFB/미리보기/문서 검사와 합친 Node 51개, ReleaseSafe 전체 Zig 2,687개와 제품 WASM 빌드도 통과했습니다. 완전한 문서 편집기나 전체 명세 완료를 뜻하지 않습니다.
