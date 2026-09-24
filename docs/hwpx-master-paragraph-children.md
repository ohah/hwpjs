# HWPX 마스터페이지 문단 직접 자식 구조

`Document.inspectMasterPageParagraphChildren`와 `inspectKnown().master_page_paragraph_children`는 OPF 선언 정규 마스터페이지 중 루트 직접 `hp:subList`의 모든 후손 `hp:p`를 선택합니다. 각 문단의 직접 요소 `hp:run`·`hp:linesegarray`와 그 밖의 직접 요소를 구분합니다. 다른 namespace의 동명 요소와 손자 `run`을 직접 `run`으로 바꾸지 않습니다. 파트 선택·암호화 거부는 [마스터페이지 파트](hwpx-master-pages.md)가 소유합니다.

자식 이름 판정, 문단별 run/배열 부재·배열 중복 진단, 문단·직접 자식 합계 한도는 [section 문단 직접 자식](hwpx-paragraph-children.md)의 `paragraph_children.zig` 함수를 공유합니다. 이 스캐너는 XML 선택·직접 부모 관계·파트/합계 해제 바이트 한도만 소유합니다. 직접 자식 수는 마스터페이지 전체 파트에 걸쳐 누적합니다. 모델에 없는 자식과 부재·중복은 관측 진단이며 문서를 자동 거부하거나 값을 보충하지 않습니다. 배열 내부의 `lineseg` 원값은 [마스터페이지 줄 조각](hwpx-master-line-segments.md)이 별도로 소유합니다.

보고서의 `parts`·`sub_lists`·`xml_bytes`는 이 선택 범위의 합계이며 `children`에는 공통 문단 진단을 담습니다. `children.sections`는 section을 순회하지 않으므로 0입니다. 마스터페이지/section 보고서를 한 문서 결과에서 혼합하지 않습니다.

2026-09-25 로컬 허용 HWPX 476개 문서를 독립 ZIP/ElementTree로 조사한 결과 정규 마스터페이지 61개, 직접 `subList` 61개 아래 후손 문단 394개, 직접 `run` 521개, 직접 `linesegarray` 394개였습니다. 이 표본에서는 run/배열이 없는 문단, 여러 배열을 가진 문단, 기타 직접 요소가 0개였습니다. shard별 독립 기대값은 `src/hwpx_corpus_expectations.zig`에 고정합니다. 관측된 분포를 2011/후속 버전 전체의 필수성·허용 순서로 일반화하지 않습니다.

`python3 tools/hwpx-manifest-xml-oracle.py --self-test`는 직접성·foreign 동명 요소·중첩 문단 반례를 검사합니다. 제품 합성 검사는 `zig test src/root.zig --test-filter 'HWPX master paragraph children'`, 선택 실파일 대조는 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`를 N=0..7 각각 별도 프로세스로 실행합니다. 로컬 `reference/rhwp`가 없으면 corpus 대조는 재현되지 않습니다. 검사 통과는 문단 내용·서식 적용·줄 배치·쪽 적용·편집·저장 완료를 뜻하지 않습니다.

적대적 검토에서는 외부 namespace 동명 요소와 손자 run 오계수, 빈 문단·중복 배열 진단, 정확한 문단/직접 자식·파트/합계 XML 한도, 두 마스터페이지를 지나는 직접 자식 전역 한도, OOM 후 소유 버퍼 해제를 각각 확인했습니다. section과 마스터페이지의 자식 분류는 하나의 `paragraph_children.zig` 함수로, 루트·직접 `subList` 선택은 `masterpage_parts.zig` 함수로 공유합니다. 실제 파일의 run/배열이 모두 존재한다는 사실을 필수 규칙으로 승격하지 않습니다.

검증 결과: 독립 조사기 반례와 476개 corpus 분포, 전용 합성 테스트 Debug·ReleaseSafe·ReleaseFast 각 4/4(`root.test_0` 포함 5/5), 기존 section 자식 분류 테스트 Debug·ReleaseSafe·ReleaseFast 각 3/3(`root.test_0` 포함 4/4)가 통과했습니다. 제품 ReleaseFast known survey shard 0~7도 독립 기대값과 모두 일치했습니다. 최종 소스의 전체 Debug `zig build test --summary all`은 2,336/2,336, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계 통과했습니다. 검사 범위는 직접 자식 구조에 한정되며 문서 전체 의미의 완료는 아닙니다.
