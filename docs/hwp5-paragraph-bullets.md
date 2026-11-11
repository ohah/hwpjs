# HWP5 문자 글머리표 조회·편집

공개 `listParagraphBulletDefinitions()` 및 `EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND`, `APPLY_FORMATTING_PATCH_COMMAND`의 `paragraph.bullet`를 HWP5에도 연결한다. Native optional ABI는 `hwp5_edit_bullet_definitions`, `hwp5_edit_bullet_definition_write`이다. 구형 ABI에 추정 목록이나 반복 setter fallback을 제공하지 않는다. 모양 DTO와 scalar 정책은 공통 model로 추출했고 HWPX source owner/parser/save/history는 HWP5에 복제하지 않았다.

HWP5 source는 DocInfo BULLET 순번 + 1을 ID로 사용한다. 전체 실제 count와 ID_MAPPINGS bullet/char_shape count를 확인한다. 선언 4096개/요청4096bytes/DocInfo32MiB의 경계를 유지하고 초과는 전체 거부한다. BMP WCHAR 및 signed HWPUNIT16로 표현할 수 없는 값은 Native에서 거부한다. 빈 목록과 optional ABI 부재는 다르다.

기존 bullet 정의 수정은 id/record framing/byte length/opaque 하위 record/나머지 원본 payload를 유지하고 head의 정의된 하위 5bit·width/distance/charShapeId/문자만 쓴다. 해석하지 못한 extra/image/check 정의의 수정은 보류하며 해당 원문은 다른 정의 편집 때 그대로 보존한다. 신규 정의는 head12 + WCHAR2 + 명시적 빈 image9 + check WCHAR2의 25bytes이며 현재 자체 parser의 full 형식이다. 기존 단축 배치와 선언의 추가 바이트를 새 선언의 배치로 정규화하지 않는다. 표의 요약 길이만으로 레코드를 잘라 쓰지 않는다.

모델은 typed `bullet_resources` intent를 소유하고 일반 Document checkpoint가 clone/equality/budget/exchange한다. 저장과 query는 동일 `resource_docinfo`에서 current intent를 합성한다. 정의 생성+apply:true는 한 번의 native history에 담고 원본 및 생성 continuation 문단을 지원한다. 문단 모양은 기존 paragraph resource owner에서 source clone을 만들어 heading type/level/ID만 바꾼다. 다른 정렬/여백/flags/border intent와 합성한다. 번호/개요·비0 bullet level·비본문 owner는 기존 범위를 보존하기 위해 거부한다.

HWP5의 기존 저장 계약을 유지한다. 모양 리소스 편집 후 저장은 `editor.save({allowStaleLayout:true})`를 명시하며 반환된 layout reflow 필요 상태를 완료된 조판으로 표현하지 않는다. 현재 Canvas/페이지 조판이나 print/PDF를 새로 구현한 범위가 아니다.

## UI 표시

정렬 value LEFT/CENTER/RIGHT는 그대로 두고 왼쪽/가운데/오른쪽으로 표시한다. PERCENT/HWPUNIT value는 그대로 두고 글자 크기 비율과 고정 거리 문서 단위로 표시한다. 단위 변경은 label만 갱신하며 수치 환산·clamp·원본 기본값 추정을 하지 않는다. 미확인 단위는 미확인으로 표시한다. 너비 보정도 문서 단위 표시로 정리한다. CSS는 채택 목록에 포함하지 않는다.

이 문구 작업의 참고는 공식 한컴 [본문과의 배치 도움말](<https://help.hancom.com/hoffice130/ko-KR/Hwp/format/numberbullet/numberbullet(arrangement).htm>)이다. 도움말 예제의 숫자나 UI 범위를 Native 저장값의 새 기본값·환산 규칙으로 채택하지 않았다.

## 공식 포맷

[HWP5 revision1.3](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf)의 BULLET/ParaShape/문단 머리/ID mapping 필드와 현재 자체 parser/model을 기준으로 구현했다. 외부 reverse 구현·알고리즘은 사용하지 않았다. 그림/체크 bullet, 새 글꼴/char shape 생성, numbering 이어가기/restart는 남은 전체 목표로 유지한다.

## 검증과 지원 경계

Native 집중 검사는 DocInfo 쓰기의 전체 할당 실패 sweep, 선언 원문·불가 항목 보존, 생성 문단·이력·예산 오류의 복원을 다룹니다. 관리 Session 경로의 91개 할당은 초기·중간·마지막 8개 경계를 검사했으며 전수 검사로 표현하지 않습니다.

공개 Core에서 새 정의 생성, 기존 선언 적용·해제, 공유 정의 수정과 오래된 선택 거절을 검사합니다. 독립 표준 라이브러리 CFB oracle은 Python 일반/-O에서 DocInfo·문단 참조·비대상 스트림·디렉터리 메타데이터를 비교하고, 틀린 정의/리소스 수와 바뀐 메타데이터를 거절합니다. 실제 UI와 최종 배포는 합본의 별도 검증 단계입니다.

CLI apply와 MCP apply_document_changes는 같은 paragraph-bullet-definition 연산을 HWP5에도 연결합니다. 전체 inventory.definitionWriter 게이트 뒤에 필요한 세션의 managed history V2를 준비합니다. 구형 ABI는 writer·앞선 변경·history 설정 전에 거절합니다. HWP5는 원본 Native 0-based, HWPX는 Native 1-based이며 주소를 자동 환산하지 않습니다. 최종 owner 권한은 Native가 검사합니다. 그림·체크 글머리표, 새 글꼴/글자 모양 생성, 번호 이어가기·재시작 및 임의 중첩 문단은 남은 범위입니다. 공통 API 의미는 [정의 편집](paragraph-bullet-definition-editing.md), 전체 목록 의미는 [선언 목록](paragraph-bullet-inventory.md)을 따릅니다.

## CLI·MCP 검증

packages/cli/e2e/hwp5-bullet-definition-bridges.test.mjs는 명시 현재 SHA와 별도 H5-bullet old-engine 핀을 요구합니다. HWP5 문단0·1을 독립 CFB oracle로 대조하며 HWPX는0 거절·1 존재/section owner 거절·일반 문단2 쓰기를 구분합니다. writer gate→history V2→Native writer 순서와 old ABI의 history/writer/앞선 변경0회를 확인합니다. 실제 CLI/MCP create/update·readmodel·exact save/reopen, 후행 오류 무출력, CFB 일반/-O 정상 및 잘못된 정의·count·metadata 반례를 검사합니다.
