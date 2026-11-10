# 원본 표 파일의 행·열 편집

`edit-table-grid` CLI와 MCP `edit_document_table_grid`는 저장 후 다시 연 HWP5/HWPX 표를 새 파일로 편집합니다. 공통 CLI 서비스가 원본 SHA, 현재 관측의 표 소유권과 예상 행·열을 확인하며, 실제 변경은 독립 WASM 인스턴스가 수행합니다. 삭제와 격자 편집의 관측 순회는 `table-reference-resolution.ts` 하나가 소유합니다. 파일 경로와 신규 출력 게시도 기존 호스트 경계에 유지합니다.

지원 대상은 병합되지 않은 단순 직사각형 표입니다. 셀은 한 문단의 일반 본문이어야 하며 줄 캐시·필드·캡션·중첩 개체·서명·보호 셀 등은 거부합니다. 세부 구조는 [HWP5](hwp5-source-table-grid.md)와 [HWPX](hwpx-source-table-grid.md) 계약을 따릅니다. 파일 단위 변환과 별도로 원본 표의 열린 세션 undo·Canvas 명령은 [열린 세션 편집 계약](source-table-grid-live-edit.md)을 따릅니다.

행·열 삽입은 앞선 축의 크기·기본 서식을 이어받은 빈 셀을 만들고 총 크기를 늘립니다. 인덱스 0에서는 첫 축을 사용합니다. 삭제는 해당 축을 제거하고 마지막 행·열 삭제는 거부합니다. 생존 셀의 본문·ID·서식·크기와 비대상 payload를 유지합니다. 전체 조판 재계산과 한컴 UI의 삽입 정책 동치를 주장하지 않습니다.

CLI 사용법·설치 상태는 [공개 가이드](../apps/docs/docs/guide/cli.md), MCP 스키마·호출 예시는 [MCP 가이드](../apps/docs/docs/guide/mcp.md)가 소유합니다. 두 형식 모두 명시적 `allow-stale-layout` 동의가 필요하고, 결과의 `layoutRequiresReflow`·`previewStale`은 true입니다. `layout` 기본값은 공식 ListHeader의 `spec6`입니다. 기존 브라우저 생성 HWP5 예제는 `observed8`이므로 명시해야 합니다. 버전·길이만 보고 자동 추측하지 않습니다. HWPX에는 `observed8`을 허용하지 않습니다.

읽기에서 얻은 표 reference는 원본 SHA에 묶입니다. 편집 결과에 다시 작업하려면 그 결과를 새로 읽어 reference와 행·열 수를 갱신해야 합니다. 원본이나 기존 출력 파일은 덮어쓰지 않습니다. 모든 파일 작업을 원본의 논리 세션 이력으로 합치지 않습니다.

## ABI와 버퍼 수명

`src/wasm/table_file_grid.zig`는 ABI6에 선택적으로 추가되는 `table_file_grid_edit(format, docptr, len, section, target, expected_rows, expected_columns, action, index, layout)`와 `table_file_grid_ptr/len/free`를 소유합니다. 형식은 1=HWP5·2=HWPX, action은 기존 ABI 스키마의 0=행 삽입·1=행 삭제·2=열 삽입·3=열 삭제입니다. layout은 0=spec6·1=observed8입니다.

입력 64MiB·출력 128MiB, 스칼라·주소 산술·WASM 선형 메모리 경계를 검사합니다. 실패하면 이전 결과를 숨기지만 입력이 이전 출력을 가리킬 수 있어 변환이 끝날 때까지 그 할당을 유지합니다. 결과는 새 소유 버퍼입니다. CLI 파일 호스트의 별도 출력 한도는 64MiB입니다.

`js/table-file-grid.mjs`는 내부 공용 파일 facade입니다. own data descriptor로 요청을 캡처하고 action 숫자를 기존 ABI 스키마에서 가져옵니다. 호출자의 입력을 소유 복사하고 Native 출력도 복사한 뒤 양쪽 버퍼를 해제합니다. 구형 WASM은 할당 전에 선택 ABI 부재로 거부하고 중복·재진입 호출을 막습니다. 공개 패키지의 최상위 SDK export 추가와는 구분합니다.

## 검증 근거

새 ReleaseSafe 엔진 `e2e0333e3e703328a970126aab88e9d2a302a7fb1897e6822cc15b727f4684cc`에서 저장된 단순 HWP5/HWPX 표의 네 명령, 독립 CFB 레코드·ZIP/XML 격자 대조, 생존 본문·서식·ID·비대상 payload, 저장·재열기, 오래된 reference 거부와 새 reference를 사용한 반대 편집, 실제 구형 엔진 거부를 11개 검사로 확인했습니다. 첫 시도에서 HWP5 예제에 spec6을 지정해 거부된 기록과 observed8을 명시한 최종 결과를 구분합니다. 제품이 자동 추측하도록 바꾼 것은 아닙니다.

Native의 구역 primitive·파일 변환·ABI 경계 집중 검사는 합계 56개가 통과했습니다. JS facade·서비스·공용 resolver·기존 삭제 경계는 48개, CLI/MCP 모형 검사와 실제 파일 호스트 실행은 별도 근거로 구분합니다. 주요 로그는 `zig-out/verification/created-table-ui-r1/source-grid-integrated-final.log`, `source-grid-sdk-service.log`, `source-grid-sdk-native-r2.log`이며 상세 출력은 `zig-out/verification/source-table-grid-api-r1/`에 보존합니다. 이 범위의 성공을 전체 원본 표·조판·플랫폼 완료로 확대하지 않습니다.

실제 CLI·공식 MCP stdio 호출도 22개가 통과했고, 두 형식·네 명령씩 생성한 16개 파일을 독립 오라클과 CLI 재열기로 확인했습니다. 미동의·잘못된 명령·낡은 참조·기존 출력 덮어쓰기 요청의 거부와 MCP 프로세스 종료를 포함합니다. `host-native-r1`의 초기 Markdown 표시 이스케이프 해석 실패를 보존하고 실제 링크 target을 사용한 후속 실행과 구분합니다. 근거는 `source-table-grid-api-r1/host-native-r2/`이며 설치한 npm 패키지 실행으로 확대하지 않습니다.
