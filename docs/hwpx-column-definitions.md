# HWPX 단 설정 원값

## 범위와 근거

한컴 공개 [ColumnDefType 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/ColumnDefType.cpp)은 `colPr`의 `id`·`type`·`layout`·`colCount`·`sameSz`·`sameGap`과 직접 자식 `colLine`·`colSz`를 정의합니다. [colLine](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/colLine.cpp)은 선 종류·굵기·색, [colSz](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/colSz.cpp)는 폭·간격 원값입니다. 알려진 enum 어휘는 공개 [enumdef.h](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)를 기준으로 합니다. 공개 코드를 이식하지 않았습니다.

`Document.inspectColumnDefinitions()`는 구조가 선택한 2011 section의 정확한 `hp:colPr`와 직접 `hp:colLine`·`hp:colSz`를 원문 XML·속성·출처와 함께 소유 결과로 반환합니다. `XmlTrees.inspectColumnDefinitions()`와 `Document.inspectKnown().column_definitions`도 같은 검사기를 사용합니다. 부모 이름은 보존하지만 `hp:ctrl` 직접 자식이라는 조건으로 대상을 임의 축소하지 않습니다. 외부 namespace의 같은 로컬 이름은 승격하지 않습니다.

## 책임·보존 계약

`column_definitions.zig`는 section 순회·직접 자식의 원래 순서·원문과 보고서 예산을, `column_fields.zig`는 부재/빈 값이 구별되는 속성·UINT32/Boolean 어휘·열거형 진단을 소유합니다. `colLine`과 기존 각주/미주 구분선의 공식 선 종류·폭 어휘는 `line_style_values.zig` 한곳을 공유합니다. 알 수 없는 `type`·`layout`·선 종류·폭은 값 수정이나 거부 없이 원문 및 진단으로 남깁니다. 색은 `#RRGGBB` 모양인지 진단만 합니다.

`sameSz=false`인 경우 `colCount`와 직접 `colSz` 개수가 다르면 진단하고, `sameSz=true`에도 `colSz`가 있으면 원문을 지우지 않고 별도 진단합니다. 실제 단의 렌더링 폭, 용지 크기와의 산술 일치, 편집·저장 왕복은 수행하지 않습니다. 모델의 생략 기본값을 보고서의 부재 속성에 대입하지 않습니다.

기본 한도는 단 설정 200,000개·인식 자식 200,000개·모든 직접 자식 500,000개·인식 자식의 직접 자식 500,000개, 부모 이름/선택 속성당 4 KiB, 복제 원문·이름·속성의 합계 128 MiB입니다. 이 예산은 임시 트리·배열 메타데이터까지 포함한 프로세스 RSS 한도가 아닙니다. `Report.deinit()`으로 해제되며 입력 ZIP/트리를 먼저 해제해도 소유 결과는 유효합니다.

## 실파일·적대적 검증

두 로컬 corpus의 HWPX 후보 484개 가운데 ZIP 종료 레코드가 없는 6개와 암호화된 2개를 제외한 476개를 독립 Python ZIP/ElementTree 오라클과 **파일별 해시**로 대조했습니다. 관측된 `colPr`는 2,829개로 전부 `hp:ctrl` 직접 자식이고, 알려진 자식은 `colLine` 22개·`colSz` 147개입니다. `sameSz=0`은 57개이고 그중 `colSz` 개수 불일치는 0개입니다. `sameSz=1`인데 `colSz`가 있는 경우는 1개라서 삭제하지 않고 진단합니다. 한컴 공개 enum에 없는 `type="NORMAL"` 88개와 `id`가 **부재**한 88개는 실제 파일 1개에서 함께 관측됩니다. 반면 나머지 `id` 2,741개는 빈 문자열로 **존재**합니다. 이 실물 편차를 모든 버전의 공식 enum이나 기본값으로 승격하지 않습니다.

적대적 검토에서는 (1) 모델의 속성·직접 자식·공유 선 어휘, (2) `NORMAL`과 누락 `id` 등 실물 편차, (3) namespace 위장·부재/빈 값·자식 순서와 폭 개수, (4) 숫자/Boolean 오류·한도·할당 실패 및 보고서 수명, (5) 독립 오라클 변이와 허용 파일별 해시를 구분해 확인합니다. 재현 명령과 통과 수치는 [개발·검증 명령](development-commands.md)에 기록합니다. 이는 단 설정 원값의 관측 범위 검증이지 단 조판이나 HWPX 전체 적합성 증명이 아닙니다.

2026-09-26 기준 `zig build test --summary all`은 종료 코드 0, 5/5 단계, 2,616/2,616 테스트를 통과했습니다. 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 8/8, 공유 선 어휘가 쓰이는 각주/미주 회귀는 세 모드 각각 6/6을 통과했습니다. ReleaseSafe 제품 빌드, `zig fmt --check build.zig src`, 독립 Python 오라클의 일반/`-O` 변이 self-test, 허용 476개 파일별 해시 대조, 두 편차 실파일의 standalone/known 일치, 기존 known 문서 샤드 0~7도 통과했습니다. 전체 테스트 출력의 `failed command:` 한 줄은 후속 [Zig stderr 독립 재현](zig-test-stderr.md)에서 성공한 테스트의 진단 출력으로 설명됐습니다. 이 문구만으로 실패를 판정하지 않으며 종료 코드와 최종 테스트 상태를 함께 확인합니다. 실파일 corpus와 known 샤드는 기본 전체 테스트 밖의 선택 검사입니다.
