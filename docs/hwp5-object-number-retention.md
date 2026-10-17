# 로컬 개체 번호 참조를 보존하는 편집

## 계약과 단일 판정

`cross_reference_format_retention.objectNumber`가 같은 문서의 개체 instance 범주에 대한 번호 요청만 판정합니다. 기존 command semantics/targetSpace를 재사용하며 표·그림·수식 개체(equation)의 알려진 유형만 해당합니다. 표 한정 `tableNumber`의 기존 의미는 유지합니다. 외부 문서·쪽·내용·위아래 관계·각주/미주 index·개요·책갈피를 이 판정으로 허용하지 않습니다. 잘못된 옵션은 원래 오류를 유지합니다.

이 판정은 source policy, 필드 연결 검사, 이름 결과 적용의 세 경로가 공유합니다. 글자 서식과 일반 텍스트 입력은 개체 선언/ID를 유지하며 기존 번호 결과를 원문으로 보존합니다. 선택 구역의 결과 범위는 기존 `field_result_protection`으로 보호하고, 이름 결과는 종전 적용 경로를 유지합니다. 일반 필드 거래·수식 정의·문단 분할/병합의 허가를 확대하지 않습니다.

command 유형과 targetSpace는 [기존 command semantics 구현](../src/hwp5/body/cross_reference_command.zig)을 재사용합니다. 숫자 target의 실제 연결을 해결하거나, 기존 미해결 대상을 복구하거나, 저장된 표시값을 현재 계산값으로 승인하는 기능은 아닙니다. 번호 재계산·원본 페이지/도형 조판 동치는 별도입니다. 저장의 stale-layout 동의도 유지합니다.

## 실제 원본과 저장 대조

실제 `issue5941/1490000-201600081_roadmap_research.hwp`는7구역·상호참조18개이며 표와 그림 번호 요청이 섞여 있습니다. 이전 main 후보59235b12는 신규 양성 검사에서 `UnsupportedSectionControl`로 실패했습니다(`object-baseline-negative.log`). 새 후보에서는7구역 각각의 첫 문단에 순차 입력하고, 독립 전체 Section/비대상 stream/CFB metadata·undo/redo·기존 편집 보존·최종 strict 재열기와 입력 원본 불변을 확인했습니다.18개 결과의 시작/끝36지점도 거부 후 redo를 유지했습니다.

그림 번호 command 하나만 메모리에서 외부 문서·쪽·내용·상대 위치·주석 index 요청으로 바꾼 다섯 반례는0/1/5/6구역의 조회/입력을 계속 거부합니다. 각각 기존 문단 서식 redo와 원문 bytes를 보존합니다. 기존7구역 거부 검사는 실제 원본의 허용 범위가 달라진 만큼 쪽 요청 파생 입력의 입력/글자 서식/속성 거부로 갱신했고, 단언을 제거하지 않았습니다. 파생 입력은 단일 Section의 단일 command 외 원문 stream이 동일함을 독립 확인하며 원본 파일을 덮어쓰지 않습니다.

## 후보와 검증 범위

게시 후보 SHA256은 `360abdbb224f1865c0df885b38959c242e7bb6daa62c4b47c9ced33c4dae938d`이며 ReleaseSafe5/5 빌드입니다. `object-publication-regressions.log`의 API/Canvas/이력/수식 정의 묶음은35/35·fail/cancel/skip0·exit0입니다. 독립 레코드 기반 합성 그림/수식 번호 파생 문단에서 모델 splice·저장·재열기 및 비대상 정책의 전체 부분 할당 실패를 검사했고 ReleaseSafe3/3·Debug3/3·exit0입니다. 수식 번호는 이 파생 입력의 보존 검증이며 실제 수식 참조 문서 전수 지원으로 확대하지 않습니다.

`object-publication-reader-parity.jsonl`의 reference975개는 이전 게시 후보와 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26입니다. 이름/종류 기준 export331개도 동일합니다. 같은 거부는 지원 성공이 아니며 parser 응답 동치로 편집 전체 완료를 주장하지 않습니다. 로그 위치는 `/tmp/hwpjs-object-number-retention.xiewpX`입니다.

## 실제 Chromium

추가 위치 편향 검사는 실제0/5 본문에서 처음·중간·마지막 글자의 bold를 각각 반전하고 독립 전체 DocInfo/Section/비대상 stream·CFB metadata·잘못된 기대값 음성 대조·undo/redo·strict 재열기/byte-exact 재저장을 확인했습니다. `object-number-position-format.log`는8/8·fail/cancel/skip0·exit0입니다. 원문 API의 마지막 CR은 편집 대상 글자가 아니므로 `InvalidTextPosition`과 원본 불변을 별도로 단언합니다. 최초 검사의 CR 포함 오류를 제품 버그로 분류하지 않습니다. 아래395개 정규 실행 이후 추가한1개 선언이며 이전 전체 결과에 소급 합산하지 않습니다.

`--case=roadmap`으로 실제 원본의0/5 위치를 찾아 한글/이모지 입력·undo/redo 이력1→0→1·저장 경고 동의·다운로드·독립 전체 Section/stream/metadata 대조·strict 재열기·브라우저 재업로드를 확인했습니다. `object-browser-roadmap.log`는 success=true·exit0, 저장 SHA256은 `d7a030c6ef07a92ce55e7ef7d5fc25fd9125e277e03bf5ea03aaaf4906ed9985`입니다. 실제 화면도 검토했으며 임시 `hwpjs-reference-browser-XSihji`의 스크린샷/저장본을 보존했습니다. 소유 브라우저는 active=false/pid=null, 서버도 종료했습니다.

브라우저 도구의 fixture identity/원본 위치/보정본·배포용 열기 정책은 `tools/browser/hwp5-reference-cases.mjs`가 소유합니다. 도구/클릭/종료/인자 guard는9/9·fail/skip0입니다. 이는 한 원본의 실제 브라우저 경로이며 모든 GUI 픽스쳐·OS IME·원본 배경/레이아웃 완료가 아닙니다. 기본 WASM과 외부 데모도 교체하지 않았습니다.

## 정규 회귀 등록과 남은 전체 gate

참조 입력·Canvas·브라우저 guard8파일을 `hwp5-editor-audit`에 등록했습니다. runner는 동시성1로 실행하며 `HWPJS_TEST_WASM`을 그 빌드의 설치 산출물로 명시합니다. 여섯 오래된 테스트의 고정 `zig-out` 경로 대신 이미 로컬에 있던 환경변수 경로 수정 한 줄씩을 main 의존성과 별도로 검증합니다. 그 외 미게시 control-editor 변경은 포함하지 않습니다.

첫 정규 실행은 고정 경로의 ENOENT로 일부 테스트를 시작하지 못한 채, 잘못된 setup임을 확인하고 소유 runner/child를 종료했습니다. 정상 제품 실패나 전체 통과로 계수하지 않습니다. 경로를 수정한 `registered-hwp5-editor-path-fixed.log`는395/395·fail/cancel/skip0·exit0이며 빌드7/7단계가 통과했습니다.

위치별 서식 선언까지 포함한 후속 `registered-hwp5-editor-position-format.log`도396/396·fail/cancel/skip0·exit0, 빌드7/7단계로 종료했습니다(655,264.30ms). 이는 이 후보의 정규 HWP5 편집 묶음이며 별도 native 전체 gate 완료나 기본 산출물 배포 승격을 뜻하지 않습니다.

별도 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`은 native 자식 RSS가12,759,712KiB까지 증가해 소유 자식과 build 프로세스를 SIGTERM으로 중단했습니다. 단언 실패나 전체 통과로 해석하지 않으며 `object-native-full-build-test.log`의 정상 결과가 없는 실행입니다. 같은 native binary SHA256 `3e781bafcb0668d5111122ccf47ae55e8ce8c06e3d7e5a3d00de8ecd66950d74`를 테스트별 별도 프로세스·물리 footprint4096MiB 감시로 실행한 `object-native-guarded-full.jsonl`은 별도 진단이며 진행 중입니다. 감시는 샘플링 방식이지 OS hard limit가 아닙니다. 이전 동결4077개 native 실행 역시 별개 후보의 자원 감시 중단/범위 재개이므로 전체 완료로 합산하지 않습니다.

개발 명령은 [개발·검증 명령](development-commands.md)을 따릅니다. 신규 핵심 묶음은 `object-number-text`, `object-number-canvas`, `unselected-cross-reference-gate`이며, 전체35개 실행과 이9개 집중 실행은 별도 범위입니다.
