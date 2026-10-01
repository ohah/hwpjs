# HWP5 중첩 목록 문단 텍스트 편집

## 직접 도형 캡션 소유 연결

아래 캡션·table-bug 거부 조사와 1,303개 성공 수치는 바탕쪽 연결 전 기록입니다. 당시의 ‘현재’·‘추가 검증 필요’는 해당 단계만 가리킵니다. 이후 소유·영역 파서와 현재 검증 결과는 [바탕쪽 목록 계약](hwp5-master-page-edit.md)이 소유하며 중첩 소유 거부는 현재 0개입니다. 캡션 손상 반례와 바탕쪽 연결까지 포함한 ReleaseSafe 제품 편집 63개·전체 Zig 2,703개가 통과했습니다. 캡션·바탕쪽의 실제 브라우저 입력은 아직 미검증입니다.

남은 table-bug 문단 1의 실제 조상은 root PARA_HEADER → secd CTRL_HEADER입니다. LIST_HEADER와 PARA_HEADER는 level 2 형제이고 목록 payload는 34바이트, 선언 문단 수는 1입니다. 목록 공통 observed8 뒤 폭/높이 후보와 추가 바이트가 존재하지만, 이를 도형 캡션으로 읽을 근거는 없습니다. 구역 정의 공식 표 137의 바탕쪽 정보(10바이트)와 실제 확장 목록 배치를 별도로 연결해야 하며 길이가 충분하다는 이유만으로 Caption.parse를 적용하지 않습니다. 현재는 UnsupportedNestedParagraph 거부를 유지합니다.

실제 textbox에서 파생한 짧은 캡션 payload(목록 헤더 뒤 13바이트), 선언 문단 수 불일치, 목록 헤더 부재를 각각 검사했습니다. 오류는 UnexpectedEnd·ListParagraphCountMismatch·OrphanListParagraph이며 실패 후 대상 텍스트와 byte-exact 원본 저장을 확인했습니다. 이 반례를 포함한 중첩 집중 검사 11개가 통과했습니다. 파생 파일은 메모리에서 만들며 추적 원본은 변경하지 않습니다.

후속 전수 조사에서 `textbox.hwp`의 거부 문단은 SHAPE_COMPONENT 내부 글상자가 아니라 gso CTRL_HEADER의 직접 캡션 목록이었습니다. `paragraph_owner.zig`는 기존 Groups의 선언 문단 수/소유 검사 후 drawing 직접 목록의 observed8 view와 기존 Caption.parse를 사용합니다. 글상자 경로와 혼합하거나 부모를 평탄화하지 않습니다. Canvas는 캡션의 기존 자동 번호(code 18)를 보호 표식으로 표시하며 새 번호 생성/삭제는 허용하지 않습니다.

실제 textbox 캡션의 삽입·저장을 제품 WASM 및 독립 전체 Section/비대상 스트림 oracle로 대조했고 Canvas 집중 17개가 통과했습니다. 추적 전수 검사에서 1,481문단 중 1,303개 삽입 성공이며 남은 거부는 SectionControl 175개, CrossParagraphField 2개, NestedParagraph 1개입니다. 같은 직접 캡션 소유 연결로 multicolumns-in-common-controls 문단도 허용됐습니다. table-bug의 구역 정의 아래 목록은 별도 원인이므로 임의 허용하지 않았습니다. 최신 native 변경의 전체 Zig 회귀·손상 캡션 반례·실제 브라우저 캡션 입력은 아직 추가 검증이 필요합니다.

[텍스트 명령·저장 계약](hwp5-plain-text-edit-experiment.md)의 원자적 splice·서식·범위 정책은 유지하면서, 검증된 목록 소유 문단을 연결합니다. 표 셀의 논리 텍스트를 편집하는 구현이며 Canvas에 원본 표 격자·페이지를 재현한 구현은 아닙니다.

## 책임과 보존 정책

- `edit/source_policy.zig`: 구역의 보존 가능 레코드/컨트롤 정책. 기존 body Tag와 도형 모듈의 tag 상수를 재사용합니다. 구역/단 설정 외 표·도형·머리말 등 알려진 컨트롤이 다른 문단에 있다는 이유만으로 단순 텍스트를 막지 않습니다. 알려진 도형 payload를 그대로 보존하는 것과 그 의미·조판을 검증하는 것은 구분합니다. 미지 tag/ID·메모 목록·하이퍼링크 외 필드 컨트롤은 계속 거부합니다.
- `edit/paragraph_owner.zig`: 원본 Tree에 소유 관계 확인에 필요한 CTRL_HEADER·LIST_HEADER·TABLE만 해석합니다. `list_groups.Groups.build`의 형제 목록 범위와 선언 문단 수를 재사용합니다. LIST_HEADER를 문단의 부모라고 추정하지 않습니다. 표는 `table_lists.Iterator`의 단일 TABLE 마커와 셀/캡션 목록 관계를 확인합니다. head/foot/fn/en 목록과 gso 아래 SHAPE_COMPONENT 목록도 같은 그룹 계약을 사용합니다.
- `edit/plain_text_source.zig`: 대상 문단의 기존 직접 자식·헤더 확장·개수·리소스 검사를 유지하며 위 두 소유자에 위임합니다. 대상 문단 자체의 기존 탭·알려진 anchor·같은 문단 하이퍼링크를 보존하는 확장은 [제어 보존 계약](hwp5-control-text-edit.md)이 소유합니다. 제어 생성/삭제나 일반 필드 의미 편집은 아닙니다. 텍스트 부재의 제한적 허용은 [빈 문단 계약](hwp5-empty-text-edit.md)이 소유합니다.
- 기존 `plain_text.zig`·`character_format.zig`·`text_section_writer.zig`: 명령·원자적 모델 반영·출력의 단일 출처를 유지합니다. 셀 편집 전용 텍스트 사본이나 별도 저장기를 만들지 않습니다.

목록 소유 확인은 셀 주소·병합 격자·6/8바이트 배치·테두리·시각 배치를 새로 검증했다는 뜻이 아닙니다. 셀/표 구조 자체는 변경하지 않습니다. 해당 의미 파서·검증기는 기존 body 모듈이 소유합니다. 다른 문단에 있는 하이퍼링크를 보존할 수 있다는 정책은 하이퍼링크 제어를 포함한 대상 텍스트의 편집 지원과 다릅니다.

원본 레코드 인덱스·문단 Instance ID·목록 문단 수는 바꾸지 않습니다. 저장 시 수정 문단의 텍스트/서식/범위/개수만 기존 저장기로 쓰고 다른 레코드는 원문으로 유지합니다. 상위 문단 줄 캐시·표 폭/높이·PrvText·미리보기·caret 등 파생 값은 재계산하지 않습니다. 기본 저장의 `LayoutReflowRequired`와 명시적 opt-in의 `layoutRequiresReflow=true`를 유지합니다. 정보 보존 실험이지 한컴 재조판 완료나 일반 안전 저장이 아닙니다.

## Canvas 연결

`content.mjs`는 중첩이라는 이유만으로 입력 후보에서 제외하지 않습니다. 완전한 표시 텍스트·텍스트 존재·제어 토큰 여부만 표시 후보로 사용하고, 목록 소유를 JS에서 다시 구현하지 않습니다. 최종 허용 여부는 native 명령이 판정합니다. 기존 Worker/명령/응답을 공유하고 거부 시 임시 입력을 되돌립니다. 원본 표 배치·셀 경계 선택·표 크기 변경 UI는 아직 없습니다.

## 2026-10-01 실측과 반례

[전수 검사](fixture-editor-coverage.md)의 1,481문단 중 성공은 이전 269개에서 712개로 늘었습니다. `software.hwp`는 101문단 중 70개에서 실제 삽입·독립 저장 텍스트 대조·제품 세션 재열기가 성공했습니다. 남은 거부는 제어 포함 8개·텍스트 레코드 부재 23개입니다. 다른 문서의 지원 실패가 없어졌다는 뜻은 아닙니다.

`nested-editor.test.mjs`는 실제 software 제목 문단 2와 중간/마지막 대상의 시작/끝 삽입·전체 삭제 9건을 검사합니다. CFB.js·Node zlib·`text-record-oracle.mjs`의 코드 단위별 독립 서식 기대값으로 전체 Section과 모든 비대상 스트림을 대조합니다. 저장 출력을 다시 엽니다. 목록 개수 불일치·목록/표 마커 부재·중복 표 마커를 거부하고 원본 byte-exact 저장을 확인합니다. 무시된 변경·다른 셀 변경을 독립 oracle이 검출합니다.

기존 native 파일 audit에는 software 제목의 실제 중첩 삽입 1건·글자 모양 1건을 추가했습니다. 중첩은 CFB.js/레코드 대조이며 Rust JSON의 최상위 문단 인덱스로 검증했다고 주장하지 않습니다. `text-oracle.mjs`는 Rust 최상위 JSON 책임만 남기고 원시 레코드 기대값은 `text-record-oracle.mjs`로 분리했습니다. native 할당 실패 검사는 목록 소유 파싱·텍스트/서식 명령·저장 실패 경로와 거부 시 값/원본 보존을 검사합니다.

실제 공개 Chromium 화면에 software 파일을 선택하고 제목 문단을 좌표 클릭했습니다. I-beam·caret `0:2:3`, `한😀` 삽입 후 Worker가 확정한 대체 텍스트 반영, Backspace의 이모지 전체 삭제, Meta+A 뒤 `표 셀 제목😀` 교체를 확인했습니다. 브라우저 오류 목록은 비어 있었습니다. 스크린샷 `/private/tmp/hwpjs-software-table-input.png`에서 실제 그려진 텍스트와 caret를 확인했습니다. 자동 문자 삽입은 실제 OS 한글 IME 후보창 검증이 아닙니다.

편집 후 파일 선택 버튼을 클릭해 같은 software 파일을 다시 선택했을 때 원본 제목 복원·빈 caret·입력 비활성 초기화를 확인했습니다. 클릭 없이 동일 파일을 CDP로 반복 지정한 자동화는 `change`를 내지 않아 대기 조건이 시간 초과됐습니다. 실제 클릭 흐름에서는 `change` 1회와 원본 복원이 관측돼 제품 오류로 분류하거나 앱 코드를 바꾸지 않았습니다.

Debug·ReleaseSafe·ReleaseFast 제품 편집 집중 검사 34개, ReleaseSafe 전체 Zig 2,688개가 통과했습니다. ReleaseSafe native audit은 집중 검사 7개, 기존 실제 텍스트 편집 75건·경계 56건·합성 21건·중첩 실제 삽입 1건, 서식 153건과 거부/독립 oracle 반례를 통과했습니다. 전체 Zig 성공 요약의 러너 stderr 문구는 [별도 판정 계약](zig-test-stderr.md)을 따릅니다.

위 실측은 빈 문단 연결 전 단계입니다. 이후 기존 빈 문단 지원과 검증은 [별도 계약](hwp5-empty-text-edit.md)을 따릅니다. 실행 명령은 [개발·검증 명령](development-commands.md)을 따릅니다. HWPX 편집·제어 포함 텍스트·문단 간 편집·재조판·rhwp 형태의 완성 UI는 남은 목표입니다.
