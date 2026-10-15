# HWPX 입력 범위의 필드 대상 조회

## main6cb3bcef 기반 분리 검증 (2026-10-16)

### 표 호스트 원인 확인과 후속 후보

정규 `hwpx-text-audit`의 등록34파일(새 공개 검사 포함)을 Node 동시성2·명시적 위 후보로 실행해95/95·실패/취소/skip0·144527.606666ms·exit0을 확인했습니다. reference/legacy는 원본 checkout을 읽었고 Git 목록은 원본 저장소를 명시했습니다. 새 API/소스 게시와 기본 WASM 교체는 구분합니다. 기존 기본 산출물 SHA-256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`은 유지합니다.

추가 native 검증은 root 포함6/6·exit0입니다. 실제 표 호스트와 flat 경계/OOM 외에, 분할된 현재 소유 문단의 캐시 사용/미사용 양쪽 query·display 전체 할당 실패 주입·surrogate 거부·조회 전후 저장 bytes 불변을 확인했습니다. 이 결과는 전체 native 전수 통과가 아닙니다.

최초 후보의 표 호스트 거부 원인은 필드 전체 내용 검사에 현재 문단 밖의 표·덧말까지 포함한 것이었습니다. 실제 직장훈련계획 XML에서 같은 CLICK_HERE 필드는17문단·표1개·셀8개·덧말1개를 포함합니다. CFB/ZIP 손상이 아닙니다. 후속 flat 경로는 기존 `plain_paragraph_policy.validateForFieldText`와 `anchor_text_positions.build`로 현재 문단의 입력 정책·앵커 폭을 공유합니다. 중첩 필드 거부와 구조 소유 경로의 기존 정책은 유지합니다.

후속 ReleaseSafe WASM `zig-out/local-field-host-final/bin/hwpjs.wasm`의 SHA-256은 `35600ce1f8bb5c3c78a53efe3cafc7b34a86313bd420c285169f307dcc4681da`입니다. 명시적 후보로 `tests/hwpx/field-query-publication.test.mjs`4/4가 통과했습니다. 실제 표 호스트의 U+FFFC 표시·0폭 입력 대상·표 삭제 범위 null/명령 거부·Unicode 접두 입력·독립 전체 XML/ZIP 대조(Python 및 -O, 잘못된 기대값 음성 대조)·재열기·undo/redo, 실제 hyperlink 원본/분할, 선두 BOM 보존·잘못된 소유자/정수 거부 후 redo를 확인했습니다. 표시 getter의 중복 JS 선언도 제거해 하나만 유지합니다.

같은 후보의 기존 wire/prefix-route/display/created-table-field-label 네 파일8/8과 수정 후 기존 native splice root 포함3/3도 exit0입니다. 새 native 집중2/2는 실제 표 호스트 준비/삭제 거부, 인접한 빈 필드와 끝점의 모호성 거부, surrogate 경계, 포함 범위 밖 null, 조회의 전체 할당 실패 주입·원본 저장 불변을 검사했습니다. 최초 합성 입력은 기존 fixture helper가 덧붙이는 FORMULA의 id1과 충돌해 `InvalidFieldLinks`로 실패했으며 테스트 ID를101/102로 분리했습니다. 제품의 연결 검사를 완화하지 않았습니다. Worker·Canvas는 대역이며 실제 브라우저/IME 증거가 아닙니다. 아래 최초 후보의 거부·실측은 이력으로 보존하며 후속 후보에 소급하지 않습니다. 전체 등록/기본 WASM 승격은 아직 완료로 주장하지 않습니다.

## 계약

다른 문단의 객체 때문에 전체 라벨이 거부되던 닫힌 container 필드의 후속 source 경로·객체 보존·입력 route 순서는 [container 필드 텍스트](hwpx-container-field-text.md)가 소유합니다. native 범위 query가 현재 문단과 겹치지 않는 known field를 배제한 뒤 null을 반환해 정상 외부 앵커 경로를 보존하는 것도 같은 주제입니다.

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
