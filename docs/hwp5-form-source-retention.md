# HWP5 양식 포함 구역의 텍스트 보존

## 계약과 현재 범위

양식이 포함된 문단의 주변 텍스트를 기존 splice·저장·이력·Worker 경로로 편집합니다. 양식 속성/체크 상태/목록 값 변경이나 양식 토큰 삭제·조판 동일성은 지원 완료 범위가 아닙니다. 관측된 HWP5 5.0.3.0과5.1.0.1만 허용하고 다른 버전은 명시적으로 거부합니다.

`edit/form_source_retention.collect`는 원본 Section을 전체 Tree로 읽고 기존 `form_links.collectObservedUnits`의 토큰/헤더/양식 조립을 재사용합니다. 알려진 양식 종류·직접 자식·공통 속성/속성 envelope의 미해석 꼬리 부재를 확인한 후 컨트롤의 원본 offset/payload를 연결합니다. Report 배열만 소유하며 payload는 입력 Section을 빌립니다. offset 이진 검색과 payload 대조로 다른 위치의 동일 ID를 허용하지 않습니다.

`source_policy`와 `control_source.validateWithSource`가 이 보고서를 공유합니다. 원본을 받지 않는 기존 strict validate는 계속 deferred 양식을 거부하고, `plain_text_source`의 원문 보존 경로만 원본/버전 포함 호출을 사용합니다. 공식 제어코드 대응표를 수정하거나 미지 컨트롤을 허용하지 않습니다. 관측 code11은 기존 [토큰 연결](hwp5-form-links.md), 속성/예산은 기존 [양식 조립](hwp5-form-controls.md)이 소유합니다.

## 분리 검증 (2026-10-16)

main8df85255 기준 후보에 위4개 runtime 파일만 분리했습니다. 로컬 source_policy의 별도 unselected named-field 정책과 text-record-oracle의 preserveEmptyRanges 변경은 포함하지 않았습니다. 기존 JS/API/Worker·독립 CFB/레코드 oracle을 그대로 사용했습니다. 후보 SHA-256은 `49faa55a7437d2915ca0818e0ed7046854b35bc907fcfe520e6ae14096e6194f`, ReleaseSafe 제품5/5·exit0입니다. 기본 데모 WASM은 변경하지 않았습니다.

main f1c6 후보의 form-01 공개 prefix는13/13 `UnsupportedSectionControl` 거부였습니다. 새 API 회귀를 같은 수정 전 후보로 실행한 음성 대조도 첫 splice에서 같은 오류로 실패했습니다. 도구 exit0으로 거부를 집계한 결과를 편집 성공으로 세지 않습니다.

7원본(form-01/02·basic/Textmail/calendar_monthly/calendar_year/request·hwpx/hancom-hwp/form-002)의 양식214개·문단1,446개를 모두 검사했습니다. API/토큰2테스트는1,446개의 독립 완전한 Section/CFB metadata/비대상 stream·양식 raw record·저장 재열기·undo/redo 검증과1,712개 토큰 내부 삽입/전체 삭제 거부를 포함해2/2·skip0·exit0(18088.6995ms)입니다. 기대 텍스트를 틀리게 만든 oracle 반례도 유지합니다.

실제 Worker/WASM과 Canvas 편집기 대역에서도1,446문단 각각 선택·beforeinput/input·native splice·전체 독립 Section·저장·undo/redo·재열기를 검사해1/1·skip0·exit0(455151.48175ms)입니다. 실제 Chromium/물리 IME/한글 조판 검사는 아닙니다.

`src/form_source_fixture_test.zig`는 실제2선언과 의존 선언을 포함한187개를 batch1/1024MiB 관측 감시에서187/187·fail/skip/log/leak0·exit0으로 통과했습니다. 바이너리 SHA-256은 `d8a5ee9b9d0caf1ad1b95ffd5ca0fe59ffa4fb32b3b0443b0b00f76a8bc6bf70`, peak36,782,416바이트입니다. 전체 실패 인덱스·공식 deferred5 분류·잘못된 offset/payload/code/양식 누락·미지 종류/꼬리/버전 거부를 유지하면서 scoped checked allocator와 공통 전체 할당 실패 검사를 사용합니다. 이187개는 전체 root gate가 아닙니다.

같은 후보의 기존 HWP5 등록18파일+CFB6파일은359/359·fail/cancel/skip0·exit0(5898.841333ms)입니다. 최초 교차 실행은 분리 폴더에 고정 경로 WASM이 없어12파일이 ENOENT로 실패했습니다. 실행 종료 후 임시 폴더의 기본 경로와 명시적 후보 해시를 일치시키고 전체24파일을 다시 실행했으며 실제 작업 트리의 기본 WASM은 바꾸지 않았습니다.

main45b7ed22의 HWPX 저장 의미 검증 수리와 통합한 산출물 검사는 아래 후속 실측을 따릅니다. 위49faa 실행을 통합 산출물/전체 native/모든 참조 문서의 지원으로 소급하지 않습니다. 실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

통합 후보의 ReleaseSafe 재빌드는5/5·exit0이며 SHA-256은 `acf300749d02f032c923a2e5db1ab95904a7e3887184bd13c21e6439a162fe48`입니다. 기존HWP5/CFB24파일·양식3파일·HWPX 표/수식2파일의 총29파일을 소스 hash `0f956f451cf74552eda9f70e7a2137ab919de17151df90a6e608e3d4e984e34e` 전후 동일 조건으로 실행해364/364·fail/cancel/skip0·exit0(446750.084667ms)을 확인했습니다. 실제 Worker의1,446문단 전체 입력도 이 통합 실행에서 다시 확인했습니다(442481.221291ms). 단일 실행의 결과이며 앞선49faa 결과와 합산하지 않습니다. compact capture 로그는 `form-retention-integrated-29.log`입니다. 전체 native root/모든 참조 문서/실제 브라우저 조판 완료와는 별도입니다.

기본 파일cbaaf27f와 통합acf300의 export 목록을 읽기 전용으로 대조했습니다. 기본311개·후보300개이며 후보에는 기존16개가 없고 새5개가 있습니다. 누락은 차트6·덧말/문자열6·필드 조회2·그림 소유1·chart OLE open1입니다. 이름/종류 집합의 대조이며 ABI 시그니처·동작 동치 검사가 아닙니다. 현재 기본 파일을 이 후보로 교체하지 않으며, 이 보존 기능의 main 게시와 모든 프로토타입 기능/기본 데모 승격을 구분합니다.
