# HWPX 수식 때문에 발생하는 editor 표시 조회 거부

## 범위

reader의 텍스트 읽기·editor.open 성공과 editor의 현재 수식 표시 계산 성공은 다른 검증입니다. 원본 계산 결과를 읽는 것만으로 지원 계산/편집으로 승격하지 않으며, 편집 후 계산값과 원본 cache의 불일치를 숨기지 않습니다. 이 문서는 실제 editor 표시 조회 거부의 원인과 남은 검증을 기록합니다.

## 병합 셀 참조

후보 WASM SHA256 `4c50e59c04a1a6d1cbeb6027e42017869145a5568463a06f4f5324a422dbcb24`에서 참조 `samples/hwpx/aift.hwpx`의 reader와 editor.open은 성공하지만 paragraphTextSnapshot(2)는 UnsupportedMergedFormulaCell로 거부됩니다. 최초 조사에서 전체 파일 try/catch의 이름을 openRefusals로 붙였으나 단계별 재현으로 표시 조회 오류임을 정정했습니다. source는 수정하지 않았습니다. 독립 Python ZIP/XML 조회에서 Contents/section2.xml의17행10열 표와 row4/col9 수식 `=SUM(H?:I?)`, 저장 LastResult `1,000,000`을 확인했습니다. 입력 row4/col7의820,000과 row4/col8의180,000은 모두 colSpan1/rowSpan2의 병합 셀입니다. 수식은 두 셀의 원점 좌표를 참조합니다.

직접 원인은 src/hwpx/formula_values.zig의 evaluateWith가 선택 좌표를 포함하는 셀을 찾은 뒤 cs/rs가1이 아니면 무조건 UnsupportedMergedFormulaCell로 거부하는 것입니다. 주소 누락·표 경계 초과·겹치는 셀 검사와 구분합니다. source의 저장 합계와 독립 덧셈820000+180000이 일치한다는 관측만으로 병합 내부 좌표·반복 참조·범위 합산/평균/곱의 모든 정책을 단정하지 않습니다.

다음 구현은 원점 참조와 병합 내부 좌표 참조를 분리하고, 원점 수치 입력의 계산·변경/저장·undo/redo·독립 전체 XML·실파일 재열기를 검사해야 합니다. 중첩/겹치는 셀 및 할당/inspection 예산 반례도 유지해야 합니다. 아직 이 거부를 수정하거나 실제 한글과 모든 병합 수식 의미가 동일하다고 검증한 것은 아닙니다.

같은 참조 editor getter 조사에서 issue1891_external_bindata_link.hwpx의 UnsupportedMergedFormulaCell, issue3637/regulatory_impact_nested_table_escape.hwpx의 UnsupportedFormulaCellParagraphs, issue6298/copay_cap_tac_table_leading.hwpx의 InvalidFormulaReference, tac-img-02.hwpx의 InvalidFormulaNumber도 관측했습니다. 이4파일 역시 editor.open 성공 후 paragraphTextSnapshot(0)에서 거부됨을 단계별로 재현했습니다. reader 성공 HWPX435개의 editor.open은 전부 성공했고 위5개는 표시 snapshot을 완료하지 못했습니다. 지원 라벨529fragment/48파일과 별도의 InvalidFieldLinks 문단 조회6297회도 관측했습니다. 조회 거부 횟수를 파일 수로 집계하거나 무시하지 않습니다. 이 getter inventory는 편집·독립 XML·GUI 검사가 아닙니다. 각 거부 파일은 원문·연산 종류·관측 저장 결과를 따로 확인해야 합니다.

6297회 필드 링크 거부의 실제3원본·종료 표식 부재·별도 Worker 읽기 전용 표시 경계는 [필드 링크 거부](hwpx-field-link-refusals.md)가 소유합니다. 그 UI 경계 수정은 위5개 수식 표시 계산 오류의 해결이나 편집 허용을 의미하지 않습니다.
