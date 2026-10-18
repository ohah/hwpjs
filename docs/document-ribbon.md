# 문서 도구 탭

## 메뉴 막대 좌·우 키 이동

메뉴 막대의 기존 키보드는 단일 popup 안의 위/아래·Home/End와 Escape만 처리했습니다. 좌/우 키의 제어기 회귀를 먼저 추가해 defaultPrevented=false로 실패하는 것을 재현했습니다. `document-menu-keyboard.mjs`의 `navigateDocumentMenuBar`가 메뉴 간 순환 포커스/열림 상태만 소유하고, 제어기는 기존 popup layer를 갱신한 뒤 요약에 포커스를 줍니다. 명령 실행·native 편집·WASM은 변경하지 않습니다.

닫힌 요약에서 좌/우는 다른 요약으로 포커스만 이동하며 메뉴를 열지 않습니다. 열린 메뉴에서는 이전 메뉴를 닫고 옆 메뉴를 열며 처음/끝을 순환합니다. IME/229·소비된 이벤트·수정키/Shift를 가로채지 않고 close 뒤에는 동작하지 않습니다. `details.open`이 계속 단일 상태 원본이며 별도 활성 메뉴 인덱스를 저장하지 않습니다.

메뉴 키보드·제어기·mnemonic·disclosure·popup layer 다섯 파일19/19·fail/cancel/skip0·exit0입니다. 실제 작업 트리의 명시적 Zig0.17 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`에서도 `/tmp/hwpjs-zig017-current-fixtures.xouwd1/menu-horizontal-browser.jsonl/.stderr`가 exit0·stderr0·verified=true·cleanup.success=true입니다. agent-browser 스킬의 격리/실제 키 입력/종료 확인을 사용했습니다. 실제 열린 메뉴의 오른쪽/왼쪽 이동·유일한 열림/포커스·Escape 뒤 기존 픽스쳐 선택·입력·메뉴 U/R/S·독립 XML/ZIP·재업로드를 확인했습니다. 모든 RHWP 메뉴/명령 동치 완료는 아닙니다.

커밋 후보 트리 `3d0122a81d37cab2a9f79d1d70f10236710b93a5`를 `/tmp/hwpjs-menu-horizontal-clean.MsLPHp`로 추출하고 게시 소스 Zig0.17 WASM `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`로도 집중19/19·실제 브라우저 wrapper exit0·stderr0·verified=true·cleanup.success=true입니다. 키보드 helper 자체도 브라우저 실행 전후 해시 감사에 포함했습니다. 두 소유 세션은 종료 후 active=false·pid=null을 확인하며 기본 WASM/데모 서버는 교체하지 않습니다.

[픽스쳐 요청 수명](fixture-request-lifetime.md)은 픽스쳐/로컬 파일 전환 시 취소와 기존 generation 보호의 책임을 구분합니다. 일반 실제 웹 왕복은 지연 본문을 취소한 뒤 picker 편집/저장까지 검사합니다.

## 책임과 상태

`web/preview/document-ribbon-pages.mjs`가 홈·삽입·보기의 이름과 기존 도구 그룹 선택자를 소유합니다. DOM 이동·ARIA·포커스·수명은 `document-ribbon-controls.mjs`가 맡습니다. 새 편집 명령이나 WASM 호출은 만들지 않습니다.

기존 입력/버튼/폼 노드를 복제하지 않고 패널로 옮깁니다. 각 편집 모듈의 hidden/disabled·폼 소속·listener는 유지하며, 탭은 자신이 만든 패널의 표시만 제어합니다. 시작 전 누락·중복·중첩 그룹과 ID 충돌을 거부하고 close에서 원래 자리로 복원합니다. pagehide.persisted=true인 bfcache에서는 기존 상태를 유지합니다.

tablist/tab/tabpanel 연결과 roving tabindex를 사용합니다. 방향키·Home/End는 활성 탭과 포커스만 이동하고 Tab으로 패널에 진입합니다. IME·이미 소비된 이벤트·수정키·외부 입력은 가로채지 않습니다. 메뉴가 기존 버튼에 click을 위임하면 해당 패널을 먼저 드러내지만 명령의 허용 여부나 실행은 계속 기존 메뉴/편집기가 소유합니다. 삽입 폼이 원래 숨겨진 상태라면 탭만 열어도 삽입 권한이 생기지 않습니다.

찾기를 펼친 상태의 초기 캡처에서 선택 패널이 도구 막대 밖으로 밀리는 것을 확인했습니다. 명시적 탭 전환 시 패널을 nearest 스크롤하고 탭 행은 막대 안에 고정합니다. 단순 hidden=false를 가시성 증거로 쓰지 않고 브라우저 검사에서 실제 패널/막대/뷰포트의 교차 영역도 확인합니다.

## 집중 검증

`/tmp/hwpjs-ribbon-preview.yjDs24`는 c2b54971의 사본에 이 UI 변경만 더했습니다. app에는 import와 초기화/종료 세 줄, build에는 두 검사 등록만 더했음을 원본과 비교했습니다. 무관한 작업 트리 변경을 포함하지 않았습니다.

`ribbon-menu-visible-units.log/.stderr`는38/38·fail/skip/cancel0·exit0·stderr0입니다. 새 두 파일7개와 기존 메뉴31개를 포함하며 노드 정체성/원래 자리 복원·권한 보존·키보드·메뉴 위임·Window 타겟·누락/중복/중첩·가시성 증거 부재 거부를 검사합니다. 포맷·구문·등록 검사도 통과했습니다. DOM 대역은 실제 CSS/브라우저 증거를 대신하지 않습니다.

## 실제 Chromium

다음 실행은 모두 exit0·stderr0·검증/소유 브라우저 및 서버 종료를 확인했습니다. 스킬의 격리 세션·실제 클릭/키보드·종료 확인을 사용했습니다. 기본 WASM은 교체하지 않았습니다.

| 로그 | WASM | 실제 확인 |
| --- | --- | --- |
| ribbon-plain-visible-browser.jsonl | eaaa0d20… | 홈/삽입/보기·방향키/Home/End/Tab·문서 없는 삽입 보호·실제 본문 입력·메뉴 U/R/S·독립 전체 XML/ZIP·재업로드 |
| ribbon-unknown-visible-browser.jsonl | eaaa0d20… | 위 흐름과 원래 표2/unknownObj4의 삭제 보호 및 바깥 텍스트 편집 |
| ribbon-roadmap-visible-browser.jsonl | eaaa0d20… | 실제 HWP5 문단 입력·이력·다운로드·독립 Section/비대상 stream/metadata·재열기 |
| ribbon-default-visible-browser.jsonl | cbaaf27f… | 현재 기본 WASM으로 같은 일반 문단/탭/저장 흐름의 호환성 |

후보 전체 SHA256은eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f, 기본은cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346입니다. HWPX 공통 흐름은 각 실행 전후 UI/도구 소스 해시·HTTP WASM 해시·원본 불변을 확인합니다. HWP5 도구는 명시한 WASM/원본으로 실제 왕복과 원본 불변을 검사하며 같은 HTTP 소스 해시 감사를 수행한 것으로 합산하지 않습니다. 세션은 hwpjs-menu-mnemonic-8bb0da6fc052, hwpjs-unknown-anchor-8bb0da6fc052, hwpjs-reference-roundtrip-8bb0da6fc052이며 포트58863/58864/58851을 각각 사용했습니다.

최종 후보 일반 캡처/사본은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-menu-browser-BCQ4iX`, 보호 개체는 `.../hwpjs-unknown-browser-g8YfkH`, HWP5는 `.../hwpjs-reference-browser-sz7nLq`, 기본은 `.../hwpjs-menu-browser-6QIHYy`입니다. 일반 재업로드 캡처를 직접 확인했습니다. 중간 `ribbon-plain-final-browser.jsonl`의 Download was canceled는 cleanup.success=false로 보존합니다. 당시 공간 부족이 있었지만 취소 원인을 확정하지 않으며 최종 성공으로 바꾸지 않습니다.

이 결과는 RHWP형 도구 구성을 향한 기본 탭과 선택 사례의 검증입니다. 모든 리본 명령·물리 IME/클립보드·전체 fixture UI·원본 조판 동치 완료는 아니며, 최신 native/전체 공개 gate와 제품 WASM 승격도 별도입니다.

## Zig 0.17 후보의 실제 웹 왕복

원본 작업 트리 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`을 명시해 실제 Chromium으로 다시 검사했습니다. 미커밋 기능을 포함하는 후보이며 기본 제품 WASM/외부 데모를 교체하지 않았습니다. 로그는 `/tmp/hwpjs-zig017-current-fixtures.xouwd1`에 보관합니다.

기존 일반 브라우저 도구가 upload 경로만 검사해 픽스쳐 선택 UI를 검증하지 않는 공백을 확인했습니다. `document-menu-cases.mjs`의 plain 사례에만 `fixturePicker`를 지정했고 공통 흐름은 카탈로그의 원본 경로와 정확히 하나 일치하는 항목을 선택합니다. HTTP 응답 전체 해시가 독립 oracle 입력과 같고 버튼이 활성인 것을 확인한 뒤 실제 select/click으로 문서를 엽니다. 보호 개체 사례의 upload와 다운로드 사본의 재업로드는 그대로 유지합니다. UI 카탈로그/목록/로더 소스도 실행 전후 해시 감사에 포함합니다.

| 로그 | 실제 확인 |
| --- | --- |
| menu-browser.jsonl/.stderr | 변경 전 upload 경로·탭 키보드·입력·메뉴 U/R/S·독립 XML/ZIP·재업로드 |
| menu-picker-browser.jsonl/.stderr | 픽스쳐 선택/열기부터 동일 입력·이력·다운로드·독립 normal/-O XML/ZIP·재업로드 |
| hwp5-roadmap-browser.jsonl/.stderr | roadmap HWP5의 실제 입력·이력·다운로드·독립 전체 Section/비대상 stream/metadata·재업로드 |
| unknown-object-browser.jsonl/.stderr | 표2/unknownObj4 원본에서 실제 Delete 보호 거부·바깥 입력·이력·독립 XML/ZIP·재업로드 |

네 실행 모두 터미널 exit0·stderr0이며 cleanup 성공과 서버 종료를 확인했습니다. 새 picker 캡처는 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-menu-browser-67diYX/reopened.png`, HWP5는 `hwpjs-reference-browser-IOCUE7`, 보호 개체는 `hwpjs-unknown-browser-KBY0U0` 디렉터리에 있습니다. 직접 확인한 초기 일반 캡처는 `hwpjs-menu-browser-NBmrXx/reopened.png`입니다. 소유 세션 세 개의 후속 조회도 active=false·pid=null입니다.

브라우저 인자·정확한 picker 원본 매핑·클릭/종료 guard 세 파일13/13·fail/cancel/skip0·exit0·stderr0, JS 구문·변경 diff 공백 검사도 통과했습니다. 스킬에 따라 격리 세션과 실제 입력을 사용하고 브라우저를 종료했습니다. 이 집중 검사는 전체104개 UI 픽스쳐·모든 리본 명령·RHWP 기능/조판 동치 완료가 아닙니다.
