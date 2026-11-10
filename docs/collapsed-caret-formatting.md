# 커서 위치의 서식 관측과 다음 입력

이 문서는 접힌 커서의 읽기 관측과 다음 입력 의도를 구분합니다. 범위 서식의 기존 원자 명령과 선택 수명은 [서식 대화상자](formatting-dialogs.md)를 따릅니다.

## 읽기와 쓰기 분리

접힌 커서는 실제 길이0 target을 유지합니다. Core readonly 서식 관측은 정본 `typingSourceSpan`을 사용하지만 문서 서식을 쓰기 위한 가짜 비어 있지 않은 범위를 만들지 않습니다. 기존 길이0 Core 쓰기 명령은 계속 거부합니다. 조회 항목은 일곱 언어 글꼴·크기·굵게·기울임·글자 색·밑줄·취소선입니다. 빈 원문에서 원본 run을 추정하지 않고 unknown을 유지하며, 명시적인 입력 대기 속성만 표시할 수 있습니다.

Surface의 `mode: 'typing'` 캡처는 현재 위치의 관측, 가용성, 수명 검증을 담당합니다. 지원하는 본문에서 크기·굵게·기울임·밑줄·취소선·글자색·언어별 글꼴을 다음 입력에 지정할 수 있습니다. 대표 글꼴을 선택하면 7개 언어의 글꼴을 함께 지정합니다. 선택만 바꾼 상태에서는 문서와 이력이 그대로 유지됩니다. 입력하면 Native가 새 글자와 서식을 한 번에 적용해 한 항목으로 실행 취소할 수 있습니다.

HWP5의 일반 원본·생성 본문과 HWPX의 편집 가능한 일반 본문이 대상입니다. 생성 셀, 글상자, 필드와 개행을 포함한 서식 입력은 지원 범위 밖입니다. 구형 WASM에서는 크기·굵게·기울임·단일 언어 글꼴의 기존 입력 경로를 사용합니다. 각 문서의 포맷과 버전에 없는 서식 필드는 Native에서 거부합니다.

## 수명과 화면 복귀

관측 이후 문서·Core state·현재 Canvas caret·모달·dispose를 다시 확인하고 stale 캡처를 새 위치에 적용하지 않습니다. 입력 의도 설정 뒤 앱이 caret이나 포커스를 임의로 복구하지 않으며, 명령 결과·문서 상태를 별도 UI 모델로 복제하지 않습니다. 실제 위치 이동·입력·undo와 UI 일관성은 아래 후보별 근거와 남은 한계를 구분합니다.

## 비용과 검증 경계

앱의 `getSelectionFormatting` 한 번과 Surface 내부 관측 한 번으로 같은 immutable state에서 최대 두 readonly scan이 있습니다. 고정 필드 수에서 기존 위치 index·캡처 단위 리소스 Map을 재사용하는 O(n) 경로이며 새 global WeakMap cache는 없습니다. 기존 state.content를 읽고 새 Native header/query getter 경로를 추가하지 않는다는 소스 근거이지 실제 중복 조회 비용·입력 성능의 측정이나 전체 조판 O(n) 증명은 아닙니다.

Surface 집중18, 품질6파일, strict242파일, 독립 읽기와 앱 기존107은 서로 다른 범위이므로 합산하지 않습니다. 집중 검사는 실제 Surface/Canvas 코드와 통제 Core 응답·renderer 및 source readonly 관측을 사용했습니다. 공식 새 SDK·실 Native·픽셀 검증으로 승계하지 않습니다. 최초 인계 당시 정규 시험2는 적용 대기였고 후속 메인 영수증은 루트 통합을 기록합니다. 이 소스 통제 시험과 후속 실제 E2E는 다른 근거이며, 운영 배포 검증은 별도입니다.

## 현재 후보의 실제 확인과 남은 경계

A1 HWP5 첫 8278 후보는 원래 일곱 글꼴·크기 조회와 latin 입력 대기·textarea 복귀를 확인했으나 초기 굵게/기울임 비활성과 같은15 크기 적용 뒤 버튼에 남는 포커스를 발견했습니다. 원실패를 보존한 뒤 pointerup 표시 재조회와 앱 no-op focus를 최소 수정했습니다. A1R2에서는 초기 글꼴·크기·굵게·기울임 활성, 같은15 no-op 뒤 textarea와 원문 불변, latin 굴림·16pt·굵게/기울임 입력 대기 및 ABC·Enter·DEF 입력 proxy를 확인했습니다. 이후 역방향 선택3:0을0:3으로만 기대한 하네스 전제로 중단돼 모달 source·undo/redo 전체 성공을 주장하지 않습니다.

별도 같은 SDK/EDE의 실제 입력 probe에서 생성 DEF 문단 0..3은 charShape58·높이1600·굵게true·기울임true와 글꼴 리소스를 보유했습니다. 그때 old public API는 writer의 `UnsupportedFormattingReference` 때문에 글자·문단 관측을 null로 가렸습니다. 명시 paragraphShape.id35·alignment0은 기존 매핑의 JUSTIFY이며 기본값 추정이 아닙니다. 별도 paraShapeId 필드와 문단 header 리소스 배열은 미수집이므로 부재나 같은 ID로 단정하지 않습니다. 이 근거는 생성문단의 공개 서식 writer 허용이나 범용 Native 권한의 증명이 아닙니다. probe의 undo/redo·저장·HWPX도 미검증입니다.

유효 source span의 readonly 관측은 writer 가용성과 분리합니다. 현재 원본·생성·missingRef·createdCell 자료라도 기존 선택·소유권·범위·UTF-16/span·리소스 검증을 통과하면 관측값을 읽습니다. 알려진 `paragraphShape.alignment`는 기존 정본의 정렬 enum으로 조회하고, 미지 값이나 잘못된 자료는 추정 기본값으로 채우지 않습니다. 색·밑줄·취소선 등 관측 가능 여부를 해당 쓰기 명령의 가용성으로 대신하지 않습니다.

이 읽기 지원은 생성문단 공개 서식 쓰기나 Native 범용 권한을 발급하지 않습니다. OriginalRef·formatting writer·selection 세 검사의 파일 핀은 불변이며 생성문단 직접 writer와 길이0 쓰기 거부를 유지합니다. 생성 셀의 전용 입력 경로도 이 관측 API가 대신하지 않습니다.

최종 자체 입력 폐쇄의 소스53건이 모두 통과했고 실패·skip0으로 확인됐습니다. 이전52통과·1실패는 새 시험의 writer 거부 사유 기대가 실제 ReadOnlyDocument와 달랐던 기록으로 보존합니다. 이를 최종 성공으로 소급하지 않으며 과거 선택44·앱107·타입 검사와 합산하지 않습니다. 후속 실제 HWP5/HWPX의 생성 readonly 표시와 알려진 문단 정렬 관측은 아래 형식별 한정 근거로 확인했습니다. Native 실제 DEF 필드 근거와 후보 source53 성공을 한 실행으로 혼합하지 않습니다.

QA04f는 당시34소스 검증 cohort이며 뒤의 소스 통합·QA는 별도 세대입니다. 후보 E2E 확인을 실제 운영 배포 검증으로 승계하지 않습니다.

## 실제 HWP5·HWPX 입력과 원상 복원

각 한 문서의 별도 cohort에서 초기 글꼴·크기·굵게·기울임 활성과 같은15pt no-op 뒤 textarea 복귀, 16pt·latin 굴림·굵게/기울임true 입력 대기를 확인했습니다. 대기 설정만으로 원문이나 이력 버튼 상태가 편집된 것으로 바뀌지 않았고 ABC·Enter·DEF 실제 입력 뒤 양 문단의 source GUI 값을 확인했습니다. latin만 굴림이고 다른 여섯 글꼴은 원값을 유지했습니다.

HWP5 생성 DEF는16pt·굵게/기울임true·JUSTIFY를 표시하면서 UnsupportedFormattingReference로 쓰기가 비활성이었습니다. HWPX의 ABC·DEF는 해당 도구가 활성으로 관측됐습니다. 두 형식의 실제 owner/profile 차이를 동일한 생성 writer 정책으로 일반화하지 않습니다.

redo는 undo 직전 ABC의 역방향 선택을 복원하는 기존 정책에 맞춰 같은 문단끼리 비교했고, 정상 키 이동으로 DEF 본문과 caret3도 확인했습니다. 이어 각 실행에서 관측한 일곱 번의 undo로 원문 proxy·원caret·원15pt·굵게/기울임false·일곱 원글꼴을 복원했습니다. 일곱 동작을 모든 문서의 고정 이력 수나 Native entry 수 직접 조회로 해석하지 않습니다. 원래 하네스의 방향·다른 문단 proxy 기대 오류와 원실패는 보존하고, 의미 비교 helper의 음성3 검사는 실제 브라우저 성과와 합산하지 않습니다.

다른 caret 이동에 따른 입력 의도 reset, 저장·다운로드·재열기·원본 파일 전체 바이트 동치와 모든 문서의 입력 상속은 이 cohort에서 검증하지 않았습니다. 최종 소유 Chrome 종료·PS 빈 목록은 기능 근거와 별도로 확인했습니다. QA 후보의 실제 기능 확인과 운영·공개 배포 검증은 별개입니다.

## 완료 결과와 포커스 수명

Core 단일 명령은 오류 없는 committed-with-snapshot 또는 known-no-op 결과에서만 포커스 복귀를 고려합니다. status/result callback 뒤에도 editor의 정확한 result.state와 캡처했던 현재 host가 같고 도구가 dispose되지 않았는지 재확인해 기존 focus 경로를 한 번 요청합니다. 모달과 Surface 캡처는 자신의 modal lease·현재 선택·문서·상태를 스스로 검사하며 앱의 단순 nonnull 선택으로 이를 우회하지 않습니다. 외부 callback·dispose·host 교체로 현재성이 사라지면 포커스를 돌리지 않습니다. 이 규칙은 Native ACK나 새 저장 권한을 발급하지 않습니다.
