# 열린 문서의 그림 신규 삽입 후보

이 문서는 exact `809476415bf9b7ed3cc826a1c02923f211514ba4`에서 준비한 소스 후보의 계약이다. 실제 Native 컴파일·파일 저장 시험·WASM·정상 SDK·브라우저 검증 결과로 읽지 않는다. 데모 파일 선택기 UI는 별도 담당이 이 계약을 사용해 준비한다.

## 기존 기능과 경계

`replace-image`는 기존 그림 리소스를 교체한다. 기존 `insert-image` CLI/MCP는 독립 파일 변환이며 열린 편집기의 이력은 소유하지 않는다. 이 후보의 `INSERT_IMAGE_COMMAND`는 열린 Session에 그림과 리소스를 하나의 History 거래로 추가한다. CLI 구현과 문서 재열기로 이력을 초기화하는 대체 경로는 사용하지 않는다.

## 공개 입력과 결과

Core의 입력은 `{target, selectionVersion, options:{imageBytes, width, height}}`다. 폭·높이는 1~2147483647 정수 HWPUNIT이며 자동 크기 추정·회전·픽셀 변환은 하지 않는다. PNG/JPEG는 기존 구조 검사기를 사용하고 최대8MiB다. 완전한 픽셀 디코딩을 증명하는 검사는 아니다. Core 큐 진입 전에 바이트와 대상 DTO를 복사하며 getter·공유 버퍼를 거부한다.

HWP5 대상은 현재 `SelectionTarget`이다. 기존 display→source 변환과 scoped current reference를 그대로 쓰며 Native가 현재 UTF16LE 원문을 복사한다. JS가 원문이나 섹션 접두부를 재구성하지 않는다. HWPX 대상은 `getInlineObjectInsertTarget`에서 얻은 `InlineObjectCreateTarget`이며 `owner.kind=body`만 허용한다. `expected_text`와 `unit`은 Native anchor 좌표 그대로다. 빈 본문의 구역·단 접두부도 임의로 제거하지 않는다.

Native 응답은1 적용,0 미적용과 진단,3 적용 여부 불명이다. JS는 `application`, `changed`, `nativeCode`, `error`를 전달한다. 입력 버퍼 정리 실패 뒤에도 이미 관측한 적용 결과를 유지하고 `cleanupError`와 `refreshRequired`를 붙인다. 불명·정리 실패는 재시도 근거가 아니다. Core의 표준 commit/refresh 상태와 undo/redo/save 명령을 사용한다.

새 선택 ABI는 각 형식의 `*_image_insert_version()`1과 H5 `hwp5_edit_insert_image_current(refPtr,refLen,jsonPtr,jsonLen,imagePtr,imageLen)`, HX `hwpx_edit_insert_image(jsonPtr,jsonLen,imagePtr,imageLen)`다. H5 JSON은 `{start,width,height}`, HX JSON은 `{target,width,height}`다. 이미지 바이트는 JSON 밖의 별도 버퍼다. 기존 산출물에 이 export가 없으면 기능을 활성화하지 않는다. ABI SSOT는 `js/abi-schema.mjs`, 생성기는 `tools/generate-abi.mjs`다.

## 형식별 소유권과 저장

HWP5는 공식 표17·18의 EMBEDDING BinData와 표69·70·82~85·107·108에 근거한 기존 own 그림 writer를 사용한다. DocInfo ordinal과 물리 ID를 별도로 예약하고, 기존·보류 리소스 및 고아 이름을 함께 검사한다. 그림은 실제 PNG/JPEG 바이트를 새 스트림에 저장한다. 차트의 STORAGE/OLE 경로와 그림 EMBEDDING을 혼합하지 않는다. 공통 ledger는 기존 차트 리소스 checkpoint·clone·CFB 저장을 재사용한다. 일반화한 source/remap helper에서도 차트 author와 기존 차트 verifier를 유지한다.

HWP5 신규 삽입은 5.0.3.0 이상5.1 미만, 필드 없는 구역의 최상위 본문 문단에 한정한다. 삽입 문단은 원문 CR과 선행 secd/cold 외 컨트롤 및 범위 의미를 거부한다. 따라서 기존 그림·차트가 같은 문단에 있는 두 번째 삽입은 현재 범위 밖이다. 원래 문서 버전을 올리지 않는다. 원본 스트림·비대상 리소스·이력은 보존하며 후보 생성·검증 뒤에만 live 값을 교환한다.

HWPX는 기존 own XML 그림 serializer, ZIP/OPF 저장과 parked-document History를 재사용한다. Native 소유권과 저장 전후 target remap 영수증을 검증한다. 패키지 전체 ID와 리소스 이름을 예약하며 최상위 본문 소속을 재검사한다. 필드·보호·중첩 셀·캡션 대상은 허용하지 않는다. 원본 ZIP 부품은 기존 저장 경로로 보존한다. 이미 존재하는 알려진 인라인 앵커의 보존 범위는 공통 writer 계약을 따른다.

## 지원 판정과 남은 검증

read-only, 부분 문서, HistoryV2 부재, 문서 교체·선택 변경·잘못된 UTF16 경계, 보호 문서, 지원 밖 버전은 거부한다. UI의 settled/IME/caret 증거는 기존 Surface lease를 재사용한다. HWP5 Surface의 기존 차트 허용식에 그림 capability만 추가한다.

삽입은 조판 변경이다. 기존 기본 저장의 `LayoutReflowRequired` 가드를 유지한다. Native 내부 후보 검증과 집중 시험의 명시적인 stale 직렬화는 일반 저장의 자동 허용이 아니다. 혼합 그림 본문의 엄격 재조판·기본 저장 성공은 아직 해결하지 않았다. 사용자의 명시적인 보존 저장 선택은 기존 정책을 따른다.

새 focused8은 H5 PNG 저장·재열기·undo/redo와 기본 가드, 거부 후 redo, 원문·접두부 거부, 양방향 차트/그림 리소스 격리, HX 빈 본문 anchor 저장·재열기·undo/redo, HX 실패 후 redo, metadata wire 거부, PNG CRC 거부다. 같은 root에 기존 H5 차트 integrated5를 변경 없이 등록한다. `zig build test-live-image-insert` 또는 인계 계약의 직접 focused 명령으로 선택할 수 있다. 현재는 소스 등록만 확인했다.

추가 실제 검증은 JPEG 원본 fixture와 디코딩, Unicode·다중 문단, 보호/버전/셀 거부, allocation 실패 원자성, Native ABI, 새 공식 WASM/SDK, 제품 파일 선택기→삽입→undo/redo→명시적 저장→직접 재열기다. 기본 저장 차단을 성공으로 바꾸거나 구형 WASM에 기능이 있는 것으로 등록하지 않는다. 공식 한글 수용·배포는 별도다. 레퍼런스 구현과 비공개 expected JSON은 사용하지 않는다.
