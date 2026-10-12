# 표와 본문을 감싼 닫힌 필드의 텍스트 입력

## 원인과 계약

참조 거부 상위의 issue6101 소방훈련 계획/issue2470 masked/task2243 sewoon 원본은 끝 없는 필드가 아니라 정상 시작·종료의 CLICK_HERE가 표와 여러 문단을 감싼 문서입니다. 기존 validateLinked는 필드 전체 XML에서 tbl/pic 등 허용 목록 밖 요소를 만나면 다른 문단/셀의 단순 텍스트 라벨까지 거부했습니다. 합성 root 필드→표 셀→본문 사례에서 getter0개로1/1 실패를 재현했습니다.

로컬 source 경로는 실제 선택 문단의 검증과 보호 앵커 좌표를 source_field_paragraph_positions에서 조립합니다. plain_paragraph_policy의 기존 공통 판정에 필드 마커와 알려진 앵커를 동시에 허용하고 anchor_text_positions를 사용해 객체 폭을 보존합니다. unknown 직접 컨트롤·inline·잘못된 위치를 임의로 허용하지 않습니다. 자손 필드의 보호/조상 dirty·현재 문단과 겹치는 orphan 목록/중첩 scope 검사는 유지합니다. 다른 문단의 opaque 객체는 수정 대상이 아니며 원문 그대로 남습니다. 구조 모델은 기존 whole-field strict 경로를 유지합니다.

조회와 입력은 같은 Prepared·validatePreparedRange를 사용합니다. 표 앵커 삭제는 ProtectedInlineControl이고 테이블 payload를 문자열로 대체하지 않습니다. 입력은 대상 text site와 검증된 dirty metadata만 변경하며 실패 후 텍스트/dirty가 함께 원래 상태를 유지합니다.

범위 query는 known field가 실제 현재 문단 segment와 겹치지 않으면 strict 라벨 조회 전에 null을 반환합니다. 다른 셀의 필드와 뒤쪽 root orphan 때문에 바깥 표 입력을 불필요하게 막지 않습니다. source_field_analysis의 known report와 같은 positions를 사용하고 OOM/source 오류를 숨기지 않습니다. 실제 field 소유자가 있으면 Worker/prefix 도구는 generic anchor display보다 그 대상을 먼저 사용합니다. null이면 정상 앵커 경로를 시도할 수 있지만 기존 목록의 임의 첫 필드로 fallback하지 않습니다.

## 실측

container-field-text 후보 SHA256 `3b33a1294302d43684db69ad1603b5bf28d0f5345dfcfe7e62eaa526fc4ef2ef`는 ReleaseSafe build6/6 exit0입니다. 세 원본 전수 query는 소방563문단=plain114/anchored6/field443, masked423=plain33/anchored7/field383, sewoon332=plain48/anchored3/field281이며 모두 refused0/exit0입니다. 기존443+383+281=1107거부가 이 세 파일의 조회에서 없어졌습니다. 모두 실제 입력했다는 의미는 아닙니다. 로그는 후보 폴더의 routes-firefighter/masked/sewoon.log입니다.

source query preflight와 route 순서를 포함한 container-field-routing SHA256 `802b9e8daf0f399f9c9b11bb7eec66bb23a8b91dc455631045a044e0237e367e`도 ReleaseSafe build6/6 exit0입니다. 실제 sewoon52번·masked41번·소방 section2의전역121/122번(로컬1/2)의 prefix 도구 입력·normal/-O 독립 전체 XML/ZIP/metadata·잘못된 기대값 거부·원문/수정본 undo/redo·재열기/재저장·원본 파일 불변이 통과했습니다. 중첩/쪽번호 기존 회귀를 포함한3/3 exit0입니다. 첫 assay는 허용 한도보다 큰32MiB history budget을 전달해 LimitExceeded를 냈고16MiB로 교정한 실행만 성공 근거입니다.

같은 최신 후보의 Canvas 컨트롤러→Worker→WASM 실제 소방 표 셀 입력1/1 exit0도 독립 XML/ZIP와 undo 원문/redo 수정본을 확인했습니다. 로그는 canvas-field.log입니다. DOM/Canvas는 대역이며 실제 브라우저나 원본 조판 검증은 아닙니다.

native 집중2/2는 셀/본문 입력의 모든 할당 실패·테이블/종료 마커 보존·표 삭제 거부·두 명령 이력·뒤 root orphan 전의 외부 표 query/null과 실제 앵커 입력·orphan 보호 유지입니다. 기존 중첩/모호한 경계 회귀2/2와 prefix/query9/9도 통과했습니다. 정규 root에 등록했지만 이전 실행 바이너리에 이 새 검사가 들어갔다고 소급하지 않습니다.

독립 hwpx-container-field-prefix-oracle는 대상 section/문단/ID를 명시하고 한 정상 닫힌 텍스트 필드의 직접 문단에서 원래0위치의 text/anchor를 찾습니다. table 앞의 파생 입력이면 그 위치에만 t를 추가한 기대 트리와 전체 XML을 비교합니다. 필드 마커/객체 subtree/ZIP 항목을 제거하거나 정규화하지 않습니다. normal/-O self-test는 정상1개와 기대값/ID/비대상 payload/표 속성/셀 본문/종료 마커/dirty/필드 밖 삽입의8개 반례를 검사합니다. 단일 닫힌 필드의 prefix 검증이며 임의 중첩·다문단 구조 변경의 범용 oracle는 아닙니다.

코어/API/Worker 및 실제 회귀는 아직 로컬입니다. 최신 전체 native/public·전체 참조 실제 편집·여러 목록의 중첩·서식 동반 명령·끝 없는 필드·브라우저·원본 레이아웃은 남아 있습니다. 진행 중인 e64 공개 전체와 metadata-text-sites native 전체는 이 변경 전입니다.
