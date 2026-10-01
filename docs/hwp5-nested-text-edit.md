# HWP5 중첩 목록 문단 텍스트 편집

[텍스트 명령·저장 계약](hwp5-plain-text-edit-experiment.md)의 원자적 splice·서식·범위 정책은 유지하면서, 검증된 목록 소유 문단을 연결합니다. 표 셀의 논리 텍스트를 편집하는 구현이며 Canvas에 원본 표 격자·페이지를 재현한 구현은 아닙니다.

## 책임과 보존 정책

- `edit/source_policy.zig`: 구역의 보존 가능 레코드/컨트롤 정책. 기존 body Tag와 도형 모듈의 tag 상수를 재사용합니다. 구역/단 설정 외 표·도형·머리말 등 알려진 컨트롤이 다른 문단에 있다는 이유만으로 단순 텍스트를 막지 않습니다. 알려진 도형 payload를 그대로 보존하는 것과 그 의미·조판을 검증하는 것은 구분합니다. 미지 tag/ID·메모 목록·하이퍼링크 외 필드 컨트롤은 계속 거부합니다.
- `edit/paragraph_owner.zig`: 원본 Tree에 소유 관계 확인에 필요한 CTRL_HEADER·LIST_HEADER·TABLE만 해석합니다. `list_groups.Groups.build`의 형제 목록 범위와 선언 문단 수를 재사용합니다. LIST_HEADER를 문단의 부모라고 추정하지 않습니다. 표는 `table_lists.Iterator`의 단일 TABLE 마커와 셀/캡션 목록 관계를 확인합니다. head/foot/fn/en 목록과 gso 아래 SHAPE_COMPONENT 목록도 같은 그룹 계약을 사용합니다.
- `edit/plain_text_source.zig`: 대상 문단의 기존 직접 자식·헤더 확장·개수·리소스 검사를 유지하며 위 두 소유자에 위임합니다. 실제 텍스트는 여전히 일반 Unicode와 끝 PARA_BREAK만 허용합니다. 대상 문단 자체에 필드·개체·번호·탭 등 제어가 있거나 텍스트 레코드가 없으면 거부합니다.
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

실행 명령은 [개발·검증 명령](development-commands.md)을 따릅니다. HWPX 편집·빈 원본 문단·제어 포함 텍스트·문단 간 편집·재조판·rhwp 형태의 완성 UI는 남은 목표입니다.
