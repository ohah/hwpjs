# HWPX 문자 글머리표 정의 생성·수정

HWP5의 같은 공개 명령은 [HWP5 글머리표 계약](hwp5-paragraph-bullets.md)을 따릅니다. 이 문서의 XML/parked-document 규칙은 HWPX 소유입니다.

`EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND`는 기존 전체 헤더 조회와 글머리표 적용 도구를 확장합니다. create/update와 명시적인 definition, apply를 받아 현재 문단 적용까지 단일 Native 이력으로 묶을 수 있습니다. 본문 참조를 추측하거나 JS ZIP/XML writer를 추가하지 않습니다.

## 정의와 공개 계약

문자 marker, LEFT/CENTER/RIGHT 정렬, useInstanceWidth, autoIndent, widthAdjust, PERCENT/HWPUNIT의 textOffsetType, textOffset, 기존 charShapeId가 필수입니다. charShapeId=0xffffffff는 본문 글자 모양 상속 sentinel입니다. marker는 지원 Unicode 문자 하나, widthAdjust/textOffset은 절댓값1000000 이하의 정수입니다. 새 글자 모양/폰트 선언은 만들지 않습니다.

create는 전체 현재 ID·count를 확인하고 max+1을 사용합니다. 선언 없는 헤더에는 공식 리소스 순서의 bullets group을 추가합니다. update는 같은 ID를 사용하는 모든 문단에 영향을 주며 ID·참조와 지정한8속성 밖의 원문·확장 속성을 보존합니다. apply=true는 현재 원본 일반 문단에 참조를 적용합니다. apply=false는 정의만 바꿉니다. 현재 token·selectionVersion·owner·typed 명령을 사용하며 experimental 우회는 거부합니다.

전체 조회는 기존 scope=current-header/coverage=complete를 유지하고 optional `definitionWriter:'character-definitions-v1'`와 각 선언의 nullable definition을 추가합니다. 구형 inventory 엔진의 조회는 계속 작동하되 새 writer는 AbiUnavailable로 반려합니다. 읽지 못한 geometry를 기본값으로 합성하지 않습니다. 중복/invalid ID·count 불일치·그림/체크·조건부/중첩 owner·미관측 geometry 수정은 거부합니다. 선언4096·요청4096바이트·기존 문서/출력/history 예산을 유지합니다.

## 저장과 이력의 책임

Native current Session의 기존 paragraph/character/font intent를 먼저 저장한 결과에 헤더 source patch를 준비하고, 기존 parked-document edge로 새 Session을 교환합니다. 준비가 모두 끝나기 전에는 live Session을 수정하지 않습니다. 정의 생성과 적용은 한 번의 undo로 복원됩니다. 동일 update/apply는 no-op으로 redo를 보존합니다. 보류 중인 생성 표의 identity를 park할 수 없는 경로는 반려합니다.

이는 드문 명시 리소스 명령의 전체 문서 저장·재열기 경계이며 키 입력 경로에 연결하지 않습니다. 전체 문서 이력 예산·상속된 저장 비용을 사용하므로 상수 비용 리소스 수정이라고 주장하지 않습니다. 정의 조회와 문단 적용은 [기존 목록 계약](paragraph-bullet-inventory.md), 공통 참조 writer는 [문단 글머리표 편집](paragraph-bullet-editing.md)을 따릅니다.

## UI와 남은 범위

기존 글머리표 대화상자에 문자·정렬·간격·너비·내어쓰기·기존 글자 모양을 추가합니다. 생성·수정 action은 footer에서 실행하고 기존 정의 수정의 전체 문서 영향을 안내합니다. 현재 Surface 입력 owner·modal·stale·IME·FIFO를 재사용합니다. 정의 없는 문서에서도 새 정의 생성·적용을 제공합니다.

그림/체크 글머리표, 새 font/char shape 생성, 번호 이어가기·재시작, 임의 중첩 owner는 후속 목표입니다. 이 기능의 문자 정의 범위를 전체 기안기 완료로 계산하지 않습니다.

## API 플레이그라운드와 파일 도구 연결

API 플레이그라운드는 Core의 전체 헤더 조회와 typed 정의 명령을 그대로 호출합니다. 명시 화면 좌표에서 현재 target을 발급하며 사용자가 제공한 selectionVersion을 유지해 오래된 요청을 거부합니다. query의 definitionWriter는 쓰기 ABI의 관측이며 선택 owner·읽기 전용 권한은 실제 명령에서 다시 검사합니다. 기존 누름틀·속성·Canvas 조회 callback을 유지합니다.

CLI apply와 MCP apply_document_changes는 공통 paragraph-bullet-definition 연산을 양 형식에 사용합니다. HWP5 리소스와 수치 범위는 [HWP5 계약](hwp5-paragraph-bullets.md)이 소유합니다. 주소는 기존 Native 원본 문단 좌표이며 화면 문단 번호와 다릅니다. 전체 batch의 writer capability를 검사해 구형 ABI를 거절하고, 지원하는 정의 연산이 있는 세션에 history V2를 활성화합니다. HWPX writer의 문서 park edge 등 형식별 Native 이력 계약에 필요한 준비이며 기존 연산만 있는 세션의 이력 정책은 바꾸지 않습니다. 독립 세션의 전체 실행·저장·종료 성공 뒤 기존 새 파일 게시 호스트를 재사용합니다. 실패 시 transient 세션을 닫고 결과를 게시하지 않는 파일 transaction이며 열린 UI 세션의 batch rollback을 약속하지 않습니다.

공개 사용 예제의 소유자는 Rspress의 api/editor.md·api/playground.mdx·guide/cli.md·guide/mcp.md입니다. 설명은 현재 GitHub 구현 기준이며 npm 게시 버전을 뜻하지 않습니다.

## 근거와 검증

공식 OWPML BulletType·ParaHeadType의 고정 revision `1453388472c703a4b299a0834f425cdac16644b9`에 있는 필드 관계와 자체 Native 소유 모델을 사용했습니다. [BulletType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/BulletType.cpp)·[ParaHeadType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Head/ParaHeadType.cpp). 외부 구현 코드를 채택하지 않았습니다. ID 배분·수치 한도는 제품 정책입니다.

Native 집중9개 entry에는 source writer의 전체 할당 실패 sweep·opaque 보존·모호한 ID/count·문서 edge 이력과 전체 transaction4998할당 중8경계 실패 주입이 포함됩니다. 전체 transaction4998지점 전수 sweep을 완료했다고 주장하지 않습니다. 결합 후보의 실제 HWP5 입력/이력·Worker40건, HWP5/HWPX 표·Core writer·필드 교차77건이 통과했습니다. old/new 조회9건과 old writer 불가를 포함한 SDK/Core6건을 별도 검사했습니다. 새 writer capability의 추가 필드는 실제 Native DTO의 기대값으로 검사하고 구형 조회와 혼동하지 않습니다.

`tests/hwpx/paragraph-bullet-definition-oracle.py`는 제품 파서를 import하지 않고 전체 헤더/본문 XML·주석/PI·리소스 순서/참조·기타 ZIP payload를 비교합니다. create+apply, update, pending 서식 위 create, 공유 ID update의4경로에 Python 일반/-O 정상·잘못된 marker 반례를 확인합니다. 캐시는 명시된 본문 적용 구역에서 기존 linesegarray의 제거만 허용하고 다른 노드·캐시 수정은 허용하지 않습니다. 최종 Native/JS/브라우저/배포는 `zig-out/verification/bullet-definition-delivery-r1`의 각 결과로 구분합니다.

최종 결합본은 SDK/Core·기존 표·필드 교차78건, inventory 호환9건, 실제 HWP5 Native/Worker 재사용40건과 필드 rebase434 할당 실패/latebatch4 entry를 통과했습니다. CLI strict는 신규 SDK 선언으로 드러난 기존 테두리 값 목록의 Set 제네릭 불일치를 정정한 뒤 통과했습니다. 런타임 허용 값과 공개 BorderLineStyle union은 변경하지 않았습니다.

최종 공개 후보의 Vanilla·React·Svelte3경로는 실제 파일 열기, 빈 목록에서 모양 입력, Escape 원본 보존, 정의 생성·적용, 한 번의 undo로 원본 복원과 redo, 정의 수정과 undo/redo, 저장본 GUI 재열기를 통과했습니다. 일반/-O 독립 XML·기타 ZIP payload 대조와 틀린 marker 반례를 각 생성/수정 저장본에 실행했습니다. 같은 manifest·Worker·WASM으로 검사했고 소유 브라우저·서버를 모두 종료했습니다. 이3경로를 이전 sidecar14시나리오와 중복 합산하지 않습니다. 정렬·단위는 한국어 설명으로 표시하며 저장 enum과 수치는 유지합니다. 모든 공식 UI의 표현·조판 동치는 후속 범위로 남습니다.
