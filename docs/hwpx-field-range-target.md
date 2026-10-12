# HWPX 입력 범위의 필드 대상 조회

## 계약

새 로컬 `fieldRangeTarget(section, paragraph, start, end)`는 문서 전역1-based 문단과 UTF-16 시작/끝을 받으며 유일한 입력 대상 `{beginElement,start,end}` 또는 null을 반환합니다. 범위 역전·정수 부적합·닫힌 editor를 거부합니다. 조회는 텍스트·dirty·이력을 변경하지 않습니다. 성공은 특정 문자열의 내용/용량·서식 명령까지 허용한다는 뜻은 아닙니다.

코어 field_label_range_target은 현재 라벨 목록의 후보를 setter가 공유하는 validatePreparedRange로 검사합니다. 자손 내용/경계 보호·필드 소유 텍스트 범위·보존형 인라인·UTF-16 surrogate 경계를 재사용합니다. 후보가 둘 이상이면 UnsupportedFieldLabelRange입니다. 표시 길이가 짧거나 배열에서 먼저 나온다는 이유로 선택하지 않습니다. 실제80168처럼 부모/자식의 표시 범위가 완전히 같은 경우 부모 명령은 자손 보호에 걸리고 내부 필드가 유일한 소유자로 남습니다. 외부 독점 텍스트까지 포함한 범위는 내부 대상으로 바꿔치기하지 않습니다.

새 optional export hwpx_edit_field_range_target은 기존 라벨 목록과 같은 count+12바이트 레코드 wire를0/1개 게시합니다. 기존 getter와 새 query가 publishFieldTargets 및 JS decodeFieldTargets를 공유합니다. decoder는 입력 타입·헤더/전체 길이·4096개 상한·시작/끝 역전을 검사하고 byteOffset도 반영합니다. 공개 기존 fieldLabels의 응답 형태는 바꾸지 않습니다.

이전 WASM에 새 export가 없으면 기존 유일 라벨 정책만 사용합니다. 겹친 후보를 임의로 선택하지 않습니다. JS 메서드는 this에 의존하지 않아 분리 호출도 가능합니다. Worker의 일반 입력과 글자 속성/글꼴 동반 입력의 대상 선택은 이 query를 사용합니다. 서식 자체의 지원 범위는 별도입니다.

## 검증 경계

native 집중2/2는 중첩 내부/외부 독점 구간의 대상 선택·보호 대상 포함 범위/null·범위 역전·인접 필드의 모호한 경계 거부·조회/입력의 surrogate 중간 거부·조회 모든 할당 실패·이력/dirty 불변과 기존 중첩 저장 검사를 포함합니다. decoder1/1은 offset·빈 목록·잘림·과다 개수·역전·입력 타입을 검사합니다.

nested-field-range 후보 SHA256 `780e506ab1083e021e7fcd7b857af5f0c1a97bab235d05482284f46d32eeff53`는 ReleaseSafe build6/6 exit0이며 실제 API/decoder2/2와 Canvas 컨트롤러→Worker→WASM 두 원본2/2가 통과했습니다. Canvas 입력은80168의3807번/86712의1261번 내부 라벨로 전달되고 독립 전체 XML/ZIP·본인/조상 dirty·undo 원문/redo 수정본을 확인했습니다. DOM/Canvas는 대역이며 실제 브라우저 검증이 아닙니다. 로그는 같은 후보 폴더의 canvas-nested.log입니다.

surrogate 보호를 추가한 nested-field-range-boundaries SHA256 `e64bdcfa3223fbbc2a07febb11bbf452a86c00a521cf5b247151e8a1d76a8711`는 ReleaseSafe build6/6 exit0입니다. 최신 후보의 중첩/쪽번호 전용/줄바꿈 포함 외부 입력/decoder 선택 검사4/4도 exit0입니다. 이어 실제 세 입력의 공개 query surrogate 거부를 추가한 재검사1/1과 새 Canvas 재검사2/2(실패/skip0)가 완료됐습니다. Canvas 로그는 이 최신 후보의 canvas-nested.log이며 앞선 후보의 결과를 소급하지 않았습니다. metadata-text-sites 이전 후보의 유일 하이퍼링크 fallback·분리 호출·조회 후 저장 불변·닫힌 상태 거부도 확인했습니다.

첫 실제 API 검사에서 완전히 같은 부모/자식 표시 범위에 null을 기대한 것은 검사 오류였습니다. 내부 필드가 유일하게 허용되는 경우로 교정해 다시 검증했습니다. 코어 정책을 완화해 테스트를 맞추지 않았습니다.

코어/API/Worker 연결은 아직 로컬이며 제품 WASM도 승격하지 않았습니다. 최신 전체 native/public·실제 브라우저·모든 필드 명령·다문단/구조 모델은 별도입니다. [중첩 필드 계약](hwpx-nested-field-labels.md)의 marker/목록 소유·dirty 정책을 그대로 사용합니다.
