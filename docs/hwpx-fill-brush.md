# HWPX 공통 fillBrush 원값

`src/hwpx/fill_brush.zig`는 문서 구조가 선택한 2011 header와 section XML 트리의 모든 `hc:fillBrush`를 헤더→section 순서로 관측합니다. 루트/section 출처와 요소·부모 인덱스, 브러시의 직접 자식 종류/개수, 아래 변형과 leaf의 원값·부재·중복·직접 자식 개수를 소유합니다. 한 브러시에 여러 `winBrush`·`gradation`·`imgBrush`가 있어도 하나를 임의로 선택하거나 합치지 않습니다. `readXmlTrees().inspectFillBrushes()`와 `Document.inspectKnown().fill_brushes`가 같은 검사기를 사용하고 반환 보고서는 `deinit`해야 합니다. 마스터페이지는 이 문서 트리 묶음에는 없고 [별도 보고서](hwpx-master-fill-brush.md)가 같은 필드 검사기를 재사용합니다.

공식 한컴 OWPML 모델의 [FillBrushType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/FillBrushType.cpp), [winBrush](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/winBrush.cpp), [gradation](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/gradation.cpp), [imgBrush](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/imgBrush.cpp), [color](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/color.cpp), [ImageType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/ImageType.cpp) 및 [열거형](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)에 표시된 19개 속성의 이름·종류를 `fill_brush_fields.zig` 한곳에서 정의합니다. 정수는 공통 signed32/unsigned32 어휘, alpha는 공통 XML float 어휘만 검사합니다. float를 화면 불투명도로 계산하거나 손실 변환하지 않습니다. 낯선 enum은 원값과 진단으로 남기고 거부하지 않습니다.

색상은 단순한 6자리 hex만 있다고 가정하지 않습니다. 관측된 `none`과 8자리 hex도 원문 그대로 남기며, 보고서의 `non_six_hex_colors`는 **6자리 hex가 아닌 표기 개수**이지 곧바로 오류 개수가 아닙니다. `gradation/@colorNum`이 있을 때는 직접 `color` 자식 수와의 불일치를 따로 진단하지만, 부재 시 공식 모델의 생성자 기본값을 채우지 않습니다. `img/@binaryItemIDRef`는 문자열을 보존합니다. 이 보고서 자체는 OPF/manifest 대상 연결, 이미지 복호화 또는 렌더링을 하지 않습니다. 기존 이진 참조 검사는 서로 다른 선택 범위를 가지므로 연결 완료를 이 보고서의 성공으로 추론하지 않습니다.

한도는 브러시 수·알려진 변형/leaf 노드 수·검사한 모든 직접 자식 수·알려진 속성별 및 전체 정규화 UTF-8 바이트에 독립 적용됩니다. 외부 namespace·다른 부모 아래 동명 leaf는 공식 자식으로 오인하지 않고, 미등록 속성/자식은 개수로 관측합니다. 미등록 내용과 브러시 XML 원문은 반환 보고서가 아닌 호출자의 소유 XML 트리 또는 원본 문서 바이트에서만 다시 읽을 수 있습니다. 전체 XSD 적합성이나 직렬화 가능한 무손실 모델은 아닙니다.

2026-09-25 독립 `tools/hwpx-fill-brush-oracle.py` ZIP/XML 조사에서는 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 수용 476개 문서의 선택 헤더·section에서 브러시 6,528개(헤더 5,164·section 1,364)를 관측했습니다. 직접 변형은 `winBrush` 6,021개·`gradation` 893개·`imgBrush` 390개이며, 직접 `color` 1,786개·`img` 390개입니다. 브러시 821개에는 변형이 둘 이상 있습니다. `hatchStyle`은 6,016개 winBrush에서, `colorNum`은 8개 gradation에서 빠져 있습니다. 6자리 hex가 아닌 색 표기는 1,663개이며, 모델 밖 enum·미등록 속성/직접 자식·선언 색 개수 불일치는 이 corpus에서 0개입니다. 이 수치는 마스터페이지의 브러시를 포함하지 않으며 모든 파일·버전의 구조적 적합성 증거가 아닙니다.

## 검증과 남은 범위

독립 Python oracle은 namespace 위장·다중 변형·색 수 불일치·잘못된 정수/float·손상된 복수 XML ZIP을 자체 반례로 검사합니다. Zig 전용 테스트는 변형/leaf의 전 필드, 중복·부재·모델 밖 enum/색상, 정확한 한도와 모든 할당 실패 지점, 문서 API 연결을 확인합니다. 2026-09-25 선택 8개 ReleaseFast shard가 모두 통과해 문서별 부재·종류·숫자 합계·표기 차이를 독립 oracle의 shard 기대값과 대조했습니다. 전용 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 5/5 통과했습니다. `zig build test --summary all`은 5/5 단계·2,425/2,425 테스트, `zig build -Doptimize=ReleaseSafe`와 `zig build compare -Doptimize=ReleaseSafe`는 종료 코드 0, `zig build audit -Doptimize=ReleaseSafe --summary all`은 40/40 단계·2,464/2,464 테스트로 통과했습니다.

적대적 검토에서 `section_presentation`의 예전 설명이 새로운 `fill_brushes` 보고서까지 내부 원값을 보존하지 않는다고 읽힐 수 있음을 확인해 두 보고서의 소유 경계를 고쳤습니다. 또한 알려진 leaf 아래의 미등록 자식도 전역 자식 한도에 포함되는지, 변형 노드 한도를 통과한 뒤 leaf에서 실패하면 할당을 모두 정리하는지 경계 테스트로 재확인했습니다. 6자리 hex가 아닌 색을 무조건 오류로 단정하지 않고, 실파일의 부재 필드에 생성자 기본값을 주입하지 않습니다.

마스터페이지 재사용 단계의 적대적 검토에서 알려진 속성의 **전체 복사 바이트 한도** 누락도 발견해 추가했습니다. 개별 속성 한도와 별개로 보고서가 소유하는 정규화 원값의 합계를 제한하며, 기존 header·section과 새 마스터페이지 경로가 같은 규칙을 사용합니다.

후속 [이미지 ID 대상 연결](hwpx-fill-brush-image-links.md)은 이 원값 보고서의 이미지 노드를 OPF 항목에, [이미지 바이트 검사](hwpx-fill-brush-image-payloads.md)는 내장 대상을 형식별 검사기에 별도로 연결합니다. 원값 보고서 자체가 OPF나 payload를 해결하지 않는 계약은 유지합니다. 남은 이미지 의미·brush의 실제 합성 우선순위·색 관리·투명도, 편집·저장·무손실 왕복은 별도 책임입니다. 이 원값 검사를 전체 HWPX 문서 유효성 판정으로 사용하지 않습니다.
