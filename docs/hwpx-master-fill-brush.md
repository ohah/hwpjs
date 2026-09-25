# HWPX 마스터페이지 공통 fillBrush 원값

`Document.inspectMasterPageFillBrushes()`는 manifest에서 선택된 정규 `Contents/masterpageN.xml` 파트의 2011 `hc:fillBrush` 전체를 XML 순서대로 관측합니다. 루트 직접 자식 및 직접 `hp:subList` 안팎을 모두 포함합니다. `Document.inspectKnown().master_page_fill_brushes`는 이미 선택된 마스터페이지 파트 목록을 재사용합니다. 보고서의 브러시는 파트 종류 `master_page`, manifest 항목 인덱스, 요소·부모 인덱스를 제공하며, 원값은 보고서가 소유하므로 문서 해제 후에도 `deinit` 전까지 유지됩니다.

파트 선택·ZIP 해제·XML 바이트/요소 예산은 `masterpage_fill_brush.zig`가, 브러시·변형·색/이미지 필드와 직접 자식/속성 한도는 [공통 fillBrush](hwpx-fill-brush.md)의 동일 검사기가 담당합니다. 마스터페이지 파서가 이미 관측한 요소 수와 새 XML 트리의 요소 수가 다르면 거부합니다. 이 보고서는 브러시가 실제 어느 쪽에 적용되는지, OPF 이미지 대상이 해결되는지, 채움의 합성 우선순위나 저장 결과가 같은지를 주장하지 않습니다. 조건부 분기는 원문 양쪽을 관측하고 활성 분기 선택은 별도 정책입니다.

2026-09-25 독립 `tools/hwpx-fill-brush-oracle.py --master` 조사에서 로컬 HWPX 484개 중 ZIP 거부 6개를 제외한 manifest 선택 마스터페이지 61개에 브러시 40개가 있었습니다. 모두 `winBrush`였고 40개 모두 `hatchStyle`이 없었습니다. 부모는 polygon 29개·rect 11개였으며, 6자리 hex가 아닌 색 표기·미등록 속성·미등록 직접 자식은 관측되지 않았습니다. 이 분포는 gradation/imgBrush가 마스터페이지에 불가능하다는 뜻이 아니며, 합성 테스트가 두 변형의 공통 해석 경로를 검사합니다. 암호화 HWPX 2개는 전체 문서 수용 476개에서 별도로 제외합니다.

## 검증과 남은 범위

독립 oracle은 마스터페이지 선택·외부 namespace 위장·손상된 복수 파트의 원자성을 자체 반례로 검사합니다. Zig 합성 테스트는 root-direct 및 subList 아래의 위치, 다중 파트의 순서와 출처, 핵심 세 변형, 숫자 오류, 바이트/요소/브러시/전체 속성 복사 한도, 전체 할당 실패 정리와 `inspectKnown()` 조립을 검사합니다. 실제 `[2027] 온새미로 1 본교재.hwpx`의 10개 선택 파트·4개 브러시·색상 합계도 독립 조사와 대조합니다. 최종 코드의 선택 실파일 8개 ReleaseFast shard가 모두 통과해 파트 61개·브러시 40개와 6자리 색상 숫자 합계를 독립 조사값에 대조했습니다. 전용 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 5/5 통과했습니다. `zig build test --summary all`은 5/5 단계·2,429/2,429 테스트, `zig build -Doptimize=ReleaseSafe`와 `zig build compare -Doptimize=ReleaseSafe`는 종료 코드 0, `zig build audit -Doptimize=ReleaseSafe --summary all`은 40/40 단계·2,468/2,468 테스트로 통과했습니다. 마지막에 추가된 누적 XML 바이트 정확한 경계 테스트는 별도로 세 최적화 모드에서 재확인했습니다.

적대적 검토에서 공통 필드 검사기에 **개별 속성 길이 한도만 있고 복사된 원값 전체 한도가 없던 점**을 찾아 `max_total_attribute_bytes`를 추가했습니다. 한도가 여러 브러시·여러 마스터페이지 파트에 걸쳐 누적되는지, 정확한 한도에서는 통과하고 1바이트 부족하면 거부되는지 검사합니다. 미등록 속성은 보고서에 복사하지 않아 이 한도에 세지 않으며, 원본 XML 자체의 크기와 요소 수는 파트 경계에서 따로 제한합니다.

전체 XSD·조건부 적용·레이아웃·편집·저장·무손실 왕복은 아직 구현 완료가 아닙니다.
