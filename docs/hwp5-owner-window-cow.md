# HWP5 bounded owner-window COW 계약

이 문서는 exact d849 엔진의 검증된 subset에서만 내부 연속 splice 관측을 owner-window packet으로 전달하고 immutable 전체 문서 관측을 재구성하는 COW07 계약을 기록합니다. Native 모델이 문서·이력·저장의 단일 권위입니다. JS 관측 cache를 편집/저장 원본으로 사용하지 않습니다. [기존 full-snapshot exclusive·history 실증](hwp5-full-snapshot-exclusive.md)의 세대별 확정 범위는 유지하며, 새 선별 경로를 과거 결과에 소급하지 않습니다.

## 공개 full 계약과 내부 projection

| 경계 | 유지하는 계약 |
|---|---|
| 공개 Runtime.request(message, context) | 기존 full 응답. caller의 message 필드나 boolean으로 private projection을 켜지 않음 |
| 내부 canonical runtime admission | 적격 요청에 한해 owner-window-v1 전달 선호를 envelope로 전송 |
| core EditorState.content | 검증된 COW 결과로 전체 문단·자원 관측을 유지. 부분 packet을 전체 문서로 위장하지 않음 |
| 호환 CommandResult.reply | 부분 mutation reply를 설치된 전체 content로 교체한 full DTO. 공개 반환의 소유 복사 비용도 남음 |
| undo/redo 및 미지원 작업 | full Native display 유지. controller의 history-text 파생을 Native thin history 응답으로 오해하지 않음 |

내부 선호는 권위가 아닙니다. canonical runtime의 descriptor·admission, 실제 main module contract와 검증된 Worker code/witness를 통과해야 하며 core는 전후 context·sequence·revision·epoch·reference scope·receipt/window를 다시 대조합니다. custom workerFactory/workerURL, 변조된 request/dispose descriptor, unknown module/code/platform 및 임의 JSON receipt는 projection 권위를 얻지 못하고 full 경로를 사용합니다. Worker에 전송한 Module의 local WeakMap 미등록을 별도 brand 발급으로 우회하지 않습니다. Worker helper는 데이터 전달과 소유 관측만 담당하며 main의 실제 응답/기존 origin 검증을 대신하지 않습니다.

## exact d849와 bounded eligible subset

등록된 엔진 바이트 SHA256은 `d849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb`입니다. 다른 엔진·HWPX·모든 HWP5 문서에 자동 적용하지 않습니다. 기존 다른 known module의 full/기하 동작을 projection 지원과 혼동하지 않습니다.

적격 baseline은 core-owned immutable HWP5 전체 관측이어야 합니다. limited=false이고 실제 문단 수가 totalParagraphs와 같아야 하며 window/clipped view나 readonly 관측은 제외합니다. 명시 root/owner schema, 원 source-node/parent·flow·reference 매핑을 대조합니다. 현재 subset은 body/table_cell plain owner와 허용된 table/picture 주변 구조입니다. 이는 표셀 편집권한을 새로 발급한다는 뜻이 아닙니다. note/memo/caption/formula/field 등의 미지원 또는 미확인 종속성·unknown key/record는 full fallback이며, 문서에 임의 객체가 있어도 무조건 안전하다고 가정하지 않습니다.

대상 owner는 유일해야 하고 original reference·현재 scope/epoch와 일치해야 합니다. editable·잘 형성된 비어 있지 않은 plain text이며 제어문자/개체대체문자·sourceOffsets·미지원 자동번호/페이지제어 등을 허용하지 않습니다. packet의 totalUnits는 CR을 포함해1..4096, baseline 전체 visible text 합은100000 UTF-16 units 이하인 현재 검증 경계를 유지합니다. 빈 owner로의 전환 등은 full 경로입니다. 이 제한을 제거하거나 임의 target으로 바꿔 지원 숫자를 늘리지 않습니다.

## 관측 재구성과 실패 원자성

성공한 Native splice 뒤 receipt/runs·fresh reference·bounded window의 실제 결과를 읽습니다. core는 소유된 baseline에서 대상 text/ranges만 교체하고, 모든 행의 currentReference epoch를 새 Native epoch에 맞게 재생성하며 변하지 않은 자원/하위 관측을 구조 공유합니다. 기존 전체 delta 검증을 다시 통과해야 설치합니다. 다른 문단을 버리거나 선택 owner만 렌더하는 경로가 아닙니다.

이미 Native에 적용된 splice에서 packet 부재·검증실패·unknown thin 응답을 만나면 읽기 전용 full refresh로 관측을 회복합니다. 같은 mutation을 재접수하지 않습니다. refresh까지 실패하면 기존 committed-refresh-required/오류 경계를 유지하며 unapplied로 오분류하지 않습니다. public reply를 위해 복원하는 full DTO의 비용과 Native history/저장 원자성은 별도입니다.

## dirty preview와 명시 조회

fast splice가 전체 hwp5Display를 건너뛰면 private preview는 낡을 수 있습니다. COW07은 성공 packet 때 dirty를 표시하고 후속 window/full projection을 읽기 전에 Native currentTextPreview를 갱신합니다. 성공한 갱신 뒤에만 dirty를 해제합니다. projection 입력 생성도 지연시켜 stale preview를 먼저 소비하지 않도록 합니다. 허용 load/clear는 reset하지만 거부 load는 reset하지 않습니다.

원 source06의 fast splice 뒤 query-window/set-edit-window가 낡은 text를 돌려준 실제 Worker 반례2개와 수정 후2통과를 분리 보존합니다. fast splice의 preview 조회0과 후속 window read의 조회1을 Native 전체 query0으로 확대하지 않습니다. fast→query-window→full set-edit-window→formatting-capabilities→save에서 별도 full Worker DTO와 저장 CFB bytes 동치를 확인한 source 검사도 별도 범위입니다.

## 계수와 검증 범위

원 full-snapshot r1/r2의 resource query 생략0은 당시 경로에 대한 확정 결과입니다. 새 COW 선별 splice는 full display의 자원/header getter를 생략하므로 그 결과와 다릅니다. 기존 splice receipt/window 검증을 위한 추가5조회 계약도 없어졌다고 주장하지 않습니다. history helper의 r2→r3 추가조회0은 별도 비교입니다.

COW source07 기록의 한정 Reader 비교에서 full83→42, patch0→41, clone1494→838, 계량 복사 bytes19492260→11476696이며 Native mutation 호출 수는 같았습니다. 이는 해당 입력/명령 구간의 실제 계수이고 시간 성능이나 모든 호출의 최적화 비율이 아닙니다. undo40은 full 경로였고 명시 full 조회·public reply 복사도 남습니다. 전체 문단 eligibility/검증 및 행/reference 재생성은 O(P) 작업이므로 전체 typing/reflow O(1) 또는 O(n) 완료의 증거가 아닙니다.

source07의41검사는 Reader24·실 Node Worker data4·public 음성4·source flow3·Worker code 소유복사1·preview 수명2·조회/저장 chain1·exact scope2로 구분합니다. source pattern gate를 실제 Chrome Worker 권위 양성으로 대신하지 않습니다. 메인의 후속 Native8 강화 통과, 실제 SDK strict0, 공·사설 app149+30 완료는 별도 전달 근거이며 source07의41에 더하지 않습니다. declaration08은 타입/빌드 후속으로 구분합니다.

첫 Chrome 비교는 Noori paragraph15에서 각 방식별 A/B 한 번씩, 총4개를 실행했습니다. trusted 입력40·취소40·repeat39와 최종 text/caret·busy=false가 모두 통과했습니다. burst의 재입력→최종 관측은 A1996.0ms/B1317.8ms, 30Hz 취소에서는 A752.3ms/B113.3ms였습니다. 동일 low-timeline 계측 조건의 예비값이며 각1회 결과를 일반 성능 보장으로 확대하지 않습니다. 새 Worker 파일 지문은 확인했지만 private COW receipt/Native ACK는 직접 관측하지 않았습니다. 별도 독립 CFB oracle에서 B 저장2개의 예상 section·비대상12 stream·metadata가 일치했습니다. 16회 반복 검증과 운영 반영은 아직 진행 전/중입니다.

Node 실제 Worker 데이터 전달과 실제 browser main Worker admission은 같은 증거가 아닙니다. Native build 재현성은 기존 문서의 한계를 유지하며, 이 문서 갱신 자체가 새 Native/SDK build나 브라우저 실행은 아닙니다.

후속 Chrome ABBA는 paragraph4/15 × burst/30Hz × A/B 각2회, 총16개가 최종 통과했습니다. 재입력→최종 DOM/Canvas caret marker 관측은 burst에서 A1904.9..1999.8ms/B1285.9..1331.3ms, 30Hz에서 A705.0..739.0ms/B110.3..132.6ms였습니다. 이는 Noori 한 파일과 같은 브라우저·측정 조건의 결과이며 pixel 표시 시점이나 일반 HWPX 성능 보장이 아닙니다. Native ACK/private COW receipt는 직접 관측하지 않았습니다. 최종 text/caret·busy=false·trusted40/undo40/repeat39와 소유 브라우저 종료를 확인했습니다.

원 r1의14번째는 키 전송 전 CDP session/channel 오류로 중단돼 실패 기록을 보존했습니다. OS crash 직접 귀속은 미확정입니다. r1 성공13개를 재실행하지 않고 별도 r2에서 실패한14번과 미실행15/16번만 실행해 최종16개를 구성했습니다. 원 실패를 성공으로 덮어쓰거나 small4와 중복 합산하지 않습니다. B 저장4개는 원본에서 사전 계산한 전체 section326 record·비대상12 stream·metadata와 독립 CFB oracle로 대조해 통과했습니다. source commit `dde44e71a`의 JavaScript Quality CI도 성공했습니다. 운영 반영과 외부 HTTPS 확인은 이 로컬 결과와 별도입니다.

## 증거 식별과 문서 수명

source07 제품 명세는 로컬 `zig-out/verification/native-owner-window-worker-r1/candidate/PRODUCT-IMMUTABLE-07.json`이며 선택13=변경10+미변경 Worker 의존3입니다. 그 인계서의 sdkBuilds0/browserRuns0은 원 source 검증 시점의 기록으로 보존하고 후속 main build 성공으로 덮어쓰지 않습니다. ignored packet은 source-only clone에 포함되지 않으므로 이 문서만으로 같은 실행 준비가 완료됐다고 보지 않습니다. 정확 지문·원 계수·한계는 해당 세대의 불변 명세와 인계서가 소유합니다.
