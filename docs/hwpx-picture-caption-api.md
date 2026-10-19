# 그림 캡션 조회 API와 Worker 소속

native 의미는 [캡션 코어](hwpx-picture-caption-core.md)가 소유합니다. 별도 optional export `hwpx_edit_picture_caption(section,node)`와 `hwpx_edit_picture_caption_bindings(section)`는 기존 JSON 출력 버퍼를 재사용합니다. 성공1/실패0이며 호출 전에 이전 출력을 해제하고 기존 output_ptr/len/free 수명을 따릅니다.

JS `editor.pictureCaption(section,pictureNode)`는 캡션 원값 또는 null을 반환합니다. scalar schema는 기존 `decodeTableCaption`을 재사용합니다. `editor.pictureCaptionBindings(section)`는 native 전역1기반 paragraph와 picture_node/caption_node/list_node 목록을 반환합니다. `caption-bindings-wire.mjs`가 표·그림의 공통 envelope를 검증하며 소속 식별자 선택과 오류 이름은 호출자가 명시합니다. 기존 표 API/오류는 유지합니다. JS는 native 출력을 복사하고 finally에서 해제합니다.

구형 WASM은 각각 `HwpxPictureCaptionAbiUnavailable` / `HwpxPictureCaptionBindingsAbiUnavailable`입니다. Worker는 두 export가 모두 있는 경우에만 조회합니다. `pictureCaptionAvailable:false`는 미확인 상태이며 캡션 부재라는 뜻이 아닙니다. 새 export가 있으면 그림별 `.caption` 원값을 붙이고 정확한 소속이 확인된 문단에 기존 `.drawingCaption` 역할을 부여합니다. 가짜 도형을 만들거나 본문 텍스트를 삭제하지 않습니다. 문단 번호는 Worker 경계에서0기반으로 변환합니다.

`hwpx-picture-captions.mjs`는 caption/list/그림 owner 일치와 문단 역할 충돌·중복을 확인합니다. 소속 오류가 하나라도 있으면 pending 문단 역할을 적용하지 않고 `pictureCaptionErrors`로 남깁니다. 페이지 조판은 오류가 있으면 `AmbiguousPictureCaptionContent`로 거부합니다. 조회에 성공한 그림 원값과 문단 역할 게시의 원자성을 혼동하지 않습니다. window 밖 그림 소속은 기존 제한된 조회 정책에 따라 제외합니다.

재적용 시 현재 그림 ID가 소유한 파생 caption 역할과 그림 scalar/partial 값을 먼저 비웁니다. 다른 도형의 caption 역할은 보존합니다. 동일 입력으로 반복 적용하거나 새 ABI→구 ABI→새 ABI로 갱신해도 이전 역할이 남아 현재 조회 상태와 어긋나지 않아야 합니다. 그림은 window에 있으나 caption 문단이 빠진 입력은 소속 불일치가 아니라 `captionPartial:true`입니다. 조회 결과는 유지하지만 페이지 조판은 `IncompletePictureCaptionContent`로 명시적으로 거부해 caption 없는 완성 페이지로 승격하지 않습니다. 실제 window dependency closure는 부모 본문/자식 caption을 함께 포함하며 실제 참조의31번 문단 query-edit-window도 소속·무편집 저장 보존을 통과했습니다.

읽기 전용 적대적 리뷰의 두 입력을 직접 실행해 기존 동작의 window 소속 오류와 구 ABI 전환 뒤 남는 파생 역할을 재현했습니다. 후속 순수 회귀5/5는 이 두 경계와 다른 도형 역할 보존·잘못된 scalar 소속의 계속된 거부를 검사합니다. 이 후속 수정은 진행 중인 기존 전체 Worker 실행의 고정 소스에 소급하지 않습니다. 수정된 게시 스냅샷의 재검증을 별도로 수행해야 합니다.

집중 검사: `HWPJS_TEST_WASM=/absolute/caption.wasm HWPJS_BASELINE_WASM=/absolute/old.wasm mise exec -- node --test tests/hwpx/picture-caption-api.test.mjs tests/hwpx/picture-caption-content.test.mjs`. 기본 WASM 교체와 무관하게 정확한 후보를 지정합니다. 실제 그림350의 scalar/paragraph32·무편집 전체 bytes·잘못된 인자·구형 ABI·실제 Worker caption31·기존 표 envelope·중복/잘못된 소속·늦은 오류의 문단 부분 게시 방지를 검사합니다. 보호된 구조 필드의 anchorText 편집 거부도 유지합니다.

복합 그림/표 조판 없이 HEAD에서 추출한 격리 게시 소스의 집중 검사는6/6·skip0입니다. 실제 복합 배치와 저장 왕복은 별도 후보 테스트 `picture-caption-worker-layout.test.mjs` / `captioned-picture-worker-roundtrip.test.mjs`가 소유하며 이 API 게시의 통과 결과로 합산하지 않습니다. 기본 WASM은 교체하지 않습니다.

같은 게시 소스의 ReleaseSafe 제품 빌드는5/5단계·43초·MaxRSS2G입니다. 별도 prefix 산출물 SHA256은 `b59f67c71105c93e4745cd9d5b172d45636939ddc06b4b636e4ca2a1769271e2`이며 새 산출물을 명시한 API/Worker·소속·분할 문단·정렬 회귀9/9·skip0입니다. 기본336개 함수 export는 모두 유지되고 새 caption 함수2개만 추가됐습니다(함수338개, 모든 export 항목 개수와 구분). 기존 native 전체 검증 tree와 src 차이는 이 export wrapper16줄뿐이며 native 코어4148pass/1skip 결과는 코어 문서의 고정 소스 범위를 따릅니다. 새 export를 포함한 제품 빌드/실제 WASM 호출과 이전 native 코어 실행을 별개 근거로 기록합니다.

두 경계 보강 후 별도 게시 스냅샷 `/tmp/hwpjs-caption-api-refresh.Xrma13`에서 같은 새 WASM을 명시한 집중11/11·skip0입니다. 실제 native 편집 창의 caption 소속·무편집 저장도 포함합니다. 정적 재리뷰에서도 두 지적이 해소됐고 추가 구체적 문제는 발견하지 못했으며, 정적 리뷰를 별도 런타임 통과로 합산하지 않습니다.

같은 보강 후 소스의 `tests/hwpx/worker-fixtures.test.mjs`도1/1·skip0·496710ms로 종료됐습니다. 추적46경로 중 암호 문서1개의 예상 거부와45개 읽기를 구분합니다. 문단1444개는 plain1278/anchor146/field7/formula13으로 분류됐고 실제 anchor146·field7·formula13의 입력·undo/redo·저장·재열기/재저장 bytes를 검사했습니다. plain1278개를 모두 편집했다고 쓰지 않습니다. 보강 전 소스도 같은 전체 검사가496043ms로 종료됐으며 서로 합산하지 않습니다. 처음 Git archive 폴더에서 실행한 시도는 git inventory 메타데이터 부재로 검사 시작 전에 실패했고, 별도 GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE을 정확히 지정한 두 실행이 정상 종료했습니다. 사용자 기본 index는 변경하지 않았습니다. 실제 브라우저·전체 참조 샘플·한글 조판 동치의 완료와 구분합니다.
