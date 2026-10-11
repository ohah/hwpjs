# 문단 좌표의 지역 순회

`paragraph_text_positions.build`는 현재 Sites/Location에서 좌표를 일시적으로 조립합니다. 원문 tree나 문자열을 수정하지 않으며 좌표를 영속 cache로 관리하지 않습니다. source 단위와 표시 단위의 제목/북마크·탭·inline 제어 의미는 기존 공통 모듈이 소유합니다.

문단 하나를 조회할 때 구역 전체 elements를 두 번 순회하던 경로를 줄였습니다. 북마크 검사에는 소유 문단의 직접 자식과 그 자식만 방문합니다. 텍스트 자식 검사에는 선택된 실제 text element의 중복 없는 목록만 사용합니다. 목록은 element index로 정렬해 기존 tree 순서의 처리 순서를 유지하고, text 조각의 source 순서 정렬과 UTF-16 폭 계산은 기존 경로를 유지합니다. 같은 hp:t의 여러 텍스트 조각이 탭을 중복 생성하지 않습니다.

owners bitmap과 전체 Sites/Location의 선택 단계는 여전히 남아 있습니다. 모든 구역 크기 의존 비용을 제거한 것으로 주장하지 않습니다. 반환 배열과 임시 목록/bitmap의 할당 실패 정리는 기존 소유 규칙을 따릅니다.

## 후보 검증

ReleaseSafe build6/6·exit0(53초), 후보 `paragraph-position-local/bin/hwpjs.wasm` SHA256 `3f096f850ca61263f0b36e2f36f24064b1490208e28363fe1eff2391a7e43993`입니다. 이후 추가된 역순 site 반례는 test-only이며 runtime은 변경하지 않았습니다.

최종 집중 native29/29·exit0(root1+실제28선언)은 탭/줄바꿈·서식·제목/북마크 source 폭·current 값/원문 보존과 전체 할당 실패를 포함합니다. 새 반례는 다른 문단의 탭이 있는 XML에서 descriptor/location 배열을 역순으로 바꿔도 A-tab-B-emoji-tab-끝 순서, 탭2개와 UTF-16 총7단위를 확인합니다. 앞선28통과와 합산하지 않습니다. fmt/diff check가 통과했습니다.

baseline90337d와 이 후보에서 실제 charshape/aligns/hyperlink/chart/tabdef/noori/shapeline/table-bug의788문단 characterRanges 응답을 전수 비교해 모두 같았습니다(거부0, 진단 exit0). 새 후보의 조회 후 저장 바이트도 각 원본과 같았습니다. 이는 현재 원문 상태의8파일 응답 비교이며 모든 조작·fixture를 동일하게 검증한 것은 아닙니다.

같은 단일 프로세스 설정의 실제80168 Canvas controller→Worker/WASM 입력·독립 XML 양 모드·저장·undo/redo 회귀1/1·exit0·skip0(31795.686667ms)을 확인했습니다. 앞선90337d의 흐름57035ms와 비교할 수 있지만 시스템 부하/반복을 통제한 정밀 벤치마크는 아닙니다. [ASCII 비교 프로파일](xml-ascii-comparison.md)의 비용 측정에 대응한 후속이며 모든 문서 반응성 완료를 뜻하지 않습니다.

runtime은 최신 전체 native gate 전 미커밋입니다. 기본 제품/외부 데모를 교체하지 않았고 미해결 필드 전체 편집·구조/UI 및 다른 전체 순회 비용은 남습니다.
