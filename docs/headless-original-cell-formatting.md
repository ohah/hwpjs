# 원본 표 셀의 헤드리스 서식

원본 HWP5/HWPX 표 셀 문단은 본문과 같은 source paragraph ordinal ABI로 문자 속성·문단 정렬을 변경합니다. 셀 좌표를 문단 번호나 node ID로 추정하지 않습니다. `validateSelection`이 `paragraphSelectionOwner`의 table/list 소유자와 토큰·뷰·문자 경계·편집 가능성을 검사한 뒤 `validateFormattingTarget`이 capability와 원본 참조를 확인합니다. HWP5는 `kind:original` 바인딩이 필요합니다. 생성 셀·생성 문단·출처 불명 참조·다른 셀 소유자는 허용하지 않습니다.

Canvas surface는 본문용 `row.selectionOwner`만 읽지 않고 같은 `paragraphSelectionOwner` 함수를 사용해 선택을 공개합니다. 원본 표 셀의 selectionOwner가 null이어도 검증된 tableCell의 table/list 소유권을 사용합니다. canonical 함수가 유일한 소유권 계산 출처입니다. 이 surface 연결은 현재 작업 트리 데모에 포함되며 source core 커밋과 전체 UI 패키지 게시를 구분합니다.

`packages/core/tests/integration/typed-cell-formatting.test.ts`는 실제 noori.hwp/hwpx의 원본 셀에서 문자 속성과 정렬을 각각 변경합니다. HWP5 독립 CFB/전체 레코드·DocInfo·메타데이터 보존 oracle, HWPX 독립 ZIP/전체 XML oracle의 일반/최적화 실행, 잘못된 기대값 거부, undo 원본 바이트·redo·재열기 동일성을 확인합니다. 다른 owner·stale view 거부 시 Native 호출이나 저장이 발생하지 않는 것도 검사합니다. 원본 한 셀씩의 검증이며 전체 표·모든 조판의 성공으로 확대하지 않습니다.

현재 참조 수명·선택적 ABI는 [HWP5 현재 참조](hwp5-sdk-current-references.md)가 소유합니다. 생성 셀/여러 셀에 걸친 서식은 이 확장의 완료 범위에 포함하지 않습니다. 원본 도형 글상자/캡션의 후속 지원과 검증은 [별도 주제](headless-drawing-text-formatting.md)를 따릅니다.

## 문단 모양 응답의 버전 경계

현재 Native 후보는 HPS2(72바이트 행)를 반환하지만 이전 source SDK 디코더는 HPS1(48바이트 행)만 받아 `InvalidParagraphShapes`를 남겼습니다. 이 경우 셀의 실제 정렬이 가운데여도 관측값은 부재였고, 가운데 정렬 요청은 정당한 no-op입니다. 독립 후보 검사에서 이를 새 편집으로 기대한 실패를 발견했습니다. 디코더는 signature로 두 버전을 엄격히 구분하고 정확한 길이·행 ID·enum·presence와 effective heading 일관성을 검사합니다. HPS1에 없는 heading 필드를 기본값으로 만들어 넣지 않습니다. HPS2의 packed/extended/effective heading 값과 명시 extended zero도 구분합니다. `tests/hwp5/paragraph-shapes-wire.test.mjs`의 4건은 두 버전·signed 필드·부재/0·오프셋 뷰·손상 framing과 모순된 heading을 검사합니다. Native serializer 계약은 `src/wasm/paragraph_shapes_wire.zig`입니다.

## 후속 실측

현재 작업 트리 패키지 173건과 타입 검사가 통과했습니다. 실제 제품 Canvas `demo-cell-formatting/2026-10-24T16-37-00-062Z`는 Vanilla/React/Svelte × 두 형식의 원본 셀에서 물리 선택·네 서식 동작·실제 다운로드·별도 WASM 재열기·undo/redo·재업로드 6건을 통과했습니다. 별도 WASM 재열기는 독립 CFB/XML 저장 oracle과 구분합니다. 초기 자동화의 glyph만으로 source row를 추측한 매칭 실패는 실제 caret의 section/paragraph와 원본 row·textarea 값을 대조하도록 수정했으며 실패 산출물은 보존했습니다. 모든 테스트 브라우저는 종료했습니다.

## 원본 표 셀 크기 UI

표 셀 문단의 문자/문단 서식과 셀 자체의 크기 변경은 별도입니다. UI는 현재 공개 선택을 검증한 뒤 원본 table/list/membership와 원 HWPUNIT 크기를 현재 state에서 읽고, 기존 공개 `requestExperimental`의 한 `cell-size` 또는 `table-column-width` 요청으로 연결합니다. 안정된 typed table API가 추가됐다는 뜻이 아닙니다. capability와 실제 canonical 공유 열 계획이 거부하면 명시 이유를 표시하며, 병합 셀의 영향 범위는 기존 계획기가 소유합니다. 선택/문서/undo/headless 변경 뒤 이전 모달을 새 셀로 재타깃하지 않습니다.

pt 표시는 기존 정확 정수 변환을 사용합니다. untouched 필드는 표시 문자열을 재해석하지 않고 원 정수를 그대로 보존하며, 명시0과 부재/null은 구분합니다. 단일 셀 wire가 두 크기를 모두 요구해도 변경하지 않은 값은 원값이고, 공유 열의 optional 높이는 실제 변경일 때만 포함합니다. 취소/no-op은 SDK 편집 요청을 보내지 않으며 접수 후 commit-refresh 또는 불확실 결과는 재접수하지 않습니다. 성공 뒤 선택 복원은 현재 state의 공식 `createParagraphSelection`과 stateVersion fence를 사용하는 selection-only 명령입니다.

명시 순수52개는 모달/포트의 HWP5/HWPX 계약과 stale/readonly/IME/pending/cleanup을 검사합니다. 모의 성공을 Native나 브라우저 검증으로 확대하지 않습니다. [정규 명령](development-commands.md#table-cell-properties-ui-tests)은 기존 호환 wire를 사용하는 포트·뷰·도구 시험이며 새 Native/SDK 빌드를 실행하지 않습니다.

별도 실제 SDK05·기존 d849·Noori HWP5/HWPX의 공개 선택→포트→기존 명령 검사에서는 원본 셀 높이를 12578→12678 HWPUNIT로 한 번 변경하고 undo1/redo1로 원값/변경값을 복원했습니다. 너비47907과 비대상39셀의 크기·membership·순서는 유지했습니다. 이 관측은 셀 전체의 모든 서식·CFB/XML 보존이나 전체 조판 동등성 증거가 아닙니다.

공유 열의 별도 실제 두 형식 검사에서는 기존 canonical 계획에 따라 3셀의 너비를5720→5820으로 바꾸고 undo1/redo1을 확인했습니다. 비대상37셀과 높이는 유지했지만 각 행의 총폭은48230→48330 HWPUNIT로 증가했습니다. 고정 총폭 재분배 기능을 입증한 것이 아닙니다. 공유 열 Native 기록은 순수52와 별도이며 HWPX 공유 열 UI·인쇄·정규 전체 strict 타입 검증은 이 UI의 완료 범위가 아닙니다. 셀 배경/테두리·병합/분할·행열 삽입삭제도 이 범위에 포함하지 않습니다.

### 셀 크기 UI와 다운로드의 확인 범위

Noori HWP5/HWPX 두 문서의 실제 UI 경로에서 높이 원값12578→12678 HWPUNIT의 적용·실행 취소·다시 실행·저장·새 Reader 재열기를 확인했습니다. 이것은 해당 단일 셀의 경로이며 공유 열 UI·병합 전체·모든 표의 지원 완료를 뜻하지 않습니다. 브라우저에서 Native 요청 횟수나 내부 이력 단계는 별도 계측하지 않았습니다.

실제 다운로드의 별도 독립 oracle은 HWP5의13개 CFB 스트림 이름 집합을 확인하고 대상 section의 지정 셀 크기만 원본에서 바꾼 기대 바이트와 전체 비교했습니다. 비대상 스트림 바이트는 모두 같았습니다. HWPX는 ZIP entry 목록·순서를 확인하고 대상 section 전체 XML 기대 트리와 나머지14개 entry 내용 바이트를 비교했으며 일반 실행과 Python `-O`에서 통과했습니다. 잘못된 높이12679는 양 형식에서 거부됐고 HWPX는 두 모드 모두 거부했습니다. 원본2개와 다운로드2개의 입력 SHA도 유지했습니다. CFB 물리 배치·ZIP 압축 바이트·전체 directory metadata·글리프/픽셀 동등성을 주장하지 않습니다.

표 대화상자는 HWP5에서 viewport 폭1280·320의 라벨·입력 실제 rect 겹침0과 화면 내 배치를 확인하고 PNG를 시각 검토했습니다. 이 두 폭의 현재 대화상자에 한정하며 모든 viewport·resize 과정·HWPX 시각 배치 전체 완료로 확대하지 않습니다. r3의 앞선 실패는 보존하며 r4 시각 확인과 구분합니다. 인쇄·OS IME·정규 전체 strict 및 세 기능 전체 완료는 이 검증의 범위가 아닙니다.

### 공유 열 UI와 저장본의 별도 검증

실제 R6 HWP5 첫 원본 표에서 너비57.2→58.2pt의 공유 열 적용·undo/redo·저장·새 Reader 재열기를 확인했다. 다운로드의 별도 독립 비교는 원본 table20/list21·31·51을 바인딩해 너비5720→5820 HWPUNIT와 높이2149/2294/2426의 정확 보존을 확인했다. 비대상37셀·전체40셀 높이·문단 소유권 바인딩은 유지됐다. 각 행 총폭48230→48330은 의도한 증가이며 고정 총폭 재분배가 아니다.

`compareCellSizeBatchSave`는 전체13스트림과 대상 section 전체 기대 레코드를 비교하고 잘못된 기대 너비를 거부했다. 입력 SHA는 전후 같았다. 이는 UI 동작·Native 실행·성능 증거와 별도인 저장본 검사이며 물리 CFB 배치·픽셀·전체 조판 동등성은 주장하지 않는다. HWPX 공유 열의 실제 UI/다운로드 검증으로 확대하지 않는다.

## 셀 테두리·배경 쓰기의 미지원 경계

고정 SDK05/Worker1f2/d849 감사에서는 원본 셀 테두리·배경색 쓰기를 연결하는 Native·wire·공개 target 경로가 없었다. `FormattingPatch`의 문자/문단 배경은 셀 전체 배경이 아니며, 기존 `cell-size`·`table-column-width`나 임의 experimental 요청을 색 쓰기로 확대하지 않는다. 읽기/표시 자원의 존재도 쓰기 지원을 뜻하지 않는다. 이 판정은 source·고정 asset·export 부분집합 감사이며 새 Native 실행이나 UI 성공 증거가 아니다.

최소 후속 단계는 현재 원본 단일 셀의 단색 배경과 명시 cell owner/membership 검증부터다. 공유 BorderFill은 clone-on-write로 새 자원을 만들고 대상 셀 참조만 교체하며, HWP5 DocInfo/LIST_HEADER와 HWPX header/cell 참조는 각 형식의 기존 자원·저장 SSOT가 소유해야 한다. 비대상 공유 자원·미지원 필드 보존, 단일 history batch, undo/redo·실패 원자성 및 독립 CFB/XML 저장·재열기를 먼저 검증해야 한다. 테두리 sparse patch는 그 뒤의 별도 범위다. 이 단계들은 아직 구현하지 않았다.

[공식 테두리 도움말](https://help.hancom.com/docs/ko-KR/mergedProjects/hoffice_hwp/topics/hancomoffice/hwp/table/cellborder/cellborder%28border%29.htm)은 선 종류·목록형 굵기·색·방향과 선택 셀/모든 셀 범위를 설명한다. [공식 배경 도움말](https://help.hancom.com/hoffice110/ko-KR/Hwp/table/cellborder/cellborder%28background%29.htm)은 색·무늬·그러데이션·그림 및 채우기 없음을 구분한다. [표 배경](https://help.hancom.com/docs/ko-KR/mergedProjects/hoffice_hwp/topics/hancomoffice/hwp/table/tableborder/tableborder.htm)은 여러 셀에 각각 같은 배경을 주는 것과 다르다. 채우기 없음은 흰색·alpha=0·필드 생략과 동의어로 확정하지 않았다. 데스크톱 도움말의 UI 의미를 WebHwpCtrl API나 HWP5/HWPX 저장 계약으로 승계하지 않으며, API 상세 필드·수치 단위·공통 기본값·투명색 인코딩은 미확정이다.
