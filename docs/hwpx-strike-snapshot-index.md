# HWPX 취소선 전체 조회의 요청 내 색인

## 원인과 책임

2026-10-11 게시88ea9d74의 별도 복사본 Worker에 읽기 전용 조회 시간 계측을 추가했습니다. 고정fe97 WASM의 행정업무 편람 load81602.11ms·enable78184.54ms·후반 구간36093.06ms에서 `characterStrikes`는 각각26628.90/26678.06/26778.04ms였습니다. 여러 도형 조회도 비용이 크므로 취소선만으로 전체 지연을 해결했다고 주장하지 않습니다. 제품 Worker/기본 WASM에는 계측 코드를 적용하지 않았습니다.

원인은 `character_strike_snapshot.read`가 원본 리소스 ID마다 `character_strike_current.read`를 호출하고, 각 호출이 같은 헤더의 앞부분부터 글자 모양 전체 필드를 다시 읽는 경로였습니다. 수정은 요청마다 원본 ID의 상태 색인을 한 번 만들고 현재 sparse 편집값을 결합합니다. 색인은 해당 조회가 끝나면 해제하며 문서/이력 revision 사이에 캐시하지 않습니다.

`character_strike_current`는 편집 의도 해결과 원본 요소의 취소선 의미 판정을 계속 단독 소유합니다. 단일 조회는 기존 경로를 유지하고 전체 조회만 같은 의미 함수를 재사용합니다. 원본 부재=false·미지원 shape=null·명시적 편집값·원본 상속을 구분합니다. 필요한 모든 원본 ID를 찾은 뒤에는 단일 조회들이 읽지 않던 미참조 후행 요소를 더 검사하지 않습니다. 이미 읽어야 하는 앞쪽 요소의 글자 모양 필드 검증과 잘못된 참조 오류는 유지합니다.

## 실측과 검증

ReleaseSafe 후보 `/tmp/hwpjs-strike-index-20261011/bin/hwpjs.wasm`, SHA256 `c44b65a1df20ca6708ab9dd36f4d3372221a60fd1a9a1fd1ee234f77815a303c`입니다. 같은 대형 원본의937상태 조회는 기존26769.46ms → 후보483.41ms로 약55배 개선됐으며 결과 전체와 원본 저장 바이트가 동일했습니다. 동시 실행 부하가 있는 한 번의 비교이고 전체 에디터/입력 처리의55배 개선이 아닙니다.

Git 추적 HWPX45개·554상태를 같은 기존/후보 getter로 대조해 출력·원본 저장 바이트가 같았습니다. 암호1파일의 EncryptedDocument도 같으며 성공으로 합산하지 않았습니다. 새 source index의 희소 ID·NONE/DOT/FUTURE/부재·미참조 후행 요소·할당 실패, 실제 원본12리소스/현재 명시 및 상속3리소스와 단일 조회 대조·전체 snapshot 할당 실패·잘못된 source 참조를 검사했습니다. root에 직접 등록한 집중 실행은3/3·exit0입니다. 첫 등록 전 두 실행은 root 진입 검사1개만 실행했으므로 새 테스트 통과로 세지 않습니다.

`HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/strike-editor.test.mjs`의 공개 transport·HWP5/HWPX DOT/범위 편집·독립 리소스 보존·거부 후 redo 회귀도6/6·fail/skip0입니다. Zig fmt/diff 검사와 별도 출력의 ReleaseSafe build는 exit0입니다. 후보는 현재 dirty 작업 트리의 별도 빌드이며 깨끗한 게시 소스 전체 회귀·기본 제품 승격은 아직 별도 게이트입니다. 기본fe97 WASM·실행 중 일반 문단 감사·3859테스트 native binary는 바꾸지 않았고 그 실행에 이 변경을 소급하지 않습니다.
