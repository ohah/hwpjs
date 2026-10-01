# HWPX 필드 라벨 편집

## 현재 지원과 API

HYPERLINK·CLICK_HERE의 기존 라벨을 문단 내 UTF-16 범위로 수정하고 XML·ZIP으로 저장합니다. 계산 필드·중첩/겹친 필드·필드 내부 미지원 객체는 명시적으로 거부합니다. 모든 필드 종류의 편집 완료를 뜻하지 않습니다.

공개 JS API:

- `fieldLabels(section, paragraph)`: 현재 문단에 속하는 편집 가능 부분의 `{beginElement, start, end}` 배열.
- `spliceFieldLabel(section, paragraph, beginElement, start, deleted, text)`: 명시적 라벨 수정.

section은 0-based, paragraph는 document-wide 1-based입니다. start/deleted는 문단 UTF-16 단위입니다. beginElement는 해당 세션 원본 section 트리의 요소 인덱스이지 XML id가 아닙니다. 세션을 다른 파일로 열면 이전 descriptor를 재사용하지 않습니다.

새 WASM export가 없는 기존 제품에서는 필드 명령만 `HwpxFieldEditAbiUnavailable`로 거부합니다. 일반 명령은 유지합니다. JS 정수·well-formed 문자열·4MiB 입력 검사는 일반 splice와 공유합니다. descriptor 전송은 count와 12-byte 레코드이며 count 4096·정확한 버퍼 길이·역순 범위를 검사하고 복사합니다. 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

## 책임과 SSOT

- `field_text_ranges.zig`: 기존 [마커 링크](hwpx-field-markers.md)와 정확한 원문 바인딩에서 정수 범위를 생성합니다. section 순번·왕복 연결·요소 종류·원문을 검증하고 중복·미연결·교차 종료·fieldid 불일치를 거부합니다.
- `field_marker_ownership.zig`: 공통 XML 선택 프레임으로 활성 p/run/ctrl 소유를 검사합니다. ctrl과 run 사이 활성 switch/branch만 허용하고 감소하는 부모 인덱스를 확인합니다. foreign ctrl·hp:t 안 lookalike·비활성 마커를 거부합니다.
- `field_text_positions.zig`: [현재 문단 segment](hwpx-paragraph-text-positions.md)에서 부분 범위를 투영하고 필드 소유 삽입 사이트를 선택합니다. 바깥 삭제·역순 범위·탭 삭제를 거부하며 빈 소유 사이트를 허용합니다.
- `field_label_session.zig`: native 세션의 명령·조회가 공유하는 정책 준비와 dirty commit 조립.
- `field_label_targets.zig`: 현재 descriptor 배열과 4096개 상한. 조회 한 번에서 마커 보고서·원본 범위·활성 프레임을 공유합니다. 문단마다 보고서를 재조립하고 후보별 위치를 계산하므로 대형 문서의 추가 최적화는 남아 있습니다.
- `field_label_splice.zig`: 필드 범위·삽입 affinity를 공통 `text_splice_transaction.zig`에 연결합니다. 일반 문단과 필드가 문자열 draft·검증·commit을 공유합니다.
- `field_dirty_tag.zig`: 불변 원문과 현재 Boolean에서 새 시작 태그를 생성합니다. 의미상 같은 값이면 원문 참조 표기를 유지하고, 변경 시 quote·다른 속성·공백을 보존합니다. 부재하면 추가하며 UTF-8만 허용합니다.
- `text_sites_save.writeWithFieldDirty`: 텍스트와 속성을 같은 원본 좌표의 변경 목록으로 저장합니다. 중복 속성 요청은 `DuplicateFieldDirty`로 거부합니다. 생성 태그는 임시 소유이며 저장 캐시는 없습니다. XML writer는 단일 태그·동일 이름/종류를 확인합니다.

원본 필드 범위는 ctrl closing/opening 등을 포함하는 물리적 XML 범위이지 표시 문자열이나 삭제 가능한 XML 조각이 아닙니다. 현재 문자열의 길이는 다시 계산하며 원본 마커 위치를 이동시키지 않습니다.

dirty 배열 용량은 문자열 거래 전에 준비하고 성공한 변경 뒤에만 true를 commit합니다. 실패 명령은 문자열·dirty 저장 상태를 유지합니다. dirty는 수정 이력으로 유지되므로 텍스트 제거/복원이 원본 ZIP 바이트나 수정 속성 복원을 의미하지 않습니다.

로컬 RHWP parser는 editable을 양식 편집 bit 0, dirty를 수정 표식 bit 15로 모델에 옮기고 serializer는 현재 값에서 출력합니다. editable=0을 일반 편집 전면 금지로 해석하지 않습니다. 이 비교가 모든 필드 의미의 공식 검증을 대신하지 않습니다.

## Worker와 Canvas

일반 편집이 불가능해도 native descriptor가 있는 문단은 ‘필드 라벨만 편집’으로 표시합니다. 명령 범위가 정확히 하나의 라벨 안에 있을 때 필드 명령을 호출하고 바깥/모호한 범위는 `UnsupportedFieldLabelRange`로 거부합니다. 표시가 잘린 문단은 편집 불가입니다. 링크/원문 바인딩 오류는 `fieldReadOnlyReason`으로 남기며 전체 로드를 실패시키지 않습니다.

현재 textarea는 문단 전체에 열리고 바깥 입력은 거부 후 복원됩니다. 필드별 hit-testing·커서 표현, 원본 페이지/표 조판, OS 한글 IME는 별도 작업입니다.

## 검증 근거와 제한

ReleaseSafe 집중 결과:

- 원본 범위 4/4: 문단 교차 연결·배열 할당 실패·실제 hyperlink·변조 보고서.
- 현재 위치 5/5: 이모지·양쪽 경계·탭 앞뒤·빈 사이트·문단 부분·실제 라벨 거래 XML 저장/재파싱/원본 복원.
- 라벨 splice 3/3: 다중 run·바깥 문자열 보존·surrogate/예산 실패·전체 할당 실패·텍스트와 dirty 동시 저장. ReleaseFast도 3/3.
- dirty 태그 3/3: 어휘 보존·부재 추가·예산·전체 할당 실패·실제 hyperlink 동시 저장/재파싱.
- 마커 소유 4/4: 실제 hyperlink와 조건부 XML. 지원 namespace에 따라 case/default를 선택하고 비활성 필드를 거부.
- native 필드 세션 3/3: 실제 ZIP 편집/재열기·현재 descriptor 갱신·합성 CLICK_HERE 구성/조회/명령 전체 할당 실패. 실제 전체 ZIP 필드 거래의 할당 실패는 별도.
- 일반 문단 회귀 10/10, XML writer 3/3. 기존 세션 할당 실패 회귀 스냅샷은 5/5 완료.

적대적 검증에서 시작 마커 종류만 끝으로 바꾼 보고서가 빈 범위를 정상 반환하는 누락을 재현했습니다(`expected error.InvalidFieldLinks, found { }`). 끝 마커에서도 앞선 시작과 왕복 연결을 검증하도록 수정했습니다. 정상 파일의 파싱 실패가 아니라 방어 계약 누락입니다.

제품 ReleaseSafe 빌드 5/5, 공개 HWPX 편집/Worker 검사 13/13을 통과했습니다. 독립 Python normal·`-O` 검사로 hyperlink 라벨/dirty 외 XML·다른 ZIP payload·항목 순서·archive comment를 비교했습니다. oracle 자체에도 dirty 표식 제거·삽입 라벨 제거·다른 payload 변조·ZIP 항목 순서 변경의 네 반례를 주입했고 두 모드에서 모두 거부했습니다. ZIP 원시 레코드/메타데이터 전수 대조는 아직 별도입니다.

추적 HWPX Worker 전수: 45개 중 정상 44·암호화 예상 거부 1·기타 로드 오류 0. 현재 라벨은 hyperlink.hwpx 4개와 issue144-fields-crossing-lineseg-boundary.hwpx 3개, 총 7개입니다. 각각 공개 API 삽입·ZIP 저장·제품 재열기·끝 위치 +6·모든 문단 텍스트 복원을 확인했습니다. 7개 전체의 독립 oracle은 아직 없으며 제품 재열기 성공을 독립 검증으로 집계하지 않습니다.

외부 HTTPS 실제 Chromium에서 hyperlink.hwpx Canvas 클릭 후 브라우저검증😀 입력·native acknowledgement·Canvas/접근성 값, 7회 Backspace 복원을 확인했습니다. 필드 밖 naver.com 입력은 거부 후 textarea/표시 복원을 확인했습니다. 실제 라벨은 앞의 하이퍼링크 테스트(0~9 단위)입니다. 증거: /private/tmp/hwpjs-hwpx-field-edit-e2e.png. 자동 브라우저 입력이며 OS IME·한컴 조판 검증은 아닙니다. visible-text 대기는 Canvas 내부 문자열을 찾지 못해 timeout했고 DOM value와 native 범위로 확인했습니다.

조회 공유 최적화 이후 전체 ReleaseSafe 검사 종료 코드 0·2,763/2,763 테스트·빌드 7/7을 확인했습니다. core 2,754개와 별도 텍스트 9개이며 core 실행 약 9분·최대 RSS 약 35GiB입니다. 최신 native 필드 세션 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 3/3, 제품 HWPX audit 16/16·7/7, 기존 HWP5 editor audit 69/69·7/7을 통과했습니다. 이 통과를 모든 필드/객체 편집이나 원본 조판 완료로 해석하지 않습니다.
