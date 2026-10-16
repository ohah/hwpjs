# 생성 표와 원본 필드 라벨 편집

## 2026-10-16 누락된 라벨 ABI의 범위 권한 우회

180파일 감사의 `table-creation-worker` 실패를 main 복원 후보 `9d935e8b…`와 기본 `cbaaf27f…`에서 모두 재현했습니다. `created_table_field_label_mode` export를 제거하면 표시 라벨은 잠기지만 Worker의 범위 조회·일반/서식 입력은 `fieldRangeTarget`을 직접 호출해 이 제한을 우회했습니다. native 파서/필드 좌표 문제가 아니라 Worker 권한 연결 문제입니다.

`web/preview/hwpx-field-range-target.mjs`가 pending 표의 라벨 capability를 확인한 뒤 기존 native 범위 조회를 호출하며 Worker의 세 경로가 공유합니다. 필드 위치를 JS에서 다시 계산하거나 문단 전체 권한을 부여하지 않습니다. 원본 XML의 직접 텍스트를 Python 일반/-O로 독립 계수하면 필드 시작은7이고 prefix5유닛 입력 후12입니다. 계약상 시작 경계도 명시적 라벨 affinity가 필요하므로 ABI 부재 시11은 허용,12와13은 거부해야 합니다. 최초 조사에서12를 일반 exterior로 해석한 판단은 틀렸으며 원래 테스트의 잠금 기대를 완화하지 않습니다.

검사는 라벨 ABI 없는 실제 입력 거부 후 저장 바이트·이력 revision 보존까지 포함합니다. `table-creation-worker` 전체와 새 공통 판정 반례는 후보11/11·exit0(11.922초), 기본11/11·exit0(10.967초), skip0·stderr0입니다(`/tmp/hwpjs-runless-fix.70e4a3/table-label-final-{candidate,default}.log`). 정상 ABI 라벨·누락된 host ABI·생성 표/셀·수식/도형·이력 회귀를 포함하고 두 묶음을22개 고유 사례로 합산하지 않습니다. 두 테스트 파일을 정규 hwpx-text-audit에 등록합니다. JS syntax 검사도 통과했습니다. native/WASM 변경이나 기본 제품 교체는 없으며 전체 공개 묶음·실제 브라우저 조판은 이번 결과와 별개입니다.

## 2026-10-16 생성 표의 저장 전후 필드 좌표 검증

180파일 감사의 created-table-field-exterior 실패는 재열기 뒤 start13과 저장 전 start12의 단순 동일성 기대에서 발생했습니다. 기본 `cbaaf27f…`와 조립 후보 모두 재현됐지만, 후속 조사에서 문서 내용 손실로 확정하지 않았습니다. 생성 표가 pending registry에 있을 때 필드 명령은 기존 본문 좌표를 사용하고, 저장본을 다시 열면 표가 원본 객체1단위로 투영됩니다. 이 실제 사례는 start/end12/40→13/41, beginElement53→71이며 재열기 후 descriptor를 다시 조회해야 합니다.

단순 값 동등성 기대를 제거하는 대신 독립 ZIP/XML에서 같은 host에 원본 표1개가 생겼음을 확인하고 start/end가 각각 정확히1 이동하는지 검사합니다. 같은 필드 prefix 입력을 pending 상태와 재열기 상태에서 각각 실행하면 전체 저장 바이트가 같아야 합니다. 원본 XML에서 별도로 구한 beginId1528818376/paragraph2를 기준으로 Python normal/-O가 정확한 필드 변경과 비대상 XML/ZIP 보존을 검증하며 잘못된 본문 기대값은 두 모드 모두 거부합니다. 기존 외부 prefix·내부 범위 거부·undo/redo·no-op 재열기 검사는 유지합니다. 제품 코드나 저장 정책은 바꾸지 않았습니다.

main 기반 격리 source의 후보 `488d7e6c…`1/1·411.7175ms·exit0, 같은 source의 기본 `cbaaf27f…`1/1·406.452584ms·exit0입니다. 실제 작업 트리에서 기존 미게시 서식/순서 사례까지 보존한 전체 파일도4/4·3210.579542ms·exit0이나 그 추가3사례는 이번 게시에 포함하지 않습니다. 최초 추가 과정에서 중복된 같은 이름 테스트는 제거하고 원래 사례를 수정했습니다. 현재 필드 편집의 두 표현 동치를 확인한 한 사례이며 모든 좌표/구조 편집·UI·원본 조판 완료나 진행 중인 전체180파일 결과의 소급 통과는 아닙니다.

검증한 깨끗한 후보의 기본/외부 WASM 반영은 완료했습니다. 현재 산출물·백업·외부 해시·반영 후 결과는 [승격 기록](hwpx-table-creation-promotion.md)이 소유하며 아래 각 검증 당시 미반영 문장은 과거 상태입니다.

## 소유권·거래

원본 source 필드 라벨 명령은 기존 field_label_session의 종류/소유권/범위 검증을 유지합니다. 생성 표가 있는 경우 created_table_host_splice의 공통 거래를 재사용합니다. 추가 begin-element 인자는 applyWithArguments로 전달하며 별도의 표 위치 이동·checkpoint 구현을 만들지 않습니다. 같은 문단의 생성 표 anchor를 UTF-16 변경으로 재배치하고 라벨 text/dirty·registry·저장본 수식 검증까지 성공해야 커밋합니다. 실패와 no-op은 전체 checkpoint를 복원합니다.

supportsFieldLabelMode는 현재 원본 flat section만 허용합니다. 구조 편집된 field_positions/protected/joined section은 아직 거부하며, source 필드 라벨 종류/범위 권한은 기존 getter/setter가 계속 판정합니다. mode 조회만으로 모든 필드 종류를 편집 가능으로 간주하지 않습니다.

## API·표시

선택적 hwpx_edit_created_table_field_label_mode(section)는0/1/오류2입니다. JS createdTableFieldLabelMode(section)는 open/uint 검증을 수행하고 구형 ABI가 없으면 false를 반환합니다. Worker의 생성 표 projection은 mode가 true일 때만 기존 원본 fieldLabels를 유지하며 구조 split/merge 제한은 계속 유지합니다. generated cell identity와 source paragraph/begin-element 주소는 합치지 않습니다. native 값이 저장 SSOT이고 fieldLabels는 파생 권한 descriptor입니다.

## 현재 검증

후속 실제 Chromium에서 깨끗한6a25125e 후보로 issue144를 열고3문단 로딩/편집 활성화를 기다린 뒤 gmaile의 unit5에 기본2×2표를 생성했습니다. 라벨 시작에 라벨😀<&를 입력하고 실제 다운로드 후7문단 로딩 완료를 기다려 다시 열었습니다. 정확한 textarea 값 라벨😀<&gmaile와 오류 조회 공백을 확인했고 소유 브라우저를 종료했습니다. 실제 다운로드본은 동일 표 생성 baseline과 Python 일반/-O의 전체 필드 XML·dirty·비대상 ZIP/메타데이터/CRC로 추가 대조했으며 native 재열기에서도 start0/end10을 확인했습니다. 파일과 screenshots/field-edited.png·field-reopened.png는 `/tmp/hwpjs-field-label-release.vK577D/qa/`에 있습니다. 실제 OS IME·전수 GUI·구조 필드·원본 조판을 검증한 것은 아닙니다. 기본 데모 승격은 아직 실행하지 않았습니다.

게시7d454b83d5e9e5be8accc83530a51cb2905c965c만 Git archive로 추출한 `/tmp/hwpjs-field-label-release.vK577D`에서 추적/index diff가 없는 상태로 ReleaseSafe build exit0을 확인했습니다. 깨끗한 WASM SHA256은6a25125e797c7f2501476ba5ddb3a1e45700be6707bf6b6a14daec0849f31faa입니다. native 라벨/구조 보호/plain4/4·exit0, 공개/Worker/Canvas/projection18/18·exit0(12754.236833ms), 기존 HWPX-text34/34·exit0(44730.097417ms), 문서당 한 host44/44·exit0입니다. HWP5 실행 요약이 출력 한도에 잘려 같은 산출물로 전체 HWP5-editor를 재실행했고312/312·exit0(3207.837292ms)을 직접 확인했습니다. 재실행 후 산출물 해시와 추적/index 불변도 재확인했습니다.

이 후보의 실제 브라우저·다운로드/재열기와 기본 데모 승격은 아직 미완료입니다. 위 통과를 원본 조판이나 전체 parser/editor 완료로 확대하지 않습니다.

후보 SHA256 de1f7fe2a902546b6c09c2b296d98f99f05917861346c3e2d753542c3fb70e78의 ReleaseSafe build/fmt/diff exit0, native 라벨 거래/기존 plain 회귀3/3·exit0입니다. 실제 issue144의 교차 필드 뒤에 표를 넣은 뒤 emoji 라벨 입력으로 anchor5→7, XML NUL 거부/저장 전체 바이트 복원과 undo/redo를 검사했습니다.

공개 라벨/field exterior/plain3/3·exit0(434.47725ms), Worker/Canvas/projection13/13·exit0(11581.28ms)을 확인했습니다. 실제 두 필드 파일의7라벨 fragment도 각각 생성 표와 함께 Python 일반/-O로 전체 XML·dirty·비대상 ZIP/메타데이터/CRC, undo/redo·XML 오류 후 redo·재열기를 대조했습니다. native 주소와 저장 후 늘어난 문단 주소는 독립 inventory의 field ID/fragment 순서로 구분합니다.

전체 open/prepare/stage/라벨 명령 할당 실패를 순회한 추가 검사는2/2(root 포함)·exit0으로 완료했습니다. source label 실패 뒤 비실패 allocator의 readonly borrowed view로 저장 전체 바이트·anchor5 복원을 검사하며 borrowed owner는 해제하지 않습니다. 성공 시 anchor7/원본 불변을 검사합니다. 공통 helper의 모든 실패 지점/누수 검사를 생략하지 않았습니다.

후속 공개 검사2/2·exit0(1486.30475ms)은 실제7fragment와 no-op/잘못된 field element/필드 범위 초과/표 crossing/XML NUL 거부 뒤 정확한 바이트·anchor5와 redo를 함께 확인했습니다. 독립 검사기의 self-test도 Python 일반/-O 모두 exit0으로 UTF16 삽입/치환/삭제와 dirty/서식/주변 XML/ZIP 변조 거부를 재확인했습니다. 구조 편집된 문단의 mode 거부2/2·exit0도 확인했습니다. 실제 브라우저·구조 필드·표와 모든 필드 명령·원본 조판은 검증/구현이 남습니다. 기본 데모 WASM은 아직 이전 검증본입니다.
