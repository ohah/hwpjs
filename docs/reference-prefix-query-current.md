# 최신 참조 텍스트 읽기·입력 경로 조사

## 2026-10-18 누름틀 보존 후보의 부분 진단과 재실행

6ddc76ab71dc09a77acf0b57b7ec78b2cc137850189e136fb361edd5d71d0437 후보의 최초 prefix 조회는439경로 중369개 file 행을 남긴 뒤 handle89363 exit1로 종료했습니다. 최종 summary와 stderr가 없어 전체 완료나 특정 파서 결함으로 확정하지 않습니다. 다음 대상 task2070/hy_ladder4.hwpx를 포함한 해당 디렉터리2개·38문단의 독립 재실행은 plain36/anchored2·거부0·exit0이었습니다. 같은 후보의 전체 재실행은 별도 run-reference-query.mjs가 종료 code/signal·여유 공간·stdout/stderr를 protection-reference-supervised.jsonl/.stdout/.stderr에 기록하며 실행 중입니다.

최초 부분 로그의 거부66곳을 입력 해시 확인 뒤 ZIP/XML의 가장 가까운 원본 p 소속과 대조했습니다. 직접 fieldBegin 기준 FORMULA35·MEMO2·CLICK_HERE5·직접 fieldBegin 없음24입니다(protection-prefix-refusal-xml.json, /tmp/hwpjs-click-retention.Vm3dFy). 직접 필드가 없다는 사실로 해당 문단에 활성 필드가 없다고 추정하지 않습니다. FORMULA나 미닫힘/소속 범위를 일괄 읽기 오류로 분류하지 않으며, 이 분류는 실제 편집 검증도 전체439개 결과도 아닙니다.

aift.hwpx의 구역2 localParagraph2694/2697 MEMO는 editable=1이지만 parameters와 주석 본문 subList를 포함합니다. 현행 field_text_kind의 삼종 지원과 field_label_session의 subList 거부로 일반 라벨/접두사 경로가 열리지 않습니다. 허용 문자열만 추가하면 필드 구조 분할·병합까지 범위가 바뀔 수 있으므로, 후속 구현은 표시 라벨과 주석 본문의 소유권·보존·현재값을 분리하고 실제 XML/원본 메타데이터/저장 재열기로 검증해야 합니다. 이 기록은 MEMO 편집 지원 완료가 아닙니다.

## 고정 후보와 범위

후보 WASM SHA256 `100483796a4f80452e96cc5761f7949da13f35e0cdcf8f4e9d5d7824c2bd2a9a`, 명시적 root `reference/rhwp/samples`를 사용했습니다. source/제품 승격 완료가 아니며 조사 중 저장이나 입력 파일 수정은 하지 않습니다.

`reference-parser-audit.mjs`의975개 경로 중 HWP3 signature26개를 제외한 HWP5/HWPX949개에서 HWP5 509/HWPX435개, 합계944개 텍스트 읽기를 확인했습니다. 문단 합계690,523개입니다. 암호화 거부2개와 HWP5 SectionCountMismatch3개를 성공으로 계산하지 않습니다. 이 도구의 exit0은 census 출력 완료이며 전체 파서 필드/편집 지원 완료 gate가 아닙니다. 로그는 `zig-out/verification/picture-owner-prefix-corpus/parser-reader.log`입니다.

## HWPX prefix 경로

`node tools/reference-hwpx-prefix-query-audit.mjs --wasm=/absolute/candidate/hwpjs.wasm --root=reference/rhwp/samples`는439개 .hwpx 경로를 모두 조사했습니다. 실제 signature가 HWP5인6개는 다른 포맷으로 분리했고 암호화 HWPX1개는 file_refused입니다. 나머지432개 문서213,765개 문단은 plain193,402/anchored15,709/field4,567·거부87개로 합계가 일치합니다.87개는 모두 UnsupportedFieldLabelRange이며 도구는 exit1입니다. 로그는 `zig-out/verification/picture-owner-prefix-corpus/full-query.log`입니다.

이전 e64 후보의 같은213,765문단 조회 거부3,965개보다 줄었지만 새 성공 경로 전체를 실제 편집한 결과는 아닙니다. source 문서·WASM 파일/메모리 hash 및 query 후 save 원문 byte-exact를 검사했습니다. 실패 assertion은 파일 거부로 낮추지 않고 실행을 중단합니다. 알려진 orphan 보호27개, 루트 orphan 및 FORMULA 결과 같은 의미 보호와 다른 미지원 내용을 후속 분류해야 합니다.

CLI 경계 회귀2/2 exit0에서 필수 scope/중복/알 수 없는 옵션의 사전 거부와 실제 정상 HWPX·확장자 HWPX인 HWP5·손상 파일을 함께 검사했습니다. 다른 포맷/손상 파일이 query 성공 수로 합쳐지지 않으며 거부가 있으면 exit1입니다.

## HWP5 구역 불일치의 원문 증거

원본 CFB의 DocInfo 첫 DOCUMENT_PROPERTIES(tag16)에서 version과 UINT16 구역 개수를 직접 읽고 모든 Section 디렉터리 항목을 대조했습니다.

| 원본 | 버전 | 선언 구역 | 실제 Section 스트림 |
| --- | --- | ---: | --- |
| issue5715/float_chart_ghost_ladder_gap.hwp | 5.0.0.6 | 2 | Section0 |
| issue5802/hf_cross_section_inherit.hwp | 5.0.2.4 | 11 | Section0, Section1 |
| issue5828/landscape_rowbreak_bleed.hwp | 5.0.3.0 | 4 | Section0 |

모든 디렉터리 항목에서도 추가 Section 이름은 없었습니다. 명세의 문서 속성 UINT16 구역 개수와 BodyText/Section%d 관계 및 현재 text_source의 선언/실제 검사에 일치하는 거부입니다. 경로 필터만으로 누락됐다고 단정하거나 자동으로 선언값을 덮어쓰지 않습니다. 어느 쪽이 제작 과정에서 잘못됐는지, 한글에서 어떤 관측 호환성으로 여는지는 후속 확인입니다. 첫 파일의 strict CFB 검사는 InvalidFat도 반환했으며 위 목록은 기존 비엄격 CFB 읽기 진단입니다.

형광펜 원본의 잔여32/119/192번은 run 직접 markpenBegin 뒤의 표와 t 내부 markpenEnd,1949번은 run 직접 markpenBegin과 필드입니다. 기존 t 내부 leaf 보존과 다른 run-level 관측 확장이므로 다음 구현에서 삽입 affinity·앵커 폭·원문 보존을 함께 검증합니다.
