# HWPX 표의 상속 shape 필드·직접 자식 검사

`src/hwpx/table_shape.zig`는 [표 격자](hwpx-table-geometry.md)가 고른 `hp:tbl`의 상속 shape 속성과 직접 자식 `sz`, `pos`, `outMargin`, `caption`, `shapeComment`, `parameterset`, `metaTag`, `label`만 관측합니다. 필드별 어휘와 공개 모델 enum 목록은 `shape_xml_fields.zig`가 소유합니다. `tr`, `inMargin`, `cellzoneList`는 각각 기존 격자·[표 직접 자식](hwpx-table-children.md) 검사기가 소유하며 여기서 다시 해석하지 않습니다. `caption`의 직접 `subList`는 기존 [ParaListType 속성](hwpx-para-list.md) 검사기를 재사용해 어휘·직접 문단 수를 관측합니다. 보고서는 `Document.inspectKnown(...).table_geometry.table_shape`에서도 노출됩니다.

선택된 각 요소의 존재·부재·중복을 표별로 세고, 숫자는 부재/0/음수 문자열/상위 비트 양수 문자열/원값 합계를 구분합니다. `pos` offset과 `outMargin`, `caption` 폭·간격에 대해 부호 표기를 강제 정규화하지 않습니다. Boolean과 enum은 모델의 정확한 표기를 검사하되 미지 enum은 오류가 아닌 진단입니다. 공개 모델의 `textWrap` 목록 밖인 `TIGHT`, `THROUGH`는 로컬 rhwp가 인지하는 확장값으로 따로 세며 임의로 `SQUARE`로 바꾸지 않습니다. 이 corpus에서 직접 관측된 것은 `THROUGH`뿐입니다. 다른 미지 값은 `unknown_enum`으로 남습니다. 보고서는 미지 문자열을 소유하지 않습니다. `shapeComment` 텍스트, `parameterset`·`metaTag` 내부 구조, caption 본문·배치, shape 참조·좌표 조합, 필수성·기본값, 조건부 분기·전체 XSD는 이 범위에서 확정하지 않습니다.

근거는 한컴 공개 모델의 고정 커밋 [`AbstractShapeObjectType.cpp`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/AbstractShapeObjectType.cpp), [`TableType.cpp`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/TableType.cpp), [`enumdef.h`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h) 및 각 자식 모델 파일입니다. 공개 모델 자체에서도 `textWrap`의 쓰기 기본값은 `TOP_AND_BOTTOM`, 읽기 기본값은 `SQUARE`로 다릅니다. 따라서 부재를 어느 하나로 덮지 않습니다. 실제 파일과 공개 모델의 `textWrap` 목록 차이는 현재 지원 범위의 증거이며, 모델이 틀렸다는 일반 판정이나 임의 버전 규칙은 아닙니다.

독립 `tools/hwpx-table-oracle.py`의 ZIP/ElementTree 조사에서 2026-09-25 로컬 허용 HWPX 476개 문서의 표 4,182개 모두 `sz`, `pos`, `outMargin` 직접 자식과 대부분의 상속 속성을 가졌습니다. `dropcapstyle`만 5개에서 부재했고, `caption`은 134개, `label`은 28개였습니다. caption마다 직접 `subList`가 하나씩, 그 아래 직접 문단은 151개였습니다. `shapeComment`, `parameterset`, `metaTag`는 표 직접 자식에서 관측되지 않았습니다. 모델 밖 `textWrap=THROUGH`는 5개이며, `vertOffset`에는 음수 표기 1개와 상위 비트 양수 표기 21개, `horzOffset`에는 상위 비트 양수 표기 17개가 있었습니다. 이 표본에서 부재·중복·미지 값이 없다는 사실은 다른 버전의 필수성이나 전체 문서 유효성을 보증하지 않습니다.

합성 테스트는 직접 자식/외부 namespace, 중복·부재, enum 확장/미지, 음수·상위 비트, 잘못된 Boolean·숫자, 전역 자식·caption 한도, 모든 할당 실패를 검사합니다. `python3 tools/hwpx-table-oracle.py --self-test`는 독립 반례를, 인자 없는 실행은 실파일 분포를 반환합니다. `zig test src/root.zig --test-filter 'HWPX table shape'`는 합성 검사를, `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`의 N=0..7은 독립 분할 집계와 실제 문서 연결을 검사합니다. 실파일 검사는 Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

이 단계는 원값·직접 topology 검사입니다. 문서 전체의 의미 모델, 표/자막 레이아웃, 편집·저장·무손실 왕복은 여전히 미구현입니다.

## 검증 기록

2026-09-25: 독립 조사기 자체 반례와 476개 허용 문서의 전체 집계, ReleaseFast 선택 실파일 shard 0~7의 요소·숫자·확장 enum 대조가 통과했습니다. Debug 전체 `zig build test --summary all`은 2,314/2,314 테스트, ReleaseSafe·ReleaseFast 전체 `zig build audit -Doptimize=... --summary all`은 각각 종료 코드 0으로 통과했습니다. 세 모드의 shape 단독 테스트는 각각 5/5였습니다. 적대적 반례는 다른 namespace와 손자 요소, 부재와 공개 모델의 상충 기본값, 중복 뒤의 잘못된 숫자, 모델 밖 enum, 음수/상위 비트 값, 여러 표에 걸친 한도, 모든 할당 실패를 포함합니다. 이는 관측·어휘·직접 topology의 검증이지 전체 문서 의미 적합성 판정이 아닙니다.
