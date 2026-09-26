# HWPX 구역 직접 설정 값

`src/hwpx/section_direct_settings.zig`는 2011 section XML의 `hp:secPr` 바로 아래 `startNum`·`grid`·`visibility`·`lineNumberShape` 네 요소를 XML 순서대로 관측합니다. `readXmlTrees().inspectSectionDirectSettings()`와 `Document.inspectKnown().section_direct_settings`가 같은 검사기를 사용합니다. 각 항목은 종류·section 순번·요소 인덱스·부모 `secPr` 인덱스, XML 정규화 원값과 부재, 낯선 속성·열거값·직접 자식 개수를 소유합니다. 반환 보고서는 `deinit`해야 합니다. 중복 요소를 첫 항목으로 덮어쓰거나 부재 필드를 모델 기본값으로 채우지 않습니다.

한컴 공식 모델의 [startNum](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/startNum.cpp), [grid](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/grid.cpp), [visibility와 lineNumberShape](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/visibility.cpp), [열거형](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)을 기준으로 정수 10개는 공통 unsigned32 어휘, 공식 Boolean 7개는 공통 XML Boolean 어휘로 확인합니다. `pageStartsOn`의 `BOTH`·`EVEN`·`ODD`와 `border`·`fill`의 `HIDE_FIRST`·`SHOW_FIRST`·`SHOW_ALL`은 알려진 열거값입니다. 새 값은 거부하지 않고 원문과 진단으로 남깁니다.

공식 `grid` 모델에는 `lineGrid`·`charGrid`·`wonggojiFormat`만 있지만, 로컬 corpus의 21개 정의에는 `strikeContinue="0"`가 추가로 있습니다. 이를 **관측 확장 속성**으로 따로 보존하며 Boolean으로 강제 해석하지 않습니다. 미래의 다른 값도 원문으로 유지합니다. XML 자체의 문자·namespace 적합성은 기존 트리 계층이 담당합니다. 이 단계의 한도는 인식한 요소 수, 해당 요소의 직접 자식 총수, 알려진/관측 속성별 정규화 바이트에 각각 적용합니다. 알 수 없는 속성의 내용과 자식 내부 의미는 원본 XML 트리에 남습니다.

2026-09-25 독립 `zipfile`/`ElementTree` 조사에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 `secPr` 555개를 관측했습니다. `startNum`·`grid`·`visibility`는 각각 555개, `lineNumberShape`는 554개로 한 정의에서 빠져 있습니다. 네 요소의 공식 속성은 각 존재 요소에서 모두 있었고, `strikeContinue`는 21개에만 있었으며 관측값은 모두 `0`입니다. `pageStartsOn=ODD`·`page=1`은 각각 1개, `fill=SHOW_FIRST`는 2개였습니다. 나머지 열거값 확장, 미등록 속성, 네 요소의 직접 자식은 이 corpus에서 관측되지 않았습니다. 이는 corpus 분포이지 모든 버전에서 필드가 필수라는 뜻이 아닙니다.

실파일 검증은 독립 `tools/hwpx-section-direct-settings-oracle.py`의 자체 반례와 8개 shard 기대값, Zig 문서별 부모/자식 개수 대조와 shard별 부재·값 집계로 수행합니다. 합성 테스트는 부재·중복·외부 namespace·중첩 위장, 미등록 속성·열거값, 확장 원문, 잘못된 공식 숫자/Boolean, 정확한 한도와 모든 할당 실패 지점을 검사합니다. `reference/rhwp/samples/issue2527_empty_linesegs.hwpx`의 `strikeContinue`도 별도 실파일 테스트로 확인합니다.

이 보고서는 쪽 번호 시작·격자·가시성·줄 번호의 **원값**만 검사합니다. 네 요소 안의 직접 문자/CDATA 내용은 세지 않으며 원본 XML 트리에 남습니다. 실제 페이지 번호 배정, 원고지 표시, 첫 쪽 숨김의 우선순위, 줄 번호 조판, 조건부 분기 선택, 편집·저장·무손실 왕복과 전체 HWPX XSD 적합성은 아직 검증하지 않습니다.

## 검증 기록과 적대적 재검토

2026-09-25에 독립 oracle 자체 반례, Zig 합성 테스트의 Debug·ReleaseSafe·ReleaseFast, 실제 확장 속성 fixture와 `inspectKnown` 통합 테스트, 코퍼스 8개 shard의 ReleaseFast 대조가 통과했습니다. shard별 결과는 476개 수용·ZIP 거부 6개·암호화 2개를 재현했습니다. 첫 전체 테스트에서는 예제 XML의 실제 순서가 `grid → startNum`인데 통합 테스트가 이를 반대로 가정해 null 강제 해제로 중단됐습니다. 원본 ZIP의 `Contents/section0.xml`을 독립 확인해 테스트의 순서 기대값을 고쳤고, 해당 테스트를 재실행해 통과했습니다. 수정 후 `zig build test --summary all`은 5/5 단계·2403/2403 테스트, `zig build audit -Doptimize=ReleaseSafe --summary all`은 40/40 단계·2442/2442 테스트로 통과했습니다.

재검토에서 21개의 `strikeContinue="0"` 관측을 Boolean 명세로 일반화하지 않고 불투명 확장 원값으로 유지했습니다. 새 enum 철자는 원문과 진단으로 남기고, 공식 필드의 부재는 `null`로 남깁니다. 부모가 다른 동명 요소·외부 namespace·중복 요소·할당 실패·정확한 개수 및 바이트 한도는 합성 반례로 검사했습니다. 따라서 코퍼스에 없는 버전의 의미, 설정 간 우선순위, 실제 페이지 결과까지 동일하다고 주장하지 않습니다.

2026-09-27 현재 소스의 직접 설정 집중 테스트와 `strikeContinue` 실파일 테스트를 Debug·ReleaseSafe·ReleaseFast에서 다시 통과했습니다. 독립 ZIP/XML 조사는 484개 후보 중 읽기 실패 8개, 정의 555개, `startNum`·`grid`·`visibility` 각 555개·`lineNumberShape` 554개와 `strikeContinue="0"` 21개를 재확인했습니다. 조사기의 Python `assert` 자체 반례를 명시적 예외로 바꾸고, 뒤 section 손상 시 앞 section만 집계하지 않도록 파일별 원자적 집계로 수정했습니다. 일반·`-O` 자체 반례와 `-O` 고장 주입을 통과했습니다. 직전 묶음에서 제품 코드가 같은 상태로 통과한 known 8개 shard는 이번에 재실행하지 않았고, 위의 과거 전체 테스트/audit 개수를 현재 결과로 일반화하지 않습니다.
