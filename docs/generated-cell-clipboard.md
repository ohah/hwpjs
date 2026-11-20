# 생성 셀 선택의 클립보드 계약

생성 셀의 선택은 원본 문단 `SelectionTarget`으로 변환하지 않습니다. 현재 Canvas 선택의 UTF-16 범위와 Native canonical 셀의 같은 텍스트 축·Native owner·geometry를 확인한 읽기 캡처만 공용 clipboard bridge에 연결합니다. 복사는 읽기 권한이며 편집 가능성·managed history·typing scope·서식 자원을 요구하지 않고 편집 권한도 발급하지 않습니다. 기존 쓰기 관측과 편집 가드는 변경하지 않습니다. 같은 owner의 현재 본문을 확인하지 못하거나 선택에 개체 마커가 있으면 거부합니다.

읽기 캡처는 한 번만 소비합니다. lease·현재 문서/state/token·modal·포커스·입력/이력 pending·Native 관측·선택 변경 뒤에는 실행하지 않습니다. 클립보드 API 거부도 원 선택을 삭제하지 않습니다. 기존 다문단·원본 단일 문단 경로를 유지하며 생성 셀을 가짜 문단으로 승격하지 않습니다.

오려두기 가용성은 현재 셀의 쓰기 owner·typing scope·관리 이력과 복구 상태를 검사합니다. 이를 확인할 수 없으면 버튼을 미리 비활성화하며 Native target 조회나 클립보드 쓰기를 시작하지 않습니다. 이 쓰기 조건은 복사 가용성에 적용하지 않습니다.

오려두기는 쓰기 가능한 문서에서 현재 `getCreatedCellTextTarget`으로 branded target을 새로 발급받고 전체 본문·UTF-16 범위를 대조합니다. 표 identity는 현재 Native 관측만 사용합니다. 클립보드 쓰기 뒤 현재성을 다시 확인하고 정규 `SPLICE_TEXT_COMMAND`에 빈 문자열을 전달합니다. 기존 Core FIFO·Native 거래·이력 경로의 단일 명령이며 별도 Native ABI나 전체 셀 교체로 우회하지 않습니다. 불확실한 반영·거부·오류에 자동 재시도하지 않습니다.

기존 정규 SDK에서 H5/HX 선택 `abc`의 복사 버튼이 비활성인 실제 첫 실패는 보존합니다. 그 코호트에서 capture 신뢰 Meta 반복 취소·복원은 확인됐으나 복사 성공은 미완료입니다. 이 소스 후속의 통제 시험은 실제 Canvas/Surface/clipboard bridge와 Core 응답을 사용합니다. 새 정규 SDK·Native 실제 cut 이력·저장 및 수정 후 GUI 검증은 아직 수행하지 않았으며 공개 배포 완료를 뜻하지 않습니다. 기존 context-loss·OS IME·범위 서식의 별도 제한도 그대로입니다.

## 전송 실패와 결과 보고

공용 Surface 전송의 bool 결과는 유지합니다. 요청별 선택적인 onStatus/onResult 관찰로 상세 실패를 bridge에 전달하며, bridge는 상세 상태를 generic SurfaceClipboardNotApplied로 덮지 않고 한 번만 표시합니다. 실제 clipboard write의 NotAllowedError/SecurityError는 ClipboardWritePermissionDenied, target 조회 전후 current 실패 및 target 본문/범위 불일치는 별도 오류입니다. 실제 Core 명령이 수행됐을 때만 원 CommandResult 객체를 관찰자에 전달하고 error/status를 그대로 표시합니다. 사전 거부를 Core 결과로 만들어내지 않으며 observer 오류로 Native 결과를 뒤집거나 편집을 재전송하지 않습니다.

클립보드 쓰기를 거부하도록 설정한 최초 HX GUI에서 저장 전체 바이트 불변은 확인했으나, 최종 generic 메시지만으로 실제 write 호출 여부와 거부 지점은 분리하지 못했습니다. H5의 clipboard read는 관측 시 read permission denied였고 page/context/textarea 활성은 유지됐습니다. 권한 전환 시점은 미확정입니다. 수정 후 정상 SDK/GUI에서 같은 CDP 연결의 권한 확인과 public output mutation 관찰로 다시 검증해야 합니다. 이 소스 수정이나 통제 회귀만으로 positive cut·이력·LF·readonly·cold가 완료됐다고 주장하지 않습니다.

## 오려두기 뒤 현재 셀 입력 복원

정규 Core 생성셀 splice는 새 본문과 operationRevision을 설치하면서 기존 선택을 비웁니다. Surface의 외부 snapshot 처리는 Canvas 입력을 초기화하므로 clipboard 경로도 입력 ACK와 같은 본문·Native owner/scope·UTF-16 경계 검증을 공유해야 합니다. 복구는 성공한 원 명령의 정확한 현재 snapshot과 해당 snapshot이 수행한 private reset 관측에만 연결합니다. 현재 lease·문서·모달·이력·공식 paint·기하를 다시 확인한 뒤 cut 시작점의 collapsed caret을 Canvas 내부 입력 복구 경로로 표시합니다. 새 Core SelectionTarget이나 가짜 source 문단을 만들지 않습니다.

거부·불확실 반영·다른 문서·선택 변경·재진입·foreign focus·실제 window blur·현재 아닌 paint/기하는 복구하지 않습니다. Native 삭제 결과는 원 CommandResult로 보존하며 caret 복구를 확인하지 못하면 CreatedCellClipboardCaretUnavailable를 별도로 보고하고 명령을 재전송하지 않습니다. 복사는 기존 읽기 전용 경로를 그대로 사용합니다.

앞선 정규 GUI에서 H5R/HX 모두 실제 emoji clipboard, 상세 쓰기 권한 거부와 선택·본문·전체 저장 바이트 불변, 성공 cut의 독립 저장 본문을 확인했습니다. 성공 뒤 입력 비활성 결함은 그대로 보존합니다. 이 소스 후속의 통제 시험과 수정 후 정규 SDK/GUI·undo/redo·cold 증거는 구분합니다. readonly/LF 실제 GUI는 아직 0분모입니다.

## 원본 셀의 읽기 전용 선택과 복사

정규 `editor.load(bytes, { format: 'hwpx', editable: false })`로 연 원본 셀도 현재 source 문단의 탐색·Shift 선택·복사를 허용합니다. 복사는 기존 Core의 단일 문단 선택/클립보드 경로를 사용하며 생성셀 전용 캡처로 재해석하지 않습니다. 쓰기 권한과 managed history가 없어도 읽기 복사를 할 수 있어야 하고 입력·붙여넣기·오려두기는 기존 readonly 가드로 거부합니다.

Surface의 ready는 활성 문서/lease를 뜻하며 쓰기 권한을 뜻하지 않습니다. readonly 문서의 편집·분할 가능 범위 조회는 현재 Core state의 기존 `rangeWritable` 판정으로 발행하지 않습니다. 불필요한 조회의 bridge pending 때문에 직후 방향키가 소실되는 것을 막되, 실제 쓰기 문서의 부분 편집 조회 및 pending 차단은 유지합니다. 이 판정은 최초 render의 기존 선택 복원보다 먼저 초기화합니다. 다른 문서/generation으로 readonly reload할 때는 이전 Canvas 선택·쓰기 범위 관측을 재사용하지 않고 새 문서의 현재 선택을 따릅니다.

이 후속의 통제 회귀는 실제 Surface·Canvas·bridge와 통제 Core/renderer를 사용합니다. 이미 선택한 상태의 mount, 쓰기→새 readonly 문서 reload, UTF-16 emoji 선택/복사와 cut 거부를 검사하며 과거 브라우저 내부 query trace나 수정 후 정규 SDK/GUI 완료 증거가 아닙니다. 기존 readonly GUI의 선택0..0 첫 실패는 보존하며, 동일 자기 HWPX를 이용한 수정 후 실제 GUI 확인은 별도 단계입니다.
