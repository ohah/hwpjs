# 짝 불명 필드의 구간 표시

## 표시와 편집 계약

HWP5 구간 발견은 기존 엄격 fieldSpans를 우선 사용합니다. 정확히 UnsupportedCrossParagraphField가 발생하고 optional fieldTopology가 실제로 지원되는 경우에만 [marker 진단 API](hwp5-text-source-eligibility.md)를 사용합니다. 진단에 짝 불명 표식이 없거나 다른 오류/OOM/ABI 부재이면 기존 오류를 유지합니다. CTRL_HEADER 바인딩 검사를 진단 marker 쌍으로 대체하는 것은 표시 발견에 한정하며, 어떤 쓰기 거래도 이 fallback을 사용하지 않습니다.

hwp5-field-window-topology는 오류/ABI 선택만, hwp5-unresolved-field-dependencies는 native paragraphFlow 소속으로 구간 의존성을 만드는 책임만 가집니다. 후자는 host/parent_node/list_node로 요청 수명의 그룹을 만들고 각 짝 불명 소속 전체를 한 번만 연결합니다. 다른 셀/본문을 혼합하거나 가상 종료 좌표를 만들지 않습니다. 표식의 리스트와 문단/UTF-16 경계를 확인하며 예산을 넘으면 명시적으로 거부합니다.

구간 projection은 보이는 해당 구역에 fieldTopologyDiagnostics를 전달하고 문단의 fieldTopologyError=UnresolvedFieldMarkers·editable=false를 설정합니다. 기존 context의 비선택/비편집 조건을 유지하고, 원래 선택 가능했던 본문은 읽기 전용 선택만 유지합니다. native source policy와 최종 쓰기 검증은 그대로 동작합니다. 진단 표시·읽기 전용 구간 성공은 미닫힘 필드 문서의 편집 완료가 아닙니다.

## 세션 시작과 입력 허가의 분리

실제 브라우저 첫 실행에서 일반 문서의 source-policy readOnly가 배포용 readOnly와 혼동되어 세션 시작 버튼이 비활성인 것을 재현했습니다. Worker는 실제 editor 보유 여부만 editorSessionAvailable로 전달하고, document-editor-access가 초기 세션 시작과 형식 라벨을 판단합니다. 이 flag는 편집 권한이 아닙니다. HWP5의 기존 native 세션은 입력이 닫혀 있어도 명시적으로 이력/구간 탐색 세션을 시작할 수 있습니다.

배포용/보정본의 명시적 opt-in은 유지하고 저장된 구역만 보기에는 세션 시작을 허용하지 않습니다. HWPX readOnly에 HWP5 전용 flag를 적용하지 않습니다. 일반 readOnly 라벨은 더 이상 배포용으로 잘못 표시하지 않습니다. 구간 도구는 짝 불명 건수와 해당 구역 읽기 전용 경고를 표시합니다.

## 실제 문서와 반례

앞선7c38bc1b 소스의 전체 편집 실행은456개 중455개 성공·1개 실패로 종료됐습니다(topology-editor-full.log). 유일한 실패는 table-content 테스트가 격리 소스에서 Git inventory를 조회할 때 .git을 찾지 못한 설정 오류였습니다. 제품 성공으로 합산하지 않았습니다. 명시적 GIT_DIR/GIT_WORK_TREE/별도 GIT_INDEX_FILE로 재실행한 해당 파일은3/3·skip0입니다(table-content-corrected.log). 최신 전체 묶음의 완료 판정은 별도입니다.

원본 issue1921/59043_regulatory_analysis.hwp의 구역0/문단52를 조회했습니다. 28개의 닫힌 marker 쌍과 리스트236의 미닫힘1개를 진단하며, 창은 요청1문단+소유 context6문단을 반환합니다. Worker의 활성화 전 query/edit-query 분리, 세션 시작 후 구간 활성화, 강제 splice 거부, revision/undo 목록·원본/저장 불변을 확인했습니다. 합성 검사는 외부 리스트 제외·동일 소속 반복 처리1회·context 비선택·읽기 전용·예산 초과·위조 소속/위치·알 수 없는 오류와 빈 fallback 거부를 포함합니다.

후보 native SHA-256은 8e087670441f42c4e34bb66d063a07ef26ece984c9478934a5329b1640fc05d3입니다. 집중12파일29/29·실패/취소/건너뜀0입니다(window-final-baseline.log). 처음 명시적 구형 baseline 없이 실행한 묶음의 skip1은 통과로 세지 않았습니다. cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346 baseline을 지정해 재실행했으며 실제 배포용·보정본·저장 구역 보기·HWPX 시작 검사를 함께 포함했습니다.

실제 Chromium에서 파일 선택→세션 시작→53번째 문단 구간 이동을 trusted 클릭으로 수행했습니다. Canvas 1238×297, 입력 닫힘, 읽기 전용 진단 경고, 다운로드 원본 바이트 동일을 확인했습니다. 첫 window-browser.log는 시작 버튼 비활성 때문에 실패했고, 위 세션/입력 분리 후 window-browser-corrected.log 및 window-browser-final.log가 성공했습니다. screenshot은 unresolved-window.png이며 브라우저 세션 hwpjs-unresolved-window-e7032e5a7177의 active=false/pid=null와 포트58854 listener 부재를 확인했습니다. 브라우저/임시 서버는 매번 finally에서 종료합니다.

화면에는 IncompleteHwp5WindowTables에 따른 논리 미리보기/페이지 배치 미지원이 명시돼 있습니다. 전체 표/원본 조판·OS IME·이 원본의 실제 편집 지원이나 외부 기본 데모 승격을 주장하지 않습니다. 로그/사진 위치는 /tmp/hwpjs-field-topology-api.RwIArF/입니다.

별도 reader 대조는 기존7c38bc1b 후보와 위8e087670 후보 사이의 참조975개에서 전체 응답 동일944개·동일 거부5개·범위 제외 HWP3 26개로 종료됐습니다(reader-parity.jsonl). 동일 거부는 지원 성공이 아니며 이 reader 결과는 편집/브라우저 검증을 대신하지 않습니다.
