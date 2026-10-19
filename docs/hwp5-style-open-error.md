# HWP5 글자 모양 조회의 이전 열기 오류

CFB 보정 전 세션 열기가 실패한 경우 `attachHwp5Styles`는 openError를 표시합니다. 사용자가 명시적으로 보정 편집을 연 뒤에는 editor.characterShapes가 성공해 실제 글자 모양 배열을 받으므로, 이전 열기 오류가 현재 조회 오류로 남아서는 안 됩니다.

성공한 조회는 characterShapesError를null로 갱신합니다. 조회 자체가 실패하면 새 오류를 표시하며, 세션이 없으면 원래 openError와 shapes:null을 유지합니다. 전역 열기 진단이나 CFB 보정 동의 정책을 삭제하지 않고 응답의 현재 글자 모양 오류만 정합화합니다.

`style-open-error.test.mjs`는 성공/새 오류/세션 부재 세 경계를 검사합니다. 수정 전 성공 경계에서 실제 실패를 확인했고 수정 후 통과했습니다. 실제 normalized-worker 회귀도 enable과 입력 후 error:null·글자 모양 배열 존재를 요구합니다. 별도 source-tree 후보의 빈 셀 Worker를 함께 실행한 세 파일5/5·skip0이며, 해당 native 후보의 표/페이지 복구나 전체 조판 완료와 혼동하지 않습니다.

게시용 main 사본 `/tmp/hwpjs-style-error-publish.cw460o`에서 현재 기본30434b54 WASM을 명시한 모사/실제 Worker 두 파일4/4·skip0·exit0과 build.zig fmt check도 통과했습니다. 기존 표·페이지 조회 실패를 이 표시 오류 수정으로 해결했다고 주장하지 않습니다.
