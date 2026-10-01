# Canvas 편집본 다운로드

## 책임과 계약

`document-save.mjs`는 Worker의 native 편집 세션에 저장을 위임합니다. Canvas 표시·textarea 초안은 저장 모델이 아닙니다. HWP5는 `allowStaleLayout` Boolean을 기본 false로 전달하고 native의 조판 검증을 우회하지 않습니다. HWPX는 원본 줄 배치 재계산을 하지 않으므로 결과를 보수적으로 재조판 필요 상태로 안내합니다.

`document-download.mjs`는 유효한 비어 있지 않은 Uint8Array snapshot을 Blob으로 내려받습니다. 원래 이름의 경로·제어 문자를 제거하고 `.edited.hwp` 또는 `.edited.hwpx`를 붙입니다. 원본 파일을 덮어쓰거나 서버로 전송하지 않습니다. 임시 링크는 제거하고 Object URL은 지연 해제합니다.

`app.mjs`는 세션 준비·명령 처리·Canvas 초안 반영 상태를 확인합니다. `canvas-editor.mjs`의 settled는 조합 중·native 명령 대기·아직 반영되지 않은 textarea 입력일 때 false입니다. 저장 요청은 현재 선택을 초기화하지 않으며 응답 후 대기 입력 pump를 재개합니다. 저장/다운로드 실패는 native 문서를 닫거나 현재 내용을 지우지 않습니다. 파일 전환은 generation으로 이전 응답과 오류를 무시하고 저장 허용 체크를 초기화합니다.

HWP5에서 변경 후 미재조판 저장이 필요하면 사용자가 별도 체크를 선택해야 합니다. 이 선택은 원본 줄 배치의 정확성·한컴 렌더링 동등성을 보장하지 않습니다. Enter·구조 편집·실행 취소·전체 조판은 이 기능의 완료 범위가 아닙니다.

`worker-generation.mjs`의 동일 guard가 Worker 성공 응답과 오류를 모두 걸러냅니다. 이전 Worker 오류의 generation 확인보다 먼저 편집 상태를 초기화하던 경로를 점검해 초기화를 guarded fail 내부로 제한했습니다. generation이 바뀐 뒤 이전 파일의 저장 성공·오류를 주입한 회귀에서 다운로드 횟수와 현재 준비 상태가 유지되고 현재 generation 이벤트만 반영됨을 확인했습니다. 이는 실제 앱에 사용하는 guard의 반례이며 브라우저 Worker 오류를 주입한 E2E는 아닙니다.

## 검증 기록

최신 제품 검증은 HWP5 75/75·HWPX 26/26·빌드 9/9입니다. 이후 HWPX Worker 집중 검사 5/5에 추적 45개 파일의 저장 분류를 추가해 비암호화 44개의 무변경 snapshot 바이트가 원본 ZIP과 일치하고 암호화 1개에서 load/save가 거부됨을 확인했습니다. 별도 공개 HWP5 세션 조사도 48개 중 45개의 무변경 저장 바이트가 원본과 일치했으며 distribution/viewtext 두 배포용 파일과 password 한 암호화 파일을 명시적 미지원으로 분리했습니다. 무변경 저장 검사는 모든 문단 편집·원본 조판 호환성의 대체가 아닙니다.

저장 대기 중 새 입력 회귀: native 원값과 textarea 초안을 분리한 채 저장 실패 응답을 받으면 입력 pump가 재개되고 초안이 native 모델에 정확히 한 번 반영됩니다. 저장 대기 때 settled=false와 원래 native 텍스트, 실패 후 요청 한 건·최종 텍스트·settled=true를 확인했습니다. 최신 Canvas/저장 집중 검사 23/23 통과입니다.

실제 HWP5 Worker 집중 검사 3/3: 세션 열기 전 EditorNotOpen, 무변경 저장의 원본 바이트 일치, 변경 뒤 기본 저장 LayoutReflowRequired 거부, 문자열 허용 옵션 거부, 이후 추가 입력과 명시적 허용 저장, 공개 native 재열기와 반복 저장 바이트 일치를 확인했습니다. 모사 Worker 환경의 실제 제품 WASM 검사이며 한컴 GUI 조판 비교는 아닙니다.

최종 전체 ReleaseSafe native 회귀는 2791/2791·빌드 7/7·종료 코드 0으로 완료됐습니다. 포맷·diff 검사, 로컬 링크 3042개 대상 누락 0, 문서 도구 2/2도 통과했습니다. 이 단계의 완료는 전체 파서·문단 구조 편집·원본 조판·RHWP 수준 UI 완료를 뜻하지 않습니다.

실제 외부 Chromium에서 shapeline.hwpx를 포인터 선택해 `저장😀`를 입력하고 버튼으로 `/private/tmp/hwpjs-download-shapeline.hwpx`를 다운로드했습니다. 공개 native 세션에서 보호 앵커 두 개와 텍스트를 확인하고 재저장 ZIP 바이트 일치, 웹 재업로드의 대체 텍스트도 확인했습니다. charshape.hwp는 허용 체크 없이 LayoutReflowRequired로 거부되면서 입력을 유지했고 체크 후 `/private/tmp/hwpjs-download-charshape.hwp`를 다운로드했습니다. 공개 세션과 웹 재업로드 모두 편집 텍스트를 확인하고 파일 전환 후 허용 체크 초기화·버튼 비활성도 확인했습니다. `/private/tmp/hwpjs-download-e2e.png` 화면을 직접 관찰했습니다. agent-browser 스킬은 실제 포인터·다운로드·재업로드 검증에 사용했고 OS 한글 IME·한컴 조판은 검증하지 않았습니다. 아래 초기 '브라우저 검증 전'은 이 두 파일의 결과로 대체하며 오래된 Worker 오류 주입 검증은 아직 남아 있습니다.

집중 Canvas/저장 검사에는 조합·반영 대기 저장 차단, 선택/내용 보존, native 저장 옵션·잘못된 입력 거부, 다운로드 클릭 실패 시 링크/URL 정리가 포함됩니다. 실제 HWPX Worker 저장 바이트는 공개 reader로 다시 읽고 잘못된 저장 옵션 거부 뒤 같은 snapshot임을 확인했습니다. 저장·다운로드 반례는 정규 hwp5-editor-audit에 포함했습니다. 이는 OS 한글 IME 실측이 아닌 모사 이벤트·제품 WASM 검사입니다.

명령은 [개발·검증 명령](development-commands.md)이 소유합니다.
