# 문단 표시 서식의 선택 분기

고정 native 후보의 전체 테스트를 완료했습니다. 기본 WASM은 교체하지 않았습니다. 별도 수식/선언 위치 변경의 전체 검증과 구분합니다.

## 계약

paragraph_display_children.zig는 paraPr 아래 직접 자식과 활성 switch 분기만 찾습니다. 선택 규칙은 compatibility_selection.zig의 chooseTree를 재사용하며 HwpUnitChar 지원 능력을 임의로 선언하지 않습니다. 빈 capability 집합의 선택 분기에서만 margin/lineSpacing/align과 margin의 core 자식을 읽습니다. 비활성 값을 병합하지 않고 원문은 수정하지 않습니다. 중복 선택 자식은 DuplicateParagraphDisplayChild, 재귀 깊이 초과는 LimitExceeded입니다.

## 실제 재현과 검증

52faef85 기준 사본에 native3파일을 반영했습니다. 이전 b59f67c7 WASM은 실제 copay와 exam_social의 독립 ZIP/XML oracle 비교2개 모두 실패했습니다. 수정 산출물 SHA256 8c52c7444ec6d10e8d42520edca0d1a41d0db1b19a3682d6e6216f424a0ea5eb은 각각146/73개 전체 문단 서식이 일치하고 무편집 저장 bytes도 원본과 같습니다. copay 문단139의 indent=-5698, PERCENT140도 Worker로 전달됩니다. 전체 문서 페이지 지원이 해결됐다는 뜻은 아니며 이 사본의 copay는 여전히 UnsupportedPageFlow입니다.

ReleaseSafe 제품 빌드5/5·45초·MaxRSS2G, paragraph display 필터 native9/9·skip0입니다. 처음 추가 할당 실패 검사는0.17 SafeAllocator의 NondeterministicMemoryUsage로 실패했습니다. callback은 tree를 빌려 읽고 임시 할당을 내부에서 해제하므로 기존 testing/allocation_failures.check로 연결한 뒤 모든 할당 실패 지점을 다시 통과했습니다. 오류를 무시하거나 failure sweep을 줄이지 않았습니다.

값 복원 뒤 실제 문단 간격 gap의 width 부재로 IncompleteDrawingWrapFlow가 드러났습니다. [도형 본문 예약](drawing-wrap-body-flow.md)의 단 전체 폭 검사로 수정했으며 이 JS 경계는 별도로 게시합니다. 수정 후보에서 실제 caption 원본은 고정8px 측정5페이지·282행, 관련 JS9/9·skip0이며 추적46경로는45배치/암호1거부입니다. 기존 b59 측정4페이지·262행을 새 서식 후보 결과와 합치지 않습니다.

실제 Chromium Canvas 입력·이력·저장·독립 XML/ZIP·재업로드도 새 WASM으로 통과했습니다. 그림6/6, 정렬 간격 미지원5줄·도형 텍스트 넘침1줄 경고는 남습니다. /var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-caption-canvas-AFsWY4 산출물, 저장 SHA256 c52f341a5fbd58ea4d6db7e716138fa2888fdbcec45e072fad0db13ba1b45fad입니다. 세션 hwpjs-caption-canvas-3ae26395b4f2 inactive·소유 서버 종료를 확인했습니다. 원본 한글 조판 동치·OS IME 검증은 아닙니다.

## 전체 native 완료

게시 직전 b7daee2f 기반 깨끗한 사본에 native3파일·선택 분기 회귀·주제/인덱스·검증 목록만 반영했습니다. 기존 고정8c52c744 WASM으로 독립 XML2개와 실제 caption/쪽 영역 소속을 직렬 재검사해4/4·skip0·8.6초를 통과했습니다. caption은5쪽282행입니다. 신규 native 편집 기능이나 별도 수식/선언 API를 함께 게시하지 않습니다.

격리 폴더 /tmp/hwpjs-paragraph-switch-publish.yWl2Wi에서 zig build test -j2 -Doptimize=ReleaseSafe --summary all을 필터·shard 축소 없이 실행했습니다. native snapshot tree79f65abd9e6c7dcb30229ed9df256adeaf9caa33, paragraph-switch-native.scope.json/log/result.json이 상태 근거입니다. 종료0·7/7단계·4150/4151통과·1skip입니다(주 runner4141pass/1skip, 별도 helper9pass). 총5342830ms·약89분, guard 관측2642회·오류0·최대 합산RSS8535264KiB/한도10485760KiB·중단false입니다. 두 실행 PID는 종료됐습니다. 로그의 failed command라는 runner 출력 한 줄만으로 실패로 판단하지 않고 최종 step/exit/result를 함께 확인했습니다.

sourceTree는 native3파일의 정확한 스냅샷이며 이후 JS/문서 변경의 전체 tree를 대표하지 않습니다. 관찰 guardian은 자식 전용 process group과 합산RSS10GiB 한도를 사용하며 OS 강제 cap이 아닙니다. 별도 수식 묶음/선언 좌표를 포함한 다음 전체 native는 원래 runner 종료 후 직렬 시작했고 이4150통과를 새 변경의 검증으로 합산하지 않습니다.

재현 회귀는 HWPJS_TEST_WASM을 명시한 tests/hwpx/paragraph-selected-display.test.mjs입니다. Python 독립 oracle은 원본 ZIP/expanded-name XML만 읽고 제품 분기 선택기를 호출하지 않습니다.
