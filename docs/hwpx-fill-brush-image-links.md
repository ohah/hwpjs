# HWPX fillBrush 이미지 OPF 연결

`src/hwpx/fill_brush_image_links.zig`는 이미 검사한 [공통 fillBrush 원값](hwpx-fill-brush.md)과 [마스터페이지 원값](hwpx-master-fill-brush.md)의 각 `hc:imgBrush/hc:img` 노드를 OPF manifest 항목에 연결합니다. 원값의 선택·namespace·부모 판정과 문자열 소유권은 `fill_brush.zig`가, 정확한 OPF ID 색인 및 absent/empty/embedded/external/missing 분류는 기존 `binary_reference_links.zig`가 소유합니다. 새 코드는 이 규칙을 복제하지 않고 노드마다 결과와 출처 인덱스를 반환합니다. `Document.inspectKnown()`의 `fill_brush_image_links`와 `master_page_fill_brush_image_links`는 각각 별도 예산·소유 보고서입니다.

`Site.node_index`는 대응하는 원값 보고서의 이미지 노드, `brush_index`는 브러시를 가리킵니다. 원문 `binaryItemIDRef` 문자열은 이 보고서에 재복사하지 않으므로 원값 보고서를 함께 보관해야 합니다. `Target.item_index`는 manifest 항목의 위치이며 embedded/external에서만 존재합니다. embedded는 OPF가 ZIP 항목을 가리킨다는 뜻일 뿐, 이미지 형식의 의미 검증·복호화·렌더링 성공을 뜻하지 않습니다. 빈 값과 속성 부재, 선언되지 않은 ID는 서로 다른 진단입니다.

기존 [이진 리소스 참조](hwpx-binary-references.md)와 [마스터페이지 이진 참조](hwpx-master-binary-references.md)는 스트리밍 XML 스캐너의 각 선택 범위에서 종류별 **집계**를 제공합니다. 이 보고서는 원값 검사기가 관측한 모든 core `fillBrush`의 **노드별 연결**이며, 마스터페이지에서는 직접 `subList` 밖도 포함합니다. 두 집계가 모든 입력에서 같다고 가정하거나 어느 한쪽으로 다른 쪽의 범위를 바꾸지 않습니다. 조건부 분기의 양쪽 원문을 관측하며 활성 분기만 적용하는 결과가 아닙니다.

`max_sites`는 각 보고서의 사이트 개수 한도이며 정확한 한도까지 허용합니다. 결과 배열과 OPF 색인은 호출자가 지정한 할당자를 쓰고 실패 시 모두 정리합니다. source 보고서가 먼저 해제되면 노드 인덱스로 원값을 역참조할 수 없습니다. OPF 항목 인덱스로 경로나 실제 바이트를 확인하려면 원본 `Document`도 필요합니다.

## 검증과 남은 범위

독립 `tools/hwpx-fill-brush-image-oracle.py`는 ZIP/OPF/XML에서 선택 문서의 각 이미지 ID를 별도로 추출하고 manifest 위치까지 대조합니다. 자체 반례에는 외부 namespace 위장, 다섯 대상 상태, 손상된 뒤쪽 마스터페이지가 포함됩니다. 로컬 HWPX 484개 중 ZIP 거부 6개·암호화 2개를 제외한 476개 문서에서 header/section 이미지 브러시 390건(헤더 borderFill 389, section rect 1)을 관측했고 모두 embedded였습니다. 61개 선택 마스터페이지에는 이미지 브러시가 0건입니다. 8개 shard의 대상 manifest 위치 합계는 `[9, 0, 57, 0, 0, 1, 1, 61786]`입니다. 이 표본은 마스터페이지 이미지 연결의 실파일 양성 사례나 외부/누락 ID를 증명하지 않으므로 다섯 상태와 마스터페이지의 범위 차이는 합성 테스트로 검사합니다.

2026-09-25 검증에서는 독립 oracle 자체 반례와 선택 실파일 8개 ReleaseFast shard가 모두 통과했습니다. Zig 전용 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 4/4, 기존 스트리밍 이진 참조 회귀는 Debug 7/7, 마스터페이지 Known 조립·할당 실패 테스트는 Debug 2/2가 통과했습니다. 실파일 각 사이트의 원값·출처·manifest ID/항목 인덱스와 embedded 상태를 확인하고, 현재 corpus에서만 기존 스트리밍 참조 집계와 원값 노드 집계가 같은 것도 대조했습니다. 전체 Debug `zig build test --summary all`은 5/5 단계·2,432/2,432 테스트, ReleaseSafe 제품 빌드·CFB 비교·전체 audit도 종료 코드 0으로 통과했습니다.

적대적 검토에서는 OPF ID 대신 동일한 ZIP 경로를 준 경우를 `missing`으로 판정하는지, XML 문자 참조를 ID로 정규화하는지, 위조한 노드의 부모·요소 순서를 거부하는지, 사이트 한도 1건 부족/정확 경계와 모든 할당 실패에서 누수가 없는지를 확인했습니다. 마스터페이지 합성 문서에서는 원값 링크 1건과 기존 직접 `subList` 스캐너의 0건 차이를 재현했습니다. 이 차이는 검사가 서로 다른 범위를 소유하기 때문이지 대상 해결 실패가 아닙니다.

정확한 재현 명령은 [개발·검증 명령](development-commands.md)을 따릅니다. 후속 책임은 대상 이미지의 실제 포맷·바이트 검사, 채움 우선순위·투명도·배치, 편집·저장·무손실 왕복입니다. 이 연결 검사만으로 HWPX 전체 문서 유효성이나 구현 완성을 주장하지 않습니다.
