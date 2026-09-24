# HWPX 마스터페이지 이진 리소스 참조

`Document.inspectMasterPageBinaryReferences`는 [마스터페이지 파트](hwpx-master-pages.md)가 선택한 정규 OPF manifest 항목을 순서대로 읽고, 루트의 직접 `hp:subList` 후손에서만 `binaryItemIDRef`를 관측합니다. 외국 namespace의 동명 `subList`나 다른 루트 직접 요소의 참조를 바탕쪽 본문으로 합치지 않습니다. `inspectKnown`은 같은 결과를 `master_page_binary_references`로 반환합니다.

ID는 [기존 이진 참조 연결](hwpx-binary-references.md)의 manifest ID 색인과 XML 개체 분류를 그대로 사용합니다. 마스터페이지용 출처는 그림의 `hc:img`, 도형 이미지 브러시의 `hc:img`, OLE 세 가지로 분리하며 section 결과와 합산하지 않습니다. 각 출처에서 속성 부재·빈 값·내장 대상·외부 대상·대상 누락을 구분하고, 출처를 판정할 수 없는 요소의 같은 속성은 `unclassified_attribute_sites`로 남깁니다. 첫 누락/미분류 ID와 원본 manifest 항목 인덱스는 소유 진단으로 반환하므로 `deinit(allocator)`으로 해제해야 합니다. 외부 URL을 가져오거나 BinData를 해제·복호화하지 않습니다.

공통 XML 문법과 namespace 검사는 선택 파트 전체에 적용합니다. 기본 한도는 마스터페이지 4096개, 파트별 XML 32 MiB, 합계 128 MiB, 속성 4096바이트·참조 위치 100만 개입니다. 이 한도와 보고서는 header/section 이진 참조와 별도이며 `inspectKnown` 안에서도 하나의 전역 해제량 예산으로 합치지 않습니다. 조건부 분기는 기본값에서 양쪽을 관측하고, 호출자가 실제 지원 namespace를 지정해 선택 모드를 쓰면 활성 분기만 분류합니다. 마스터페이지를 실제 쪽에 적용하는 규칙, 그림/폰트/OLE payload의 의미·표시, 편집·저장·무손실 왕복은 구현 범위가 아닙니다.

## 검증

합성 ZIP은 정확한 ID와 XML 참조 정규화, 내장·외부·누락·부재·미분류, 직접 `subList` 범위와 외국 namespace 위장, 다중 파트/전역 예산, 오류 뒤 해제 및 모든 할당 실패 경로를 검사합니다. 독립 `tools/hwpx-manifest-xml-oracle.py`는 Python 표준 ZIP/ElementTree로 OPF ID와 직접 `subList` 후손을 조사하고, 출처별 여섯 상태 및 미분류 수를 선택 실파일 8개 shard에서 Zig `inspectKnown`과 대조합니다. 실행 명령은 [개발·검증 명령](development-commands.md)에 둡니다. 로컬 `reference/rhwp` corpus가 필요하며 선택 shard는 기본 audit에 포함되지 않습니다.

2026-09-25 로컬 HWPX 484개에서 ZIP 거부 6개·암호화 2개를 제외한 476개 문서의 마스터페이지 61개를 조사했습니다. 그림 `hc:img`의 참조 위치는 35곳이며 독립 OPF ID 조사와 제품 결과에서 모두 내장 대상으로 해결됐습니다. 도형 이미지 브러시와 OLE 참조, 미분류 속성은 관측 0곳입니다. 다만 0건 유형의 성공은 합성 반례에만 근거하고, corpus 바깥의 모든 파일에 같은 분포를 주장하지 않습니다. 8개 실파일 shard는 그림 참조 `[4, 3, 10, 0, 0, 0, 3, 15]` 및 나머지 상태 0건을 독립 조사와 대조해 통과했습니다. 그 뒤 API의 미사용 한도 옵션을 제거한 최종 소스에서도 그림 10곳이 있는 shard 2를 다시 통과했습니다.

적대적 검토에서는 외국 `subList`·루트의 다른 직접 요소를 스캔할 경우 건수가 늘어나는 반례, 선택 범위 안의 미분류 `binaryItemIDRef`를 조용히 버리는 반례, 두 파트의 누적 위치/바이트 한도, 비활성 조건부 분기의 잘못된 XML 문자 참조를 분리해 검사했습니다. 처음에는 마스터페이지 옵션에 실제로 적용하지 않는 header/section 한도가 노출됐으므로 전용 옵션으로 줄였습니다. 기존 header/section 스캐너 옵션은 바꾸지 않았습니다.

최종 소스에서 마스터페이지 전용 합성 테스트 7/7은 Debug·ReleaseSafe·ReleaseFast로, 기존 header/section 이진 참조 테스트 7/7은 Debug로 통과했습니다. 전체 Debug `zig build test --summary all`은 2,347/2,347, ReleaseSafe 제품 빌드와 JS 비교 47/47, ReleaseSafe 전체 `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, `git diff --check`, 독립 Python oracle 자체 테스트·전체 corpus 조사도 통과했습니다. 이는 참조 ID 연결의 검증이며 실제 그림 이미지/쪽 표시의 동치 증명은 아닙니다.
