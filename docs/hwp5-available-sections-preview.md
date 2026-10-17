# 명시적 HWP5 저장 구역 읽기 전용 미리보기 후보

## 계약

기본 `readText()`와 편집 세션 열기는 기존 `SectionCountMismatch` 거부를 유지한다. 새 `readAvailableText(input)`은 호출자가 명시적으로 요청한 경우에만 저장된 연속 구역을 읽는다. DocInfo나 CFB를 저장·교체하지 않고 없는 구역을 만들지 않으며 편집 세션을 만들지 않는다. 원본 전체 복원이나 편집 완료 기능이 아니다.

반환값은 기존 텍스트 packet의 복사된 결과에 `readOnly:true`, `primarySource:"available_bodytext"` 또는 `"available_viewtext"`, `sectionInventory:{declared,available,mismatch}`를 추가한다. 숫자가 같아도 명시적 경로는 읽기 전용이다. `declared`와 `available`은 1..1024이며 선언 0·한도 초과, 비연속/빈 구역 집합, 비정규 번호·예상 밖 본문 스트림, 기존 암호화/DRM 거부 정책을 우회하지 않는다.

## 책임과 수명

`text_source.zig`가 같은 CFB·헤더·DocInfo·번호 스트림 파서를 사용해 두 개수를 보존한다. `text_preview.zig`의 공통 `encodeSource`가 기존 H5T1 encoder를 재사용한다. `hwp5_text_read_available`과 `hwp5_text_declared_sections`는 기존 결과 버퍼 수명에 연결되고 실패/해제 때 선언 수도 초기화된다. 별도 원본 캐시·편집값은 없다.

JS adapter는 두 새 export와 기존 배포용 상태 export가 없으면 `AvailableSectionsPreviewUnavailable`을 반환한다. 엄격 읽기로 조용히 대체하지 않는다. 기본 `readText` JSON에는 새 메타데이터를 붙이지 않아 기존 응답 계약을 유지한다.

## 2026-10-18 분리 검증

main `657694ae` 기반 별도 소스의 ReleaseSafe 제품 빌드는 5/5 단계 통과했다. 후보 SHA256은 `f1bac932653ee0f60edabebfc54e2b82e03fca98fa8919281faf9ef7a63a52c6`이며 main native 계열 `c8c6e8ab17e1e2426e01c1ec70293912c04a86dfcba1aa572df5a420479ff9c5`의 export 317개 이름·종류를 유지하고 두 개만 추가한다. 이 후보는 별도 차트 native 통합을 포함하지 않으므로 기존 기본 WASM의 대체본이 아니다.

native probe 포함 Debug·ReleaseSafe 각각 4/4·실패/skip/누수 0이다. 작은 strict CFB의 전체 할당 실패 주입, 원본 불변·기본 읽기/편집 거부, 선언이 실제보다 적거나 많은 경우, 번호 공백·잘못된 이름·빈 집합·한도·배포용 ViewText·암호화 거부를 검사한다.

공개 API와 기존 원본 검사 묶음은 7/7·실패/skip 0이다. [독립 검사한 원본 세 개](hwp5-section-count-refusals.md)의 1/2/1구역과 118/23/2,614문단을 읽었고, 독립 oracle이 찾은 선언 필드만 실제 개수로 바꾼 테스트용 복사본의 엄격 reader 응답 전체와 대조했다. 원본 SHA256·기본 거부·실패 뒤 메타데이터 초기화·닫힌 reader·새 export 각각을 제거한 optional ABI 반례도 확인한다. fixture 기대값은 두 검사에서 `section-count-fixtures.mjs`를 공유한다.

## JS·Worker·선택 UI 통합

기본 열기의 정확한 `SectionCountMismatch`와 전체 native capability가 함께 있을 때만 `저장된 구역만 보기 (읽기 전용)` 버튼을 제공한다. 자동 재시도는 없다. `available-sections-controls.mjs`는 선택한 File 참조·버튼·오래된 응답 수명만 소유하며 파일 선택/닫기에서 지운다. `hwp5-available-preview.mjs`는 명시적 load 옵션·capability·읽기 전용 projection을 분리한다. 개수의 JS 경계 검사는 `hwp5-section-inventory.mjs`를 API와 Worker/UI가 공유하며 형식 parser를 재구현하지 않는다.

Worker는 이 모드에서 editor를 만들지 않고 모든 load 이외 명령을 `AvailableSectionsReadOnly`로 거부한다. 배포용/보정본 동의나 저장 동의로 우회할 수 없다. 옵션 값은 기존 세션을 닫기 전에 검사하므로 잘못된 load 요청이 기존 편집·redo를 지우지 않는다. 기본/구형 WASM에 새 native ABI가 없으면 버튼을 광고하지 않으며 기존 엄격 거부·정상 파일 편집을 유지한다.

2026-10-18 후보와 기존 기본 WASM을 함께 명시한 API·Worker·UI·기존 이력/실패/저장/시작 회귀는 38/38·실패/skip 0이다. 기존 기본 WASM만으로 기존 Worker·UI/저장 회귀도 22/22·실패/skip 0이다. 배포용 ViewText의 파생 입력도 읽기 전용과 동의 우회 거부를 확인한다. 이 테스트는 독립 count oracle이 원본 `distribution.hwp`의 DEFLATE 꼬리를 거부한 최초 실패 뒤, 테스트용 복사본의 압축 봉투만 정규화하고 선언 값을 바꿨다. oracle이나 제품 decoder를 완화하지 않았으며 원본 파일은 변경하지 않는다.

분리 main 기반 서버와 위 후보 WASM을 사용한 실제 Chromium에서도 세 원본을 각각 오류→버튼 선택→118/23/2,614문단 Canvas 표시로 확인했다. 선언/저장 개수와 원본 불변 경고를 표시하고 편집 시작·다운로드·Canvas textarea는 비활성이다. 이후 정상 charshape.hwp의 7문단을 열어 경고 초기화·편집 시작·다운로드 가능 상태를 확인했다. 두 화면 캡처를 직접 검토했으며 수집한 브라우저 오류는 없었다. 브라우저 active=false/PID 없음과 임시 서버 listener 없음/exit130도 확인했다. OS IME·원본 페이지 조판·누락 내용 복원을 증명하지 않는다.

검증한 native 구현·선택적 JS API·Worker·UI와 검사를 main 소스에 통합한다. 전체 native gate·기본 WASM·외부 데모 artifact 승격은 아직 미완료다. 기존 기본 WASM을 사용하는 배포 화면에서 버튼을 사용할 수 있다고 주장하지 않는다. 실행 명령은 [개발·검증 명령](development-commands.md)이 소유한다. 과거 후보의 집중 검사 수치를 현재 main 전체 검사 완료로 대체하지 않는다.

기본 reader의 참조 975경로 전수 대조는 기존 main native 계열과 전체 JSON 응답 944개 동일·같은 거부 5개·범위 밖 HWP3 26개로 exit0 종료했다. 명시적 API를 기본 동작으로 바꾸지 않았다는 증거이며 같은 거부를 지원 성공으로 세지 않는다.

JS reader 개정도 따로 대조했다. 같은 `c8c6e8ab17e1e2426e01c1ec70293912c04a86dfcba1aa572df5a420479ff9c5` WASM에 변경 전/후 JS reader를 각각 연결해 HWP5 513경로의 입력 해시와 전체 응답을 비교했다. 509개 응답 동일·4개 동일 거부이며 두 artifact를 모두 새 JS로 읽은 비교와 구분한다.
