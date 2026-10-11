# HWPX 필드 링크 거부와 읽기 전용 표시

## 실제 원문 조사

참조 reader 성공 HWPX435개에 대해 최초 source 문단의 fieldLabels(0,1)를 조회했습니다.432개는 조회 성공,3개는 InvalidFieldLinks였고 다른 오류는 없었습니다. 이전 전수 문단 조사6297회는 다음3파일의 XML 문단 수 합계와 같습니다. 실패 횟수를6297개 파일로 세지 않습니다.

| 참조 경로(samples 아래) | XML 문단 | 종료 없는 시작 표식 |
| --- | ---: | ---: |
| issue1891/80168_regulatory_analysis.hwpx | 4164 | 1 |
| issue1891/86712_regulatory_analysis.hwpx | 2101 | 4 |
| issue5729/stacked_tac_band_om_top.hwpx | 32 | 1 |

Python ZIP/XML의 독립 조회에서 모두 Contents/section0.xml의 beginIDRef 대응 부재를 확인했습니다. 중복 begin ID·미해결 end·fieldid 불일치·switch 분기는 없었습니다. 시작 ID는 첫 파일1575661054, 둘째1505851682/1505851683/1505851685/1505851896, 셋째1854889790입니다. 원본은 수정하지 않았습니다. RHWP의 tests/cases/issue_5729_stacked_tac_band_om_top.rs는 세 번째 fixture가 원본 구역0 문단0..8의 절단/스텁임을 명시합니다. 다른 두 파일의 제작 경위나 실제 한글의 자동 종료 정책을 이 관측만으로 단정하지 않습니다.

## API·표시 책임

native field_text_ranges의 전체 source 링크 검증과 공개 API 오류는 유지합니다. 종료 위치/새 마커/편집 범위를 추측하지 않습니다. 기존 Worker는 fieldLabels 오류 일부를 읽기 전용으로 처리했지만 앞선 canEdit/anchorText에서 같은 오류가 발생하면 load 표시가 중단됐습니다. hyperlink 원본에서 end1개를 제거한 파생 ZIP의 실제 Worker load가 InvalidFieldLinks로 실패함을 재현했습니다.

web/preview/field-link-display-guard.mjs는 표시 요청 동안만 구역별 InvalidFieldLinks 거부를 캐시합니다. plain/anchor/label 권한은 native 조회 결과를 계속 사용하고, 해당 거부가 나면 false/null/[]와 fieldReadOnlyReason으로 표시합니다. 다른 구역·새 표시 요청에 오류를 옮기지 않고 OOM/예산/주소 오류를 삼키지 않습니다. 같은 구역의 반복 source 전체 검사를 피하며 영구 문서 상태나 캐시를 만들지 않습니다. source/schema/native 편집 허용 규칙을 변경하거나 잘못된 링크를 복구한 것은 아닙니다.

## 검증

tests/hwpx/field-link-readonly-worker.test.mjs는 known-error 전용/구역·요청 격리/다른 오류 전파와 실제 Worker/WASM·Canvas 대역을 검사합니다. 파생 원본의 읽기 전용 표시·선택 입력 거부·정상 splice 요청의 InvalidFieldLinks 거부·save 전체 원문 바이트/undo 없음·정상 파일 재로드를 확인합니다. 최초 splice 반례의 메시지 필드가 잘못돼 InvalidTextPosition을 시험했음을 발견해 endUnit/text의 실제 protocol로 정정하고 오류 분류를 정확히 고정했습니다. 잘못된 메시지의 거부를 native 링크 보호 증명으로 계수하지 않습니다.

기본6a25125e 산출물2/2·exit0(553.813291ms), 분리 빌드75d658fe 산출물2/2·exit0(564.331166ms)입니다. 같은75d의 관련 Worker/projection3파일15/15 최종 재실행도 exit0(11325.823125ms)입니다. 실제 위3참조 파일의 Worker load·enable·save는 각각 readOnly true/InvalidFieldLinks 사유와 원문 전체 바이트 보존을 확인했습니다(표시4164/2101/32문단). 실제 browser/픽셀·완전 편집·자동 복구 검사로 해석하지 않습니다. WASM 코어와 기본 WASM은 교체하지 않았습니다.
