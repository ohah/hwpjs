# 공개 본문 표 삽입 명령 후보

`INSERT_TABLE_COMMAND`는 기존 Native 표 생성에 연결한 typed 공개 명령입니다. 본문 caret에서 현재 관측의 자원을 사용해 표를 삽입합니다.

payload는 `{target, options}`이고 options는 `rows`, `columns`, `width`, `rowHeight`, `resources`를 명시합니다. 크기는 기존 Native HWPUNIT 양의 정수이며 CSS px가 아닙니다. resources는 현재 관측의 `tableCreationResources`에 존재하는 paragraph/character/style/border_fill ID만 받습니다. 새 ID·정책 flag·Native 참조·table identity를 caller가 발급하지 않습니다. 0/음수/비정수/u32 초과·전체높이 overflow·100000셀 초과·열 개수보다 좁은 폭·미확인 자원을 거부합니다. 포맷별 추가 제한과 원 Native 오류는 그대로입니다.

현재 공개 `createParagraphSelection`과 token/owner validator를 재사용합니다. 이 기존 facade에는 별도 객체 브랜드가 없으므로 새 brand/issuer를 만들지 않습니다. 본문 owner의 접힌 caret·현재 문서/세대/operation/view token·편집권한·서로게이트 경계만 허용합니다. note·표셀·drawing·clipped·미지원 생성 원본참조는 거부합니다. HWP5는 기존 display→source mapper와 원original ref guard를 쓰며 id를 paragraph ordinal로 바꾸지 않습니다. HWPX+1은 기존 reader-runtime에서 한 번만 수행합니다. 원본 각주 선택의 범위는 [기존 각주 헤드리스 선택](headless-existing-note-selection.md)을 따릅니다.

기존 queue/copyOwned/mutate와 Native 단일 history stage를 사용합니다. 단일 성공 뒤 한 번 undo로 원본 bytes,한 번 redo로 편집 bytes가 복원됐습니다. 이 성공 검증을 새 OOM 전수검증으로 확대하지 않습니다. 적용 뒤 projection 실패는 committed-refresh-required이고 거부로 오분류하지 않는 모델 회귀를 포함합니다. 새 table/cell 자동 선택·병합·분할·새표 셀 편집 UI는 제공하지 않습니다. 기존 Worker origin/admission/runtime wire/metadata는 변경하지 않습니다.

동결된 d849와 알려진 footnote-endnote 두 포맷에서 공식 Bun1.4.4 source 경로로 실제 명령→현재 생성표 관측→저장→stale거부→undo원본bytes→redo편집bytes→재열기 원본표 관측→readonly거부를 검사했습니다. 최종18개는 모델16과 실Native2이며 각각 원로그로 구분합니다. 처음 null selection 가정 실패와 타입 검사 하네스 오류·원XML 기대 오류는 보존합니다.

독립 HWP5 oracle4는 기존 CFB/text-record/line-mask SSOT로 원본·단일표 요청에서 전체 raw Section을 구성하고9스트림·비대상 각주/미주 bytes를 대조했습니다. 독립 HWPX oracle8은 stdlib ZIP/XML로11멤버 집합·10비대상 멤버 bytes·원본 전체 XML tree와 생성표 전체 속성/자식,원스타일 후행 빈 terminal run을 검사했습니다. 변경 host 문단의 직접 linecache만 폐기 대상으로 두고 각주/미주의 cache와 서식은 보존 비교합니다. 최종 저장 파일은 해당 oracle 입력과 전체 bytes가 같음을 별도로 고정했습니다.

strict TypeScript7.0.2에서 제품·공개 소비자·시험2의 양성0오류와 rows 문자열/raw reference/forged identity 음성 TS2322·TS2353·TS2353을 확인했습니다. 선택 source6+시험2 lint/fmt8은 통과했습니다. 공식 root lib 정책과 provider를 재사용했으며 새 DOM/polyfill을 추가하지 않았습니다. RN 실제 실행·실Worker·공식packed 소비자·브라우저 UI·새 SDK 배포는 미검증입니다. 현재 demo insert-table UI의 연결 완료로 주장하지 않습니다.

작업 트리의 명시 source 검사에서 모델 16개·표 삽입 Native 2개·기존 각주 선택 20개를 함께 실행해 38개가 실패 없이 통과했습니다. 별도 교차 검사에서는 HWP5 각주·미주 target 4개가 표 삽입을 거부하고 관측·이력·저장 바이트를 유지했습니다. 기본 core suite에는 모델 검사만 포함하며 Native 진입점은 `packages/core/integration/commands/table-insert.test.ts`입니다. 명시 환경과 실행 명령은 [개발·검증 명령](development-commands.md#본문-caret-표-삽입-명령-검증)을 따릅니다. 필수 입력 부재는 skip하지 않고 실패합니다.
