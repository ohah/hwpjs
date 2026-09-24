# HWPX 표 자체 속성 검사

`src/hwpx/table_attributes.zig`는 [표 격자](hwpx-table-geometry.md)가 이미 선택한 `hp:tbl`의 무접두 속성 `pageBreak`, `repeatHeader`, `noAdjust`, `cellSpacing`, `borderFillIDRef`를 검사합니다. 행·열 선언 `rowCnt`·`colCnt`는 계속 격자 모듈이 소유합니다. [표 셀 필드](hwpx-table-cell-fields.md)의 Boolean 수치·테두리 ID 규칙을 `table_xml_fields.zig`, `xml_values.zig`, `id_references.zig`에서 재사용합니다. 전체 문서에서는 `Document.inspectKnown(...).table_geometry.table_attributes`로 결과를 얻습니다.

근거는 한컴 공개 모델의 고정 커밋 [TableType.cpp](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/TableType.cpp), [TableType.h](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/TableType.h), [enumdef.h](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)입니다. `pageBreak`는 `NONE`/`TABLE`/`CELL`, 부재, 알 수 없는 값을 각각 셉니다. 미지 값은 거부하지 않지만 보고서는 개수만 남기며 문자열 자체를 소유·반환하지 않습니다. 두 Boolean은 부재/false/true, 두 숫자는 부재/0/`u32` 원값 합계를 구분합니다. 잘못된 알려진 Boolean·숫자 어휘와 속성 길이 초과는 오류입니다. 모델 기본값을 XML 속성 부재에 대입하지 않습니다.

`borderFillIDRef`는 이미 색인한 header의 실제 `borderFill/@id`와 연결하고, ID 0도 일반 ID와 동일하게 대조합니다. 참조 보고서는 부재·해결·대상 없음·header 표 없음, 첫 미해결 ID와 section의 manifest item index를 구분합니다. header 색인 없이 단독 격자 검사를 호출하면 `border_fill_references_checked=false`이고 0 카운트는 성공 판정이 아닙니다. 이 검사는 대상 **존재 여부**만 판단하며 테두리 렌더링이나 저장 가능성은 증명하지 않습니다.

## 실파일 대조와 적대적 검증

독립 `tools/hwpx-table-oracle.py`는 ZIP/ElementTree로 표 속성과 header ID를 조사합니다. 2026-09-24 로컬 HWPX corpus에서 ZIP 거부 6개·암호화 2개를 뺀 476개 문서, 544개 section의 표 4,182개를 관측했습니다. `pageBreak`는 CELL 3,152·NONE 1,004·TABLE 26, `repeatHeader=true`는 3,917개, `noAdjust=true`는 675개였습니다. `cellSpacing=0`은 4,146개, 합계는 9,066입니다. 표 테두리 ID 합계는 95,855이고 4,177개가 header에 연결됐습니다. 나머지 **5개는 전부 ID 0이며 header에 ID 0이 없어 미해결**입니다. 셀 테두리 ID가 실파일에서 전부 해결된 것과 혼동해서는 안 됩니다. 이 분포는 해당 corpus 관측이지 다른 버전의 필수성·호환성 증거가 아닙니다.

합성 테스트 `zig test src/root.zig --test-filter 'HWPX table attributes'`는 열거값·미래 값·부재·다른 namespace의 동명 속성, Boolean/숫자 오류, `u32` 상한, 길이 제한, header ID 0 유무, header 표 부재, 단독 검사와 할당 실패 전 지점을 검사합니다. 독립 조사기의 자체 반례는 `python3 tools/hwpx-table-oracle.py --self-test`, 실파일 분포는 인자 없이 실행하며, Zig 8개 ReleaseFast shard의 기대값은 `src/hwpx_corpus_expectations.zig`에 둡니다. 각 shard는 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`으로 별도 실행합니다. 로컬 `reference/rhwp`가 없으면 실파일 검사는 재현되지 않습니다.

직접 `inMargin`, `cellzoneList`, inherited shape 속성·자식, 셀 내용 의미, 조건부 분기, 표 배치·반복 머리글 동작, 편집·저장·무손실 왕복은 아직 이 검사 범위 밖입니다. `inspectKnown` 성공은 전체 HWPX 스키마 적합성 또는 문서 검증 완료가 아닙니다.

이번 파트의 최종 재검증에서는 독립 조사기 자체 반례와 실제 파일 집계, 최종 코드의 ReleaseFast shard 0~7, Debug 전체 2,306/2,306 테스트, ReleaseSafe·ReleaseFast 전체 감사 각 2,345/2,345 테스트, 두 최적화 모드의 표 속성 단독 테스트, 포맷·공백 검사가 통과했습니다. 적대적 점검은 ID 0을 부재/유효 기본값으로 오인하는 경로, 셀 참조 성공을 표 참조 성공으로 일반화하는 경로, header 없는 단독 검사의 0 카운트, 미지 열거값과 무접두 속성 선택, 잘못된 숫자·Boolean, 할당 실패 경로를 각각 반례로 확인했습니다. 이 결과는 이 파트의 관측 범위에 한정됩니다.
