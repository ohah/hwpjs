# HWPX 탭 보존 텍스트 위치

`src/hwpx/paragraph_text_positions.zig`는 현재 소유 텍스트 사이트와 원본 XML의 직접 탭 요소를 source 순서로 연결합니다. 현재 텍스트는 UTF-16 단위 길이로, 탭은 보존된 한 단위 경계로 계산합니다. XML 원문이나 표시 문자열을 가변 편집 캐시로 만들지 않습니다.

반환 segment 배열은 호출자가 주입한 할당자로 해제합니다. 텍스트 segment의 index는 사이트 인덱스, 탭 segment의 index는 원본 트리 요소 인덱스입니다. 여러 서식 run의 여러 `t`를 연결하며 inline 요소는 공통 `retained_tab`의 정확한 namespace·빈 본문 판정을 따릅니다. 다른 inline 의미는 아직 별도 지원 대상입니다.

`validateRange`는 반열린 범위의 위치 한도와 탭 삭제 겹침을 검사합니다. 탭 앞·뒤의 삽입 위치는 허용하며 탭을 제거하는 삭제는 `ProtectedInlineControl`입니다. 텍스트 내부 서로게이트 분할 여부는 기존 텍스트 splice 계층이 소유합니다. 이 함수만으로 모든 입력 위치 유효성이 증명되는 것은 아닙니다.

ReleaseSafe 집중 root 포함 3/3을 통과했습니다: 현재 텍스트 편집 후 탭 위치 이동, 이모지 UTF-16 길이, 탭 전후 범위와 겹침 거부, 여러 서식 run, 모든 배열 할당 실패 해제를 검사했습니다. 실행 명령은 [개발·검증 명령](development-commands.md)을 따릅니다.

`plain_paragraph_edit.spliceWithTabs`에 위치 조립·보호 검사를 연결했습니다. 기존 plain 명령과 같은 현재 문자열 초안·원자적 교체를 공유하며 UTF-16 길이 계산을 두 곳에서 유지하지 않습니다. 탭 뒤 텍스트 교체, 탭 원문 유지, 탭 삭제·서로게이트 분할 거부를 포함한 일반 문단 집중 검사 7/7이 통과했습니다.

문자 사이트가 없는 직접 탭 전후에는 opt-in `materialize_tab_boundaries`가 빈 삽입 사이트를 연결합니다. 탭 사이 삽입·삭제·원본 XML 복원과 모든 할당 실패 검사를 포함해 일반 문단 8/8, 기존 텍스트 사이트 11/11을 통과했습니다. 원문 comments·탭 속성을 그대로 보존합니다.

공개 Session과 `canEdit`에 탭 경로와 같은 옵션을 연결했습니다. 제품 audit 13/13 및 7/7 빌드 단계가 통과했으며 실제 tabdef 첫 문단의 연속 탭 세 개 앞·사이·뒤 네 위치에 삽입·저장·제품 읽기·원본 ZIP 복원, 탭 삭제 거부 후 상태 보존을 확인했습니다. 같은 원문 위치의 빈 텍스트와 탭은 텍스트를 먼저 정렬하도록 명시해 정렬 구현에 affinity를 맡기지 않습니다.

실제 외부 preview 브라우저에서 tabdef 첫 문단을 클릭해 `탭검증😀`를 입력하고 Worker 적용 완료 및 접근성 텍스트 갱신을 확인했습니다. agent-browser 자동 텍스트 삽입이며 OS IME 조합 검사는 아닙니다. 증거는 `/private/tmp/hwpjs-hwpx-tab-edit-e2e.png`입니다. 후속 전수·독립 비교는 아래에 기록하며 tab 삭제·새 탭 구조 삽입·다른 inline 의미는 미완료입니다.

후속 전수 결과는 1,379문단 중 1,214건 성공·165건 `UnsupportedParagraphControl` 거부입니다. 이전 단 설정 단계보다 8문단이 추가됐고 MissingTextSite·UnsupportedInlineControl 거부는 해당 corpus에서 없어졌습니다. 전수 성공은 prefix 삽입·제품 재열기·원본 ZIP 복원을 뜻하며 모든 편집 명령 지원을 뜻하지 않습니다.

추가 적대적 반례 `<tab>hidden</tab>`는 수정 전 `UnsupportedInlineControl` 대신 편집 성공을 반환하는 것으로 재현했습니다. scanner는 탭 내부 문자도 표시 이벤트로 보내지만 사이트는 직접 `t` 문자열만 소유하므로 한 단위 탭으로 계산하면 위치가 어긋납니다. `retained_tab.zig`가 세 계층의 공통 적격성을 소유하며 self-closing 또는 여는·닫는 태그 사이 원문 바이트가 없는 탭만 허용합니다. whitespace·CDATA·comments가 내부에 있는 paired 탭은 보존하되 편집을 거부합니다. 수정 후 일반 문단 집중 검사 9/9을 통과했습니다.

파생 tabdef 공개 반례는 reader가 `hidden`을 실제 표시 이벤트로 반환하는 것도 확인합니다. 탭만 있는 문단은 소유 사이트 부재로 `MissingTextSite`, 주변 문자 사이트가 있는 native 반례는 `UnsupportedInlineControl`로 거부되며 두 경로 모두 원본·현재 상태를 유지합니다. 공개 집중 검사 7/7과 HWP5·HWPX Canvas/Worker/API 회귀 34/34을 통과했습니다.

같은 최신 일반 문단 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 9/9을 통과했습니다. 전체 native 실행 이후 추가된 paired 탭 거부는 이 집중 검사와 공개 반례로 별도 검증했으며, 실행 중 전체 검사를 최신 모든 소스의 검증으로 소급하지 않습니다.

후속 경계 검사는 빈 탭 사이트 수 제한, 텍스트 예산 0에서 삽입 거부·기존 상태 유지·무변경 허용을 확인했습니다. 빈 탭 경계의 생성에도 기존 UTF-8 편집 제한을 적용합니다. UTF-16LE·BE 입력은 읽기 트리에서 원문 그대로 보존하지만 탭 편집 사이트 생성은 `UnsupportedEditEncoding`으로 거부하며 UTF-8 출력 바이트를 섞지 않습니다. UTF-16 편집 지원 자체는 후속 구현 대상입니다. 두 집중 실행은 각각 root 포함 2/2을 통과했습니다.

탭 연결 단계 전체 ReleaseSafe native 실행은 2,744/2,744 테스트·7/7 빌드 단계·종료 코드 0으로 완료했습니다. 실행 시작 후 추가한 paired 탭 판정과 UTF-16 생성 거부는 앞의 집중 검사로 별도 검증했습니다. 최신 제품 audit은 14/14 테스트·7/7 단계로 완료했습니다. 전체 native 실행 약 8분·최대 RSS 36 GiB를 관측했습니다.

공개 세션 집중 검사 6/6에는 tabdef 네 경계 저장 결과를 독립 Python ZIP/XML로 비교하는 검사를 포함합니다. `tools/hwpx-tab-edit-oracle.py`는 다른 ZIP payload·메타데이터·XML 전체 구조를 대조하고 `--self-test`는 미삽입·탭 속성 변경·다른 payload 변경·잘못된 삽입 위치 네 반례를 거부합니다. 일반·Python `-O` 모두 통과했습니다. 단 설정 단계 전체 native 2,740/2,740은 탭 연결 전에 시작된 이력이며 탭 변경 전체 검사는 별도로 실행합니다.
