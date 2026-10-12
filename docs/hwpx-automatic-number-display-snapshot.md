# 자동 번호의 화면 갱신별 조회 공유

## 원인과 수명

형광펜 원본의 Canvas Worker 입력/저장/undo/redo는 통과했으나304.3초가 걸렸습니다. 동일 후보 `df16a06ca5c5ced870fddcb9c82f4de94eeffda48fe1883c5e715a9435d5d9b8`의 별도 실제 load 호출 추적에서 automatic_number_sites124회/합계30,217ms, picture_owner82회/21,424ms가 관측됐습니다. 로그는 `zig-out/verification/markpen-source-input/worker-call-profile.log`이며 native exports를 시간 측정 래퍼로 호출한 진단 실행입니다. 프로파일러 비용을 포함하므로 원래 실행의 정확한 시간 분해로 해석하지 않습니다.

`retainedAutomaticNumberPlainText`는 중첩 note 문단마다 같은 구역의 전체 번호 source/sites를 다시 조회했습니다. `automatic-number-display-snapshot.mjs`는 **동기 화면 갱신 한 번**의 구역별 파생 결과만 소유합니다. Worker가 hwpxDisplay 진입 때 새 snapshot을 만들고 prefix 투영과 번호 부착이 이를 공유합니다. 모델 원본/편집 값의 영구 캐시가 아니며, 입력·구조 편집·undo·redo·load 이후에는 다음 화면 갱신이 새로 조회합니다. 결과 두 조회가 모두 성공하기 전에는 snapshot을 게시하지 않습니다.

## 검증

순수 snapshot2개와 기존 automatic-number-content5개, 총7/7 exit0입니다. 반복100번 prefix와 부착의 조회1회·구역 분리·새 화면의 최신값·조회 실패 전파/재시도 및 기존 실제 note42개 grapheme/14개 reference-host split의 원문 저장/표시/이력을 검사했습니다.

실제 Worker export 호출 계측 회귀는1/1 exit0입니다. 원본 footnote-endnote에서 load/enable/splice/undo/redo 각각 sites 조회가 정확히 한 번씩 증가하고, undo 저장 원문·redo 저장 수정본이 일치했습니다. mock 결과로 native 호출을 생략하지 않고 원래 export를 실행했습니다.

대형 형광펜 원본의 수정 후 Canvas 재실측은1/1 exit0,143.6초였습니다. 동일 df16a06 후보·같은 문서·같은 테스트의 입력/독립 XML/저장/undo/redo를 유지한 실행이며 앞선304.3초보다 단축됐습니다. 한 번씩의 실측이고 여러 전체 검증이 동시에 실행 중이므로 반복 벤치마크나 모든 파일의 속도 개선 비율로 일반화하지 않습니다. picture_owner 반복 조회와 기타 경로는 별도 병목으로 남고 편집 UI 응답성 완료는 아닙니다. 최신 전체 gate는 Worker 변경 전 snapshot을 포함하므로 이 수정의 전체 통과로 소급하지 않습니다.
