# HWPX 구역 프레젠테이션 원값

`src/hwpx/section_presentation.zig`는 선택된 2011 section XML에서 `hp:secPr`의 직접 `hp:presentation`만 관측합니다. 문서 순서·section 순번·부모/요소 인덱스, 여섯 속성의 XML 정규화 원값과 부재, 미등록 속성·열거값, 직접 자식 수 및 직접 `hc:fillBrush`의 요소 인덱스·속성/자식 개수를 소유합니다. 중복 `presentation`이나 `fillBrush`를 첫 값으로 덮어쓰지 않습니다. 보고서는 `readXmlTrees().inspectSectionPresentation()`과 `Document.inspectKnown().section_presentation`에서 같은 구현을 쓰며 `deinit`해야 합니다.

한컴 OWPML 모델의 [presentation.h](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/presentation.h), [presentation.cpp](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/presentation.cpp), [열거형](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)을 기준으로 `effect`와 `applyto`의 공식 표기를 진단합니다. 이 철자 집합과 속성→자료형은 `section_presentation_fields.zig` 한곳이 소유합니다. `invertText`·`autoshow`는 공통 XML Boolean, `showtime`은 공통 unsigned32 어휘로 검사하고, `soundIDRef`는 빈 문자열과 부재를 구분해 보존합니다. 공식 모델의 생성자 기본값을 누락된 XML 속성에 채우지 않습니다. 알 수 없는 enum은 거부하지 않고 원값과 진단을 남깁니다.

공식 [FillBrushType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/FillBrushType.cpp)은 `winBrush`·`gradation`·`imgBrush`를 갖는 공유 코어 구조입니다. 이 `section_presentation` 보고서는 `presentation`에서 직접 연결된 `fillBrush`의 위치와 직접 자식 수까지만 관측합니다. 내부 필드 원값은 별도 `fill_brushes` 보고서가 소유하며, 이미지 ID 대상 연결·화면 전환·소리 적용은 여전히 검증하지 않습니다. 전체 브러시 XML 원문은 호출자가 소유한 XML 트리나 원본 문서 바이트에 남고, 두 반환 보고서가 이를 무손실 payload로 보존하는 것은 아닙니다.

선택된 header·section의 직접 브러시 내부 원값은 이제 [공통 fillBrush 검사](hwpx-fill-brush.md)가 별도 보고서로 소유합니다. `section_presentation`은 그 결과를 복제하지 않으며 두 보고서는 XML 요소 인덱스로 대조할 수 있습니다. 브러시 적용 의미와 저장은 여전히 남습니다.

한도는 `presentation` 개수, 직접 `fillBrush` 개수, `presentation`의 전체 직접 자식 수, `fillBrush`의 전체 직접 자식 수, 알려진 속성 하나의 UTF-8 바이트 수에 별도로 적용됩니다. 외부 namespace·중첩 동명 요소는 선택하지 않으며 미등록 직접 자식과 속성은 개수로 진단하되 내용은 보고서가 아니라 원본 트리/문서 바이트에서만 다시 읽을 수 있습니다.

2026-09-25 독립 `tools/hwpx-section-presentation-oracle.py` ZIP/XML 조사에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 수용 476개 문서의 `secPr` 555개를 관측했습니다. `presentation`은 25개로 모두 `effect="none"`, `soundIDRef=""`, `invertText="1"`, `autoshow="0"`, `showtime="0"`, `applyto="WholeDoc"`이며 각각 직접 `fillBrush` 하나와 그 아래 `gradation` 하나를 포함합니다. 이 분포는 버전 전체의 허용 범위나 그라데이션 내부 적합성의 증거가 아닙니다. 그 밖의 공식 enum·Boolean 철자·숫자 경계·중복/부재는 합성 테스트로 검사합니다.

## 검증과 남은 범위

독립 oracle은 외부 namespace·중첩 위장, 잘못된 숫자/Boolean, 손상된 복수 section ZIP에 대한 자체 반례를 가집니다. Zig 테스트는 필드 원값·부재, 공식/미지 enum, 직접/중첩 경계, 정확한 한도, 모든 할당 실패 지점의 정리와 실제 HWPX 문서 API 연결을 검사합니다. 선택 실파일 8개 ReleaseFast shard는 문서별 `secPr` 자식 개수와 모든 속성·직접 `fillBrush` 분포를 독립 조사 기대값에 대조합니다.

2026-09-25 검증: 독립 oracle 자체 반례 및 전체 corpus 조사, Zig 전용 테스트의 Debug·ReleaseSafe·ReleaseFast, 실제 파일 8개 ReleaseFast shard가 모두 통과했습니다. 샤드 합계는 수용 476개·ZIP 거부 6개·암호화 2개이며, `presentation`과 직접 `fillBrush` 각 25개, 그 직접 자식 수 및 여섯 속성 값/부재가 독립 조사와 일치합니다. `zig build test --summary all`은 5/5 단계·2421/2421 테스트, `zig build -Doptimize=ReleaseSafe`, `zig build compare -Doptimize=ReleaseSafe`, `zig build audit -Doptimize=ReleaseSafe --summary all`도 종료 코드 0으로 통과했습니다.

적대적 재검토에서는 외부 namespace/중첩 위장, 빈 `soundIDRef`와 부재, 중복 `presentation`·`fillBrush`, 모델 밖 enum, 숫자·Boolean 오류, 마지막 단계 실패 후 소유권을 확인했습니다. 처음 검사에서는 `fillBrush` 직접 자식 순회 한도가 빠진 것을 찾아 별도 전체 한도와 정확한 0/1 경계 테스트를 추가했습니다. 또한 `KnownReport`가 브러시 내부 payload까지 보존한다는 오해를 막도록 원문 소유 경계를 명시했습니다. 이 검증은 공유 `fillBrush` 의미나 효과 적용을 포함하지 않습니다.

이 검사 성공은 전체 HWPX 문서 유효성이나 프레젠테이션 효과의 적용·재생·편집·저장·무손실 왕복을 뜻하지 않습니다.

2026-09-27 현재 소스의 프레젠테이션 집중 테스트와 실파일 `inspectKnown` 연결 테스트를 Debug·ReleaseSafe·ReleaseFast에서 재실행했습니다. 독립 ZIP/XML 조사에서는 484개 후보 중 읽기 실패 8개, `secPr` 555개, `presentation`·직접 `fillBrush`·그 직접 `gradation` 각 25개를 재확인했습니다. 25개의 빈 `soundIDRef`와 `invertText` 참값을 부재나 모델 기본값으로 바꾸지 않았습니다. 자체 반례의 Python `assert`를 명시적 실패로 바꾸고 일반·`-O`의 전체 shard 출력 일치 및 `-O` 고장 주입 실패를 확인했습니다. 앞선 묶음에서 같은 제품 코드로 통과한 known 8개 shard는 이번에 다시 실행하지 않았으며 브러시 내부 의미·효과 적용·저장 지원도 증명하지 않습니다.
