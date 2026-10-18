# 문서 도구 탭

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
