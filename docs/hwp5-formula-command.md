# HWP5 계산식 command 분리

현재 공개 splice는 관측 SUM/AVG 구역의 일반 문단/숫자 셀 편집과 재계산을 원자적으로 연결하며 명시적 stale-layout opt-in으로 CFB 저장/재열기를 지원합니다. 계산식 표식을 포함한 대상 문단 직접 편집은 아직 거부합니다. 아래 envelope·준비 단계의 ‘공개 편집 거부’는 해당 단계 기록이며 마지막 공개 거래 연결 결과와 구분합니다. 모든 한컴 수식 문법이나 임의 셀 텍스트를 지원한다는 뜻은 아닙니다.

`body/formula_command.zig`는 실제 chart.hwp의 `%fmu`에서 관측한 `=expression??format,;;cached-display` envelope만 분리합니다. 이 구문은 공식 필드 공통 표 152의 전체 필드 종류별 command 명세라고 주장하지 않습니다. 식·출력 형식·저장된 표시 결과는 UTF-16LE 원문을 빌리는 slice이며 별도 원본 캐시를 생성하지 않습니다.

`field_start.Properties.formulaView`는 이미 공통 필드 길이와 instance ID를 파싱한 command에만 적용합니다. 호출자는 `%fmu` 종류인지 먼저 확인해야 합니다. instance ID·extra를 command 문자열에 섞지 않습니다. 홀수 바이트, `=`·두 구분자 부재, 빈 식/형식은 오류이며 미지 형식을 임의 기본값으로 변환하지 않습니다. 빈 저장 표시 값은 원값으로 유지합니다. Unicode 해석·식의 유효성·숫자 변환·함수 실행은 아직 이 계층의 책임이 아닙니다.

chart에서 관측한 `SUM(B?:E?)`, `SUM(?2:?4)`, `AVG(B?:E?)` envelope와 `%g`/`%.2f` 출력 형식, 저장 결과 분리, borrowed 포인터, 빈 결과 및 구조 오류를 검사했습니다. ReleaseSafe 집중 root 포함 3개가 통과했습니다. 이 합성 검사는 모든 실제 필드의 native 연결 검증이나 계산식 재계산 성공을 대신하지 않습니다. 공개 편집 정책은 아직 `%fmu`를 거부하며 저장된 결과를 최신 값으로 승격하지 않습니다.

후속 native 실파일 검사는 제품 Source의 CFB/압축 해제 경계로 chart.hwp를 읽고 13개 필드의 원문 문단 위치·식·형식·저장 표시를 각각 대조했습니다. SUM 10개·AVG 3개와 그룹별 상대 범위, 쉼표가 포함된 저장 표시, properties의 attributes=0·other=8·extra 4바이트를 확인했습니다. 모든 공통 필드 필수 prefix 잘림도 UnexpectedEnd로 거부됩니다. 새 검사에서 기대값은 독립 원문 조사에서 확정한 문자열/문단 목록이며 제품 파서 결과로 생성하지 않습니다. ReleaseSafe root 포함 4개 검사가 통과했습니다. 이는 CFB.js/Node 독립 디코더를 새 native 검사에서 다시 실행한 결과가 아니라 앞선 독립 조사 기대값과의 대조입니다.

`body/formula_range.zig`는 현재 관측 SUM/AVG의 단일 사각 범위만 구조화합니다. 대문자 열 주소(A=0, Z=25, AA=26), 1기반 숫자 행과 현재 축 `?`를 구분하고 `View.range`로 envelope에 연결합니다. resolve는 호출자가 제공한 실제 소유 셀과 표 크기로 경계를 검사합니다. 0 행·주소 산술 오버플로·표 밖 참조·역방향 범위는 오류이며 다른 함수·단일 셀 인수·복합식·소문자 등 미연결 구문은 추정하지 않습니다. 범위 반환은 셀 순회/계산을 실행하지 않습니다.

실제 chart 첫 표의 B2~E2 값 11.2·24.7·16.3·15.3 합계는 저장된 67.5와 일치합니다. 세 번째 표의 B2~B4 값 58·89·98 합계는 B5의 245와 일치합니다. 이 관측은 B?/E?의 현재 행과 ?2/?4의 현재 열 해석 근거이며 모든 한컴 식 문법의 공식 증명으로 일반화하지 않습니다. 초기 진단의 단순 ‘최근 목록’ 스캔은 root 문단에 목록이 누출될 수 있어 실제 제품 소유 판정으로 사용하지 않습니다. native 실파일 검사는 13개 식 모두 범위 구문을 읽고 SUM 10개·AVG 3개를 확인합니다. 이 범위 파싱 단계에서는 소유 셀 연결과 독립 재계산이 미완료였으며 후속 결과는 아래에 구분합니다.

후속 `body/formula_cell.zig`는 이미 해석한 불변 Tree와 같은 트리에서 만든 Groups를 소비합니다. 대상 문단의 직접 부모와 정확한 논리 목록을 찾고 기존 table_lists.Iterator로 캡션/셀을 구분합니다. 지정한 목록 배치로 기존 Cell.parse를 호출하고 table_grid.Rectangle.validate로 대상 셀 span을 검사합니다. 반환 값은 표/목록 source node·셀 좌표·표 크기뿐이며 참조 셀 내용을 복제하지 않습니다. 이 함수만으로 전체 격자의 중복/빈틈·병합 셀 해석·서식 조판을 검증했다고 보지 않습니다.

실제 chart 13개 필드 모두 정확한 소유 셀과 표 크기로 범위를 resolve했고 첫/끝 행·열을 확인했습니다. root 문단에 이전 목록을 누출하지 않는 FormulaOutsideTable, 잘못된 노드, 실제 셀의 span 0 변이와 TABLE 부재도 거부됩니다. ReleaseSafe 실제 command 집중 root 포함 2개가 통과했습니다. 공개 편집 정책은 여전히 계산식을 거부합니다.

`body/formula_number.zig`는 관측 셀 숫자의 UTF-16LE 텍스트를 한도 128유닛 내에서 읽습니다. 부호·정수·소수와 정확한 3자리 쉼표 묶음을 허용하며 빈 값·불완전 묶음·비숫자·비유한 값은 오류입니다. 지수·공백·퍼센트·로케일 숫자는 아직 미지원이며 0으로 보정하지 않습니다. 원본 표시 문자열은 변경하지 않고 해석된 숫자만 반환합니다. 아래 실제 셀 수집과 현재 모델 reader가 이 파서를 공유합니다.

`body/formula_values.zig`는 같은 불변 표의 Groups에서 참조 셀을 수집해 SUM/AVG를 계산합니다. source binding·대상 셀 span·범위·유일성·본문 개수를 확인하고 실제 셀 텍스트를 formula_number로 읽습니다. 다른 표/캡션은 제외합니다. 병합 셀·복수 문단·필드가 포함된 참조 셀은 미지원으로 반환하며 저장된 계산식 표시를 숫자 입력으로 사용하지 않습니다. 참조 셀 수와 그룹 검사 횟수의 별도 한도를 적용합니다. 원본·모델을 변경하지 않고 값/셀 수만 반환합니다. f64 중간 합계가 비유한 값이면 오류입니다.

실제 chart 13개 계산식의 참조 셀 3/4개를 native로 읽어 계산한 결과가 모두 원문 저장값과 오차 0.000001 이내로 일치했습니다. 0 셀 한도/0 검사 한도는 LimitExceeded입니다. ReleaseSafe 실제 command 집중 root 포함 2개가 통과했습니다. 별도 CFB.js/Node 원문 기록 해석으로 부모·논리 목록·표 경계를 구분하고 실제 셀 텍스트에서 13개 SUM/AVG를 다시 계산해 일치했습니다. 두 계산 모두 저장된 결과를 입력값으로 쓰지 않습니다. f64 수치 정책을 한컴의 모든 반올림/형식 동작과 동일하다고 주장하지 않습니다.

`formula_values.evaluateWith`는 소유/범위 검사를 유지하면서 셀 값 읽기만 주입합니다. `edit/formula_value_reader.zig`는 같은 source node에 바인딩된 현재 모델 문단 토큰을 읽고 기존 textBytes와 numberFromText 검사를 재사용합니다. 같은 source node가 없거나 중복되면 SourceBindingMismatch이며 원본 fallback을 하지 않습니다. 읽기용 임시 버퍼를 해제하고 계산 모델이나 저장 캐시로 보관하지 않습니다.

실제 chart의 모델 projection에서 셀 19의 소유 토큰만 11.2 → 12.2로 수정하면 현재 모델 계산은 68.5, 불변 원본 계산은 67.5입니다. 잘못된 현재 숫자는 InvalidFormulaNumber로 거부됩니다. 수정 복원 뒤 13개 원래 결과도 모두 일치합니다. 이 테스트의 모델 수정은 공개 splice 명령을 통한 것은 아니며 필드 갱신/저장 연결을 증명하지 않습니다.

`body/formula_format.zig`는 관측 `%g`(유효 숫자 6자리)와 `%.2f`만 허용합니다. Zig 표준 float formatter를 사용하며, general의 반올림 후 지수로 decimal/scientific 전환을 판정하고 불필요한 소수 0을 제거합니다. grouping은 명시적 정책 인수이며 other=8이나 특정 extra bit가 쉼표를 뜻한다고 추정하지 않습니다. 실제 chart의 금액 3개에는 원문 조사에서 확인한 thousands 정책을 테스트가 명시합니다. 임의 printf command·비유한 숫자는 오류입니다.

형식 집중 검사는 999999.9 반올림 후 지수 전환, 작은 수, 0, 고정 소수 2자리와 음수/금액 쉼표를 포함하며 ReleaseSafe root 포함 2개가 통과했습니다. 한컴의 모든 출력·반올림 정책 동등성은 미검증입니다. 공개 저장 정책은 아직 바뀌지 않습니다.

`edit/formula_command_writer.zig`는 계산한 f64와 명시적 grouping을 받아 검증된 formatter를 호출한 뒤, 결과 부분만 바꾼 임시 command를 만듭니다. 임의 텍스트를 새로운 계산 결과로 받지 않습니다. 공통 field_start.Properties.withCommand가 command 유닛 수·전체 길이·instance ID·extra 직렬화를 소유합니다. 식·형식·other·instance ID·extra를 보존하고 표시 결과가 실제 달라졌을 때만 공통 modified_mask를 켭니다. 준비 함수는 모델이나 원본을 수정하지 않습니다. 임시 문자열을 저장 모델의 두 번째 캐시로 유지하지 않습니다.

실제 13개 계산 결과를 준비한 공통 payload는 원본 properties와 byte-exact 일치했습니다. 첫 결과를 68.5로 바꾼 payload를 다시 파싱해 새 결과·수정 비트와 나머지 필드 원문을 확인했습니다. 이는 CTRL_HEADER framing이나 문단 표시/저장 거래에 연결한 검사는 아닙니다. 공개 편집은 여전히 거부 상태입니다.

저장 준비 함수는 실제 첫 필드로 모든 할당 실패 위치를 검사했습니다. formatter·임시 command·공통 payload 준비 중 실패하면 원본 properties의 재직렬화가 byte-exact 유지되며 성공 출력은 다시 파싱해 결과/instance ID를 확인합니다. 무한대 결과·홀수 command 바이트·현재 모델 source binding 부재도 기대 오류로 거부됩니다. ReleaseSafe 실제 command 집중 root 포함 2개가 통과했습니다. 이는 아직 다중 문단 모델 거래 실패의 검증은 아닙니다.

후속 준비 코드까지 포함한 ReleaseSafe 전체 Zig 2,703개와 제품 편집 63개, ReleaseSafe 제품 WASM 빌드 5/5 단계가 통과했습니다. 공개 정책은 여전히 계산식을 거부하므로 이 회귀 결과를 chart의 공개 편집 성공으로 해석하지 않습니다.

다음 연결에는 공개 명령의 모델 반영과 계산 의존성·순환·수치/서식 정책 및 값 갱신 원자성이 필요합니다. 계산 결과 문자열과 원본 command 내 결과를 서로 다른 mutable SSOT로 만들지 않아야 합니다. URL이나 외부 코드를 실행하지 않습니다.

## 여러 문단 거래 준비

`src/model/clone.zig`는 거래 중에만 사용하는 소유 문단/구역 복사본을 만듭니다. source binding과 scalar 메타데이터는 유지하고 토큰의 raw 버퍼·글자 모양·범위·필드 속성은 각각 독립 할당합니다. optional의 null과 명시적 빈 배열을 구분합니다. 복사 도중 실패하면 이미 준비한 자원을 정리하며 원본을 해제하거나 수정하지 않습니다. 이는 저장 캐시가 아니라 아직 확정하지 않은 편집 초안이며 거래 연결 시 성공 후 교체 또는 실패 후 해제해야 합니다.

ReleaseSafe 집중 root 포함 2개 검사가 통과했습니다. 모든 할당 실패 위치, 서로 같은 입력 버퍼를 참조하는 두 문단의 독립성, null/빈 범위 구분과 원본 필드·서식 보존을 검사합니다. 아직 이 함수가 공개 편집 거래에 연결됐거나 전체 최신 회귀가 완료됐다는 뜻은 아닙니다.

`src/model/transaction.zig`는 동기 거래의 확정 경계를 소유합니다. 구역 초안을 복사해 준비 callback에만 전달하고 callback 실패 시 초안을 해제합니다. 성공하면 소유 구역을 교체하고 이전 구역을 해제하며, 확정 뒤에는 할당/실패 가능한 연산이 없습니다. 대상 버퍼와 allocator는 같은 소유권이어야 하고 병행 변경·callback의 원본 수정·초안 포인터 외부 보관은 허용하지 않는 호출 계약입니다.

실제 chart 모델을 초안으로 복사해 셀 19를 11.2 → 12.2로 바꾸고 SUM 68.5 및 공통 필드 출력 준비를 실행했습니다. 준비 뒤 강제 오류를 반환하면 원본 토큰 포인터와 값이 그대로 유지됩니다. 구역 복사·현재 셀 읽기·계산 출력 준비의 모든 할당 실패 위치에서도 같은 원본 보존을 검사했으며 성공 시 새 셀 값이 한 번에 반영됩니다. ReleaseSafe 실제 command 집중 root 포함 2개가 통과했습니다. 이 회귀의 준비 payload는 테스트 안에서 해제되므로 아직 모델의 수식 결과/표시를 함께 확정하거나 공개 저장에 연결한 것은 아닙니다.

후속 모델은 `Paragraph.formula_results`에 원본 필드 노드·f64 결과·명시적 NumberGrouping만 소유합니다. 숫자가 단일 출처이며 command 원문 사본이나 formatted 결과 문자열을 별도 mutable 값으로 저장하지 않습니다. clone/deinit도 이 배열을 독립 복사/해제합니다. 실제 거래 회귀는 셀 12.2와 필드 68.5를 함께 확정하고, 모든 할당 실패 및 준비 후 강제 거부에서는 원래 셀 값과 null 결과 배열을 유지합니다. 집중 chart 및 clone 검사가 각각 root 포함 2개 통과했습니다.

`edit/formula_record_writer.zig`는 같은 원본 노드의 `%fmu` CTRL_HEADER와 typed 결과만 소비합니다. common command writer와 record_writer를 재사용하며 식·형식·instance ID·extra를 보존합니다. 결과가 같으면 비정규 확장 framing까지 raw 그대로 반환하고, 변경된 길이가 같으면 기존 framing을 유지하며 길이가 달라지면 공통 framing writer로 생성합니다. 실제 chart 13개는 원문 record와 byte-exact 일치하고 첫 필드를 123.45로 변경한 record는 tag/level·새 command·instance ID·extra를 재파싱해 확인했습니다. 잘못된 노드 연결과 출력 한도 0은 거부됩니다. 이 파생 writer는 아직 text_section_writer나 공개 save에 연결하지 않았으므로 표시 텍스트와 command가 어긋난 출력은 공개하지 않습니다.

clone만 추가한 이전 source snapshot의 전체 ReleaseSafe 2,704개가 통과했습니다. 위 transaction·typed 결과·파생 record 변경을 포함한 최신 전체 회귀는 별도로 실행하며 이전 snapshot 통과로 대체하지 않습니다.

## 계산 결과 표시 준비

`body/field_span.zig`는 요청한 종류/순번의 같은 문단 시작·끝을 구조적으로 연결합니다. 전체 문단의 짝·알려진 필드 ID·깊이 32를 검사하고, 찾은 뒤에도 뒤쪽 손상을 무시하지 않습니다. 이 구조 검사 자체가 공개 편집 허가나 문단 간 필드 지원은 아닙니다. 실제 chart 13개는 시작 `%fmu`와 끝 `u m f 0x08`을 사용합니다. software 하이퍼링크의 NUL 끝과 달라 첫 엄격 검사에서는 FieldMarkerMismatch로 실패했습니다. `%fmu`의 관측 0x08 변형만 추가했고 임의 상위 바이트를 허용하지 않습니다. 0x09·종류 문자 불일치·끝 부재·존재하지 않는 순번 반례는 기대 오류로 거부됩니다. 0x08의 비트 의미를 공식 명세로 확정했다고 주장하지 않습니다.

`edit/formula_display_writer.zig`는 같은 숫자 결과와 원본 출력 형식으로 표식 사이 표시를 임시 UTF-16LE 출력으로 생성합니다. 표식 안에 다른 제어가 있으면 UnsupportedFormulaLabel이며 일반 숫자 label만 처리합니다. 앞/뒤 제어 payload는 그대로 복사하고 표시 교체의 시작/끝/새 유닛 수를 반환해 이후 공통 서식/범위 이동에 사용할 수 있게 합니다. 모델 토큰·command를 이 함수가 수정하지 않으며 임시 bytes는 호출자가 해제합니다.

실제 chart 13개 모두 원래 표시와 command 결과가 일치했고 같은 값으로 만든 표시도 byte-exact입니다. 첫 결과 123.45의 표시와 command를 각각 준비·재파싱하고 시작/끝 표식 및 나머지 텍스트 보존을 확인했습니다. ReleaseSafe 실제 command 집중 root 포함 2개가 통과했습니다. 이전 transaction/typed record snapshot의 전체 2,704개도 통과했지만 이 표시 연결 추가 후 전체 검증과 서식/범위 이동·공개 저장 연결은 별도입니다.

후속 `edit/formula_display_apply.zig`는 거래 소유 문단에만 파생 표시를 materialize합니다. 새 토큰·글자 모양·범위를 모두 준비한 뒤 교체하며 실패 시 그 문단 자체도 유지됩니다. caller가 원본 소유·리소스 개수와 원래 range view를 검증해야 합니다. `character_runs.replace`와 `text_ranges.prepare`를 일반 splice와 공유합니다. 범위 규약은 기존 명시적 half-open 실험이며 한컴 affinity의 공식 증명은 아닙니다. 이 내부 함수만으로 공개 수식 편집을 허가하지 않습니다.

## Section 저장 연결

후속 `text_section_writer.zig`는 materialize한 문단의 typed 결과를 파생 record writer로 출력합니다. 숫자 결과가 바인딩된 원본 필드가 같은 문단의 직접 자식/%fmu인지, 중복 결과가 없는지 검사합니다. 같은 문단에서 원문 필드 순번을 찾아 현재 표시를 숫자에서 다시 생성하고 byte-exact로 일치하지 않으면 FormulaDisplayMismatch로 거부합니다. 필드 속성 배열과 계산 결과가 같은 헤더를 각각 수정하는 조합은 아직 UnsupportedFieldAttributeCombination으로 거부하며 한쪽 값을 무시하지 않습니다.

실제 chart 거래의 셀 12.2·typed 68.5·표시 68.5를 전체 Section으로 직렬화한 뒤 첫 계산식 command를 재파싱해 68.5를 확인했습니다. typed 결과만 69.5로 변이하면 출력은 FormulaDisplayMismatch입니다. 복사·계산·표시·전체 Section 출력과 검사 중 모든 할당 실패에서 원본 거래 값이 유지되는 집중 root 포함 2개 검사가 ReleaseSafe에서 통과했습니다. 위의 ‘저장기 미연결’은 이 연결 전 단계 기록이며 공개 API의 source 정책·의존 식 갱신·CFB 저장/독립 oracle 대조는 아직 연결하지 않았습니다.

## 구역 계산식 재계산 준비

`edit/formula_recalculate.zig`는 불변 typed Tree/Groups의 `%fmu` 필드마다 현재 초안의 정확한 문단 source binding·원래 메타데이터·소유 셀·식 범위를 확인하고 현재 셀 값을 읽습니다. 원래 command의 grouping은 숫자 구문과 원래 formatter의 byte-exact 재생성으로 확인한 관측 정책만 유지하며 other 비트 의미를 추정하지 않습니다. 저장된 결과 숫자는 grouping/기존 표현의 검증에만 사용하고 계산 의존 값으로 사용하지 않습니다. 병합/복수 문단/계산식 참조 셀 및 미지원 문법은 기존 평가기의 오류를 전파합니다. 함수는 거래 소유 초안만 수정하며 실패하면 호출자가 초안 전체를 버려야 합니다.

참조 셀 수와 Groups 검사 횟수 한도는 각 식에서 초기화하지 않고 구역 전체에서 차감합니다. 실제 chart 13개는 총 48개 참조 셀을 읽으며 48개와 정확한 그룹 검사 예산에서는 성공, 셀 한도 47개에서는 LimitExceeded입니다. 재계산 결과의 command/표시가 원문과 같고 소유 결과가 아직 없으면 materialize하지 않아 무변경 재계산의 Section이 byte-exact 유지됩니다.

첫 입력 셀을 12.2로 바꾼 초안에서 수식 13개를 모두 재계산하고 전체 Section 출력의 command를 다시 읽었습니다. 첫 결과는 68.5이고 다른 12개는 원래 기대값입니다. 별도 원본 projection의 무변경 재계산에서는 모든 formula_results/range_tags가 null이며 Section 전체가 원문과 동일합니다. ReleaseSafe 실제 command 집중 root 포함 2개가 통과했습니다. 이는 공개 splice·의존성 그래프/순환 처리·CFB 출력의 독립 대조 완료가 아닙니다.

## 공개 splice·CFB·Worker 연결

`source_policy.hasFormulas`는 기존 미지 tag/ID·메모·다른 필드 거부를 유지하며 알려진 `%fmu` 구역만 원자적 수식 경로로 분류합니다. `formula_splice.zig`는 구역 초안에 기존 일반 splice를 적용하고 실제 텍스트 변화가 있을 때 현재 모델의 식 전체를 재계산합니다. 실패 시 구역 전체를 폐기합니다. 무변경 명령에서는 재계산으로 다른 결과를 암묵적으로 바꾸지 않습니다. 다른 구역에 대한 기존 보존 정책도 유지합니다. 원래 plain source 검사의 수식 구역 허용은 이 거래 경로에서만 사용하며 결과 라벨을 포함한 문단의 직접 편집은 계속 거부합니다.

native 공개 Session에서 chart 문단 19의 11.2를 12.2로 교체하고 문단 23 표시 68.5를 확인했습니다. 비숫자 x로 교체하면 InvalidFormulaNumber이고 기존 셀/식은 유지됩니다. CFB 저장 후 새 Session에서 수식 텍스트가 동일합니다. JS/WASM 제품에서도 같은 실제 명령·거부·저장·재열기를 검사했습니다. 독립 CFB.js/Node raw records는 원래 셀 4개의 숫자로 SUM 기대값을 계산하고, 코드 유닛별 서식 oracle로 두 변경 문단과 command 수정 비트/길이를 조립해 전체 Section을 byte-exact 대조했습니다. 비대상 스트림 전체와 목록도 원문과 동일합니다.

Worker는 일반 숫자 문단만 편집해도 구역에 필드 시작이 있으면 native 저장/미리보기 projection을 다시 읽습니다. JS에서 수식이나 파생 라벨을 계산하지 않습니다. 실제 Worker 모듈의 Node 회귀에서 셀 12.2와 다른 문단의 «68.5»가 함께 응답에 반영됐습니다. 실제 브라우저/OS IME 검증은 아직 별도입니다. ReleaseSafe 제품 편집 회귀 65개가 통과했습니다.

추적 1,481문단의 실제 prefix 삽입 전수 검사는 1,418개 성공입니다. 남은 거부는 참조 숫자 셀에 비숫자 접두사를 넣는 48개 InvalidFormulaNumber, 수식 표식 문단 13개 UnsupportedSectionControl, 문단 간 필드 2개입니다. HWPX 공개 연결 45개와 preview 거부 3개도 별도 남아 있습니다. 이 성공 수치를 모든 편집/조판 지원으로 해석하지 않습니다. 공개 연결 전 source snapshot의 전체 Zig 2,704개 통과와 현재 공개 연결 이후 전체 회귀는 구분합니다.

## 반복 편집의 수정 속성 회귀

실제 제품 WASM에서 셀 11.2 → 12.2 → 112.2 → 11.2를 반복 편집했습니다. 결과 68.5 → 168.5 → 67.5와 표시/command 길이는 맞았지만 원래 값 복원 때 수정 bit 15가 0으로 초기화되는 오류를 재현했습니다. 수정 전 실제 Node 회귀가 `0 !== 32768` assertion으로 실패했습니다.

`FormulaResult.modified`는 숫자와 별개인 sticky 편집 이력 속성이며 command 문자열 캐시가 아닙니다. 구역 재계산이 materialize한 결과에 true를 유지하고 파생 record writer가 원래 attributes와 공통 modified_mask를 함께 반영합니다. 값만 복원했다고 명시적인 수정 취소나 속성 초기화로 해석하지 않습니다. 모델 clone은 이 속성도 복사하며 다른 문단/원본과 독립입니다.

수정 후 길이 증가/복원 단계 모두 0x8000이 유지됐고 CFB를 재열어 다시 숫자를 편집해도 올바른 결과가 표시됐습니다. ReleaseSafe 제품 회귀 66개가 통과했습니다. 이는 한컴 GUI에서의 모든 field updateKind 동작이나 완전한 undo 이력 검증은 아닙니다.

`edit/formula_session_tests.zig`는 실제 chart의 공개 Session open/apply/save/reopen을 모든 할당 실패 위치에서 검사합니다. apply 실패에서는 셀 11.2·식 67.5와 byte-exact 원본 저장을 확인하고, save 실패에서는 이미 확정한 셀 12.2·식 68.5가 유지되는지 확인합니다. 성공 출력은 새 Session에서 다시 읽습니다. ReleaseSafe 집중 root 포함 2개가 통과했습니다. 이 공개 검사는 실제 Session의 DocInfo 리소스 개수를 사용하며 내부 draft 테스트의 임의 한도와 구분합니다.

최종 공개 거래·수정 이력·세션 실패 회귀를 포함한 ReleaseSafe 전체 Zig는 7/7 단계·2,705/2,705개·종료 코드 0으로 통과했습니다. Debug·ReleaseSafe·ReleaseFast 제품 편집 검사는 각각 66개, ReleaseSafe 제품 빌드는 5/5 단계가 통과했습니다. 포맷·문서 링크·문서 도구 반례 검사도 통과했으며 전체 편집 UI/수식 문법/조판 완료를 이 결과로 대신하지 않습니다.

표시 준비 단계의 거래 회귀는 숫자 셀·typed 결과·표시 68.5를 함께 준비합니다. 준비 후 거부 및 모든 할당 실패에서 원본을 유지하고 성공 때 함께 확정됩니다. 별도 123.45 변이는 길이가 달라진 토큰/글자 수와 원문 제어 보존, 원문에서 파생한 합성 range tag 42의 시작/끝 이동을 검사합니다. 당시 집중 실제 command root 포함 2개 및 일반 제품 편집 63개가 ReleaseSafe에서 통과했습니다. 이 내부 검사의 리소스 한도는 테스트 인수이며 공개 Session의 실제 DocInfo 검사와 구분합니다. 이후 Section 저장과 공개 연결은 위 결과를 따르며 모든 가능한 서식 경계의 독립 대조 완료를 주장하지 않습니다.
