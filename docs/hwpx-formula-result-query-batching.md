# HWPX 계산 결과 조회 후보 최적화 실험

## 문제와 설계

현재 `formula_result_targets`는 문단마다 구역 전체의 현재 계산 결과를 준비합니다. aift.hwpx의 조회 프로파일에서 정밀 조회111회가 로딩·편집 활성화 각각 약92초를 차지했습니다.

`/tmp/hwpjs-formula-paragraphs.p5JzbK`에서 main 3ede84f4를 기준으로 별도 후보를 검증 중입니다. 아직 본 코드·기본 WASM·외부 데모에 반영하지 않았습니다.

- `formula_result_paragraphs.zig`는 기존 `formula_current_snapshot.readFlat`을 한 번 실행하고 준비된 result site의 원본 소속에서 현재 전역 문단 번호를 얻습니다. 연결·현재값 오류를 먼저 검사하며 source/current 문단 이동을 구분합니다.
- 새 optional `hwpx_edit_manual_formula_result_paragraphs`는 정렬·중복 제거된 one-based 번호를 반환합니다. JS decoder는 양의 uint32·정렬·중복을 검사합니다.
- Worker의 filter는 표시 요청 하나에만 존재하며 구역당 한 번 조회합니다. 없는 ABI는 기존 정밀 조회로 돌아갑니다. 수정 뒤에도 남는 계산 결과 캐시를 만들지 않습니다.
- 목록은 조회 후보의 상위집합일 뿐 편집 권한이 아닙니다. 기존 target/display/range 명령과 중첩·제어·UTF-16 검증은 유지합니다. 빈 결과 문자열도 site 소속을 통해 후보에 남습니다.

## 현재 증거

제품 후보 e298cf28c350da7e797a229dceb01705eb7e8595f6d295530da3eb334d91ed4c는 ReleaseSafe 빌드 재시도 exit0입니다. 첫 빌드는 디스크 부족으로 exit1이었고 완료 로그가 없어 통과로 세지 않습니다. 기존8fa 후보의 export334개는 유지하고 optional 함수1개를 추가했습니다. 이름·종류 호환 검사이며 signature/전체 동치 증거가 아닙니다.

native 집중 바이너리 f237e8421e9c47efe6c22e6dc4c967b6d325bd2eb4e40fcfad10b4fb3eeb178c는4/4·fail/skip/log/leak0·exit0입니다(root 등록1개+assertion3개). 현재 override·전체 부분 할당 실패·원문/저장 불변·source/current 이동·깨진 연결의 기존 오류 유지를 확인했습니다(`native-negative-guard.jsonl`). 너무 짧아 footprint 표본이0인 것을 실제 메모리 사용0으로 해석하지 않습니다. 첫 guard 실행은 도구 경로가 없어 native를 실행하지 못했으며 별도 실패로 남겼습니다.

순수 decoder/filter와 실제 chart13개 필드의 공개 API·현재 폭·빈 문자열/공백/emoji·undo/redo·조회 불변 검사는4/4·fail/skip/cancel0·exit0입니다(`formula-candidate-focused.log`). 기존 계산 결과 회귀는33/33·fail/skip/cancel0·exit0입니다(`formula-regressions.log`,58,651ms).

별도 프로파일은1/1·exit0이며 로딩23,679ms·활성화21,817ms, 각 정밀 조회1회·후보 조회1회입니다(`formula-candidate-profile.log`). 이전00c5 측정의113,762ms·111,770ms 및 각 정밀 조회111회와 비교한 예비 관측입니다. 이전 실행과 환경 전체를 통제한 단일 변수 벤치마크나 실제 브라우저 수치로 주장하지 않습니다.

## 남은 검증

같은 Worker JS와 old/new WASM을 한 프로세스에서 비교하는 `formula-result-worker-parity.test.mjs`가 실행 중입니다. 전체 load/enable/window 응답·권한·원문 저장을 대조하며 아직 전체 통과로 세지 않습니다.

Canvas 입력·독립 저장 oracle 재검사는1/1·fail/skip/cancel0·exit0입니다(`formula-candidate-memo-canvas-retry.log`,101,934ms). 첫 Canvas 후보 검사는 oracle 임시 입력 쓰기의 ENOSPC로 실패했으며 재시도와 합산하지 않습니다. 이 검사는 실제 Worker/WASM과 모의 DOM/Canvas이며 실제 브라우저 검사가 아닙니다. 제품 승격 전 전체 응답 대조·실제 브라우저·원본 corpus 검증을 별도로 확인해야 합니다.
