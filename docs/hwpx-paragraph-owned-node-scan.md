# HWPX 문단 소유 노드 순회

## 원인과 책임

긴 문서의 characterRanges 조회에서 character_style_formula_snapshot.read가 FORMULA 존재 여부를 확인하려고 구역 전체 elements를 매번 훑었습니다. paragraph_site_owner.ownsFieldMarker도 같은 전체 순회 후 가까운 문단 조상과 비교했습니다. 실제 Worker 프로파일·이전 실행 시간은 [구간 편집 검증](published-window-edit-verification.md)이 소유합니다.

paragraph_owned_elements.Iterator는 기존 immutable XML Tree의 child/sibling/parent 연결을 빌려 요청 문단의 자손만 원문 순서대로 순회합니다. 같은 paragraph namespace의 중첩 p는 별도 소유자로 보고 해당 subtree를 제외하며 foreign wrapper는 순회합니다. 동적 할당·세션/revision 캐시·새 문서 모델을 만들지 않습니다. 노드 범위·parent 소유·순환을 검사합니다. formula 종류/속성 파싱과 결과/서식 결합은 기존 모듈이 계속 소유하며 iterator는 그 의미를 재구현하지 않습니다.

## 로컬 후보 검증

ReleaseSafe 집중 native6/6은 실제 chart 서식/숫자 변경 후5유닛 수식 스타일·조회 반복/저장 불변·재열기,기존 문단 소유/중첩 provenance 및 모호한 binding 거부,foreign wrapper·중첩 p 제외·잘못된 child/parent/sibling cycle을 검사했습니다. 두 로컬 후보의 ReleaseSafe 빌드는 각각6/6 단계·exit0입니다. 할당 실패 전수와 전체 gate 완료의 증거로 확대하지 않습니다.

동일 Node26.7.0/분리 JS/26939문단 fixture의 전체 window 검사에서 최초 cb5d1b87 후보는148251.537417ms,formula 순회만 변경한 d97d0dafa60e442e5bbe694d1e95030f8f4d0ba280243ddb3c86c3cfe4b2171a 후보는114494.265167ms,필드 marker 판정까지 공유한26f6e9f820fc6d1d24bf4659921d0b080140849db00d1e48f1fdff7c7d2d47b5 후보는116045.219458ms입니다. 각 실행은1/1·skip0·exit0이며 독립 XML/ZIP·잘못된 prefix 거부·undo/redo·원본 불변/재열기를 유지했습니다. 동시 부하가 있는 단일 실행끼리이며 두 번째 변경의 추가 개선은 입증되지 않았습니다.

formula 후보의 load/enable은14595.73/11509.27ms,marker 후보는15958.17/11905.39ms입니다. 최초24713.55/20123.04ms보다 작았지만 window 이동은9780.93/9743.12ms로 최초9782.26ms와 비슷했고 입력은13036.59/11413.07ms로 남았습니다. 이 순회만으로 지연이 해결됐다고 주장하지 않습니다.

## 게시와 정규 gate 경계

이번 최적화 부분만8be37e9b Git archive의 별도 `/tmp/hwpjs-owned-paragraph-main.9KiZ23`에 적용했습니다. 기존 로컬 result_overrides/source_display_options와 optionalAncestor 변경을 포함하지 않았습니다. 이 깨끗한 소스의 정규 zig build test -Doptimize=ReleaseSafe -j1(handle58080)은 native 실행 중 물리 footprint20373322488bytes/peak20373355256bytes를 실측해 자원 기준 초과로 중단했습니다. 최초 native PID27591 종료 뒤에도 build가 다른 native 실행PID33197을 시작했으므로,같은 소유 build18503/18646과 해당 자식만 종료했고 최종exit143입니다. 전체 테스트 count/pass 또는 allocator leak 원인을 추정하지 않습니다. native 변경/기본 WASM은 아직 게시하지 않았습니다.

이전0c976911 native binary의4052개 guardian 전수는3359개 완료 뒤 index3359에서 current/peak 물리 footprint8656230856bytes가8GiB 한도를 넘어 자동 종료됐습니다. handle77580·exit1·incomplete이며 assertion 실패나 전체 pass로 기록하지 않습니다. 이번 새 iterator/후속 form 후보의 전수 완료 증거로 소급하지 않습니다.
