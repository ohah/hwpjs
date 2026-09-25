# HWPX 구역 쪽 테두리·배경 원값

`src/hwpx/section_page_border.zig`는 2011 paragraph namespace의 `hp:secPr` 직접 `hp:pageBorderFill`과 그 직접 `hp:offset`을 XML 순서대로 관측합니다. `readXmlTrees().inspectSectionPageBorders()`와 `Document.inspectKnown().section_page_borders`는 같은 검사기를 사용하며 반환 보고서는 `deinit`해야 합니다. 항목은 section 순번·요소 인덱스·직접 부모 인덱스, 속성별 정규화 원값/부재, 미등록 속성·열거값·직접 자식 개수를 소유합니다. `BOTH`·`EVEN`·`ODD`를 하나로 합치거나 중복 요소를 덮어쓰지 않습니다.

기준은 한컴 공식 모델의 [pageBorderFill](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/pageBorderFill.cpp), [offset](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/poffset.cpp), [열거형](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)입니다. 바깥쪽 여섯 속성은 `type`, `borderFillIDRef`, `textBorder`, `headerInside`, `footerInside`, `fillArea`; `offset` 네 속성은 `left`, `right`, `top`, `bottom`입니다. ID와 간격은 공통 unsigned32, 두 포함 플래그는 XML Boolean으로 검사합니다. 로컬 XSD 사본의 `xs:nonNegativeInteger` 자체는 32비트로 제한하지 않으므로, 이 범위 제한은 모델의 `UINT` 및 프로젝트의 공통 값 계층 계약입니다. 알려진 enum은 `type=BOTH/EVEN/ODD`, `textBorder=CONTENT/PAPER`, `fillArea=PAPER/PAGE/BORDER`입니다. 미지 enum은 거부하지 않고 원문과 진단으로 남깁니다. 개별 필드가 없으면 모델 기본값을 주입하지 않습니다.

2026-09-25 독립 `zipfile`/`ElementTree` 조사에서 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 수용 코퍼스의 `secPr` 555개에 `pageBorderFill`과 직접 `offset`이 각각 1,615개 있었습니다. `type`은 `BOTH` 575·`EVEN` 520·`ODD` 520개, `textBorder=CONTENT`는 19개, `borderFillIDRef=0`은 30개, `headerInside`와 `footerInside` 참값은 각각 5개입니다. `fillArea`는 전부 `PAPER`였습니다. `reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx`의 한 구역은 세 항목이 모두 `BOTH`이므로 타입별로 하나만 남기면 원본을 잃습니다. 로컬 표본에서는 인식 요소에 낯선 속성·직접 자식·누락된 공식 속성이 없지만 다른 버전의 필수성을 뜻하지 않습니다.

독립 조사기의 자체 반례와 8개 shard 분포를 Zig 문서별 부모 관계·구역 정의의 직접 자식 수·타입·참값·ID/간격 합계로 대조합니다. 합성 테스트는 3종 페이지, 중복 `offset`, 부재/0, 외부 namespace·중첩 위장, 낯선 enum·속성, 숫자/Boolean 오류, 정확한 개수·바이트 한도 및 모든 할당 실패 지점을 검사합니다. 직접 자식 개수는 요소만 세며 문자/CDATA는 원본 XML 트리에 남습니다. 원값 보고서 자체는 header를 참조하지 않습니다. 별도 [ID 참조 진단](hwpx-section-page-border-references.md)이 리소스 표와 연결하지만, 쪽 테두리의 선택·레이아웃, 편집·저장·무손실 왕복 또는 전체 XSD 적합성은 검증하지 않습니다.

## 검증 기록과 적대적 재검토

2026-09-25에 독립 조사기 자체 반례, 합성 검사의 Debug·ReleaseSafe·ReleaseFast, 실파일에서 원본 문서 해제 후 보고서 값 수명, 늦은 단계 한도 오류 후 전체 정리, 반복 `BOTH` 실파일 회귀를 확인했습니다. 실파일 8개 shard의 ReleaseFast 대조는 476개 수용 문서의 정의별 `pageBorderFill` 개수, 타입 분포, ID 0/합계, Boolean 참값, `offset` 합계와 부모 관계에서 모두 통과했습니다. `zig build test --summary all`은 5/5 단계·2409/2409 테스트, `zig build audit -Doptimize=ReleaseSafe --summary all`은 40/40 단계·2448/2448 테스트, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다.

재검토 중 처음에는 반복 `BOTH` 파일을 한 구역의 3개로만 가정했으나 독립 ZIP 조사에서 10개 구역에 3개씩 총 30개임을 확인했습니다. 전용 테스트는 문서 전체의 30개와 순서를 검사하도록 바로잡았습니다. `0`은 부재로 대체하지 않고, 타입별 중복도 지우지 않으며, 미지 enum은 보존합니다. 다른 namespace·중첩 위장, 공식 값의 잘못된 어휘, 예산 초과와 할당 실패가 보고서 상태를 누수하지 않는지도 검사했습니다. 이 시점의 원값 검증은 정식 쪽 적용 우선순위와 ID 참조 해석을 포함하지 않았습니다. ID 참조는 후속 문서에서 별도 검증합니다.
