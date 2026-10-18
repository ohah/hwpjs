# 표 표시 셀의 응답 내 조회 인덱스

`attachTables`는 한 응답/구역의 native 바인딩을 표·list ID로 묶습니다. 공개 `table.cells`와 셀 문단 배열이 표시 결과이며, 임시 Map은 같은 셀 객체를 가리키는 조회 인덱스입니다. 응답이나 편집을 넘어 유지하는 캐시가 아닙니다. 첫 바인딩의 크기/병합 정보, 원래 셀·문단 순서, 구역/표 분리, partial 판정, editor 부재 시 소속 제거는 유지합니다.

기존 셀별 `Array.find`는 같은 표의 셀마다 기존 배열을 다시 순회했습니다.1,000셀 대조에서 list ID 접근은501,500회→3,000회이며 전체 결과 JSON은 같았습니다. 단일 실행 시간은5.65ms→1.09ms였지만 이는 합성 그룹화 한 번의 관측값이지 전체 문서·native·브라우저 지연 개선율이 아닙니다. `table-content-index.test.mjs`는 시간 대신 선형 접근 상한과 구역/표별 동일 list ID·첫 크기·복수 문단·소속 정리를 검사합니다.

분리된 main9f44ca22 소스에 이 JS 변경만 적용한 `/tmp/hwpjs-table-cell-index.v0mPhE`에서 정확한2파일 선택·5/5·fail/cancel/skip0·exit0을 확인했습니다(`table-cell-index-main-regressions.log`). 기존 게시 후보 WASM360abdbb를 사용했으며 미게시 field-span/구간 UI 코드를 포함하지 않았습니다. 별도 로컬 표 표시 회귀는 일반45원본의723개 셀 소속 문단을 독립 레코드와 대조하고 셀 문단 분할·입력·undo/redo도 검사합니다. 해당 기존 로컬 테스트 파일 전체를 이 커밋에 포함하지 않습니다.

분리 구간 UI의 표/Canvas/양 형식 구간 회귀는 별도8파일12/12입니다. 최초 실행은 누락 파일을 조용히 제외한8개 선언만 검사했으므로45원본 근거로 사용하지 않았습니다. 이후 파일을 명시하고 `tools/run-selected-node-tests.mjs`로 경로와 개수를 선검사한 결과가 위 main5/5 및 UI12/12입니다. 이 인덱스는 native 편집 권한·표 구조·원본 조판을 바꾸지 않으며 대형 원본의 미지원 필드 편집이나 전체 UI 완료를 뜻하지 않습니다.

재현: `node tools/run-selected-node-tests.mjs tests/hwp5/table-content-index.test.mjs`. 전체45원본 회귀는 위2파일이 있는 스냅샷에서 명시적 WASM과 Git fixture inventory를 사용합니다. 원본 픽스쳐를 수정하지 않습니다.
