# HWP5 계산식 command 분리

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
