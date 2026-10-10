# 통합 코어 게시 후보

2026-10-10 WASM 진입점 `src/wasm.zig`에서 literal Zig import의 의존 파일1152개를 확인했고 미해결 import는 없었습니다. 현재 HEAD와 다른 의존 파일660개만 별도 Git index에 선택하여 tree `f0a8a4a8aab8dd6277376dad45c67cc70bc08075`를 만들었습니다. 무관한 레거시·워크스페이스 상태·문서 변경은 이 선택에 포함하지 않았습니다. 이 tree는 아직 main의 통합 코어 커밋이 아닙니다.

별도 export `/tmp/hwpjs-current-core-publish.awQqex`에서 ReleaseSafe 빌드·root native 테스트 컴파일(`--test-no-exec`)이 exit0이고 선택한660파일의 포맷 검사가 통과했습니다. 테스트 컴파일은 실행 통과가 아닙니다. 결과 WASM SHA256은 `0942a2c1e40692d02c3500aa58f13399041049b314b92a5e02950755ae8acb63`입니다.

이 후보의 실제 HWP5 하이픈/제목표시/숫자 수식과 HWPX 다단 제목/빈 표 셀 공개 검사5파일7/7·skip0·exit0, HWPX 숫자 입력/수식 정의/Worker3파일4/4·skip0·exit0을 확인했습니다. 정확한 수식 문자열 검사의 별도 범위는 [정확 비교 기록](hwpx-formula-exact-validation.md)이 소유합니다. 서로 다른 artifact의 전수 결과와 합산하지 않습니다.

암호 관련5파일13/13·skip0·exit0도 같은 후보를 지정해 통과했습니다. 실제 HWP5 DES/AES·HWPX 복호화 payload 독립 대조, 잘못된 암호 재시도, 복호화 후 편집·저장/이력/재열기, 비밀 입력 정리와 평문 저장 동의를 검사했습니다. 암호 없이 일반 reader가 거부하는 상태와 명시적 암호 변환 API의 지원 범위를 구분합니다. 저장은 동의한 **평문 출력**이며 재암호화 저장 완료를 뜻하지 않습니다. 로컬의 `docs/hwp5-password-protection.md` 계약도 아직 통합 게시 대상에 남아 있습니다.

`deb854e3` 후보의574공개 테스트 파일과 `f0829039` native3838검사는 별도 snapshot으로 실행 중입니다. 신규 후보의 전체 실행으로 소급하지 않습니다. 기본 데모 WASM 교체·현재 root의 추가 테스트 등록·UI/controller 통합 게시·전체 참조 편집/조판 완료는 아직 미완료입니다.

## JS 어댑터 결합 확인

후속으로 HWP5/HWPX reader/editor/password 및 CFB의7개 JS 진입점을 body 실행 없이 실제 ESM linker로 연결했습니다.111개 로컬 모듈의 static import/export가 연결됐고, 변경된98개만 위 별도 index에 선택했습니다. 코어+API tree는 `daa53d2eb1f54a2c9ab88d9e2f0b9af5e89ef0bf`입니다. 이것도 아직 main 통합 커밋이 아닙니다.

이 tree의 JS 디렉터리를 별도 export에 반영하고 같은 `0942a2c1` WASM을 사용해 실제 HWP5 하이픈 문단·HWPX aligns 문단의 prefix 입력·저장·undo/redo와 HWPX 저장본 재열기를 확인했습니다. 실행은 exit0이며 HWP5 원본 입력도 불변입니다. 두 문서 smoke이지111모듈의 모든 API/오류 경로 검증이나 실제 Canvas 브라우저 검사가 아닙니다. 일괄 작업 트리 커밋은 하지 않았으며 나머지 사용자 변경도 유지합니다.
