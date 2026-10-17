# 저장된 구역의 명시적 편집 사본 후보

## 범위와 미완료 경계

기본 열기의 `SectionCountMismatch` 거부와 [읽기 전용 선택](hwp5-available-sections-preview.md)은 유지한다. `edit/available_section_copy.zig`는 호출자가 명시적으로 선택할 별도 편집 사본의 기반이다. 사라진 구역이나 원래 문서의 의도를 복원하지 않는다. native와 선택 WASM·JS API·Worker까지 연결했으며 웹 편집 버튼과 기본 WASM·외부 데모 배포는 아직 미완료다.

`prepare`는 원본을 변경하지 않고 소유 바이트와 `{declared,available}` 보고서를 반환한다. `open`은 이 사본으로 기존 Session을 열고 임시 바이트를 해제한다. 사본이 이력의 최초 기준이므로 전체 실행 취소도 원래 불일치 문서가 아니라 정규화된 사본으로 돌아온다. 공개 API도 이 사실과 누락 가능성을 별도 옵션·메타데이터로 전달한다. 기존 CFB 보정 동의로 구역 수 변경을 암묵적으로 허가하지 않는다.

## 책임과 불변 조건

- `docinfo/section_count.zig`가 기본/명시적 reader와 사본 생성을 위한 유일한 선언 필드 locator다. 기존 레코드 iterator·버전·Properties 길이 계약을 재사용하며 확장 헤더도 실제 payload offset으로 처리한다.
- Source의 명시적 읽기가 연속 저장 구역을 검사한다. 선언 0·상한 초과·구역 공백·기존 암호화 정책을 우회하지 않는다. 개수가 이미 같으면 `SectionCountAlreadyMatches`, 배포용 문서는 `UnsupportedAvailableSectionDistribution`으로 거부한다.
- 해제한 DocInfo에서 해당 UINT16만 고치고 기존 raw DEFLATE encoder와 CFB 단일 스트림 교체기를 재사용한다. 다른 모든 스트림의 바이트를 보존한다. 컨테이너 관리 영역과 DocInfo 압축 바이트의 동일성은 약속하지 않는다.
- 출력은 strict CFB와 기본 Source로 다시 검사한다. 편집 열기는 기존 Session 전체 파싱을 통과해야 하며 불완전 본문을 편집 가능으로 승격하지 않는다.
- fixture 경로·버전·해시·개수·문단 수는 `src/hwp5/testdata/section-count-fixtures.json`을 native와 JS 검사가 공유한다. 테스트용 생성기는 `test_section_count_fixture.zig`를 공유한다.

## 2026-10-18 검증

분리 소스의 집중 native Debug·ReleaseSafe는 각각 9/9, 실패·skip·누수 0이다. compact/extended 헤더, 14/26/27바이트 Properties, 중복·레벨·길이·꼬리 프레임·버전 오류, 기본 거부 유지, 할당 실패, 원본 불변, 비관련 스트림 보존, 사본 최초 기준 저장을 검사했다.

추가 적대적 검사로 선언이 저장 개수보다 작거나 큰 경우, 압축/비압축, 일반/확장 Properties 헤더의 8개 조합을 사본 생성 전체 경로로 검사했다. 이 검사를 추가한 probe의 ReleaseSafe 실행은 간접 import된 기존 회귀까지 205/205 통과했다. 전체 프로젝트 native 실행과는 별개다. 같은 추가 검사를 포함한 집중 Debug 실행도 10/10·실패·skip·누수 0이다.

실제 원본 3개는 118/23/2,614문단과 저장 구역 1/2/1을 확인하고 구역마다 편집했다. 저장·실행 취소·다시 실행과 입력 해시를 검사했다. 머리말/제어 마커가 앞선 문단에서는 기존 텍스트 token 위치를 선택했다. 루트 plain 문단만 있다고 가정한 최초 테스트의 `MissingPlainCopyTarget`을 편집 정책 완화로 숨기지 않았다.

별도 native CLI의 `prepare` 출력은 Python olefile/zlib와 별도 WASM CFB reader로 다시 검사했다. 세 원본 모두 전체 스트림 경로·DocInfo 외 크기/해시가 같고, 해제한 DocInfo는 독립 locator가 찾은 구역 수 2바이트 변경과 정확히 일치했다. 잘못된 개수와 잘못된 offset을 기대한 반례는 일치하지 않았다. 원본 기본 거부와 사본 기본 읽기, 파일 원본 불변도 확인했다. inventory 검사 2개를 포함해 5/5, skip 0이다.

사본 helper를 포함한 후보의 기본 reader 전수 대조는 975경로에서 전체 JSON 응답 944개 동일·같은 거부 5개·범위 밖 HWP3 26개였다. 후보 SHA256은 `25d509e90eea624c27de51ce9e5dae634a1047524d36de47c795c752bcb642dc`이다. 읽기 전용 API·Worker·구형 ABI·원본 검사·inventory 검사는 19/19, skip 0이다. 사본 helper는 WASM에 export되지 않았으므로 이 전수 비교가 사본 편집 전체나 웹 UI 검증을 대신하지 않는다.

재현 명령은 [개발·검증 명령](development-commands.md)이 소유한다. CLI·reference가 없으면 명시적 skip이며 통과로 세지 않는다. 제품 기본 빌드·전체 native·브라우저 검증은 별도 gate다.

## 차트 변경과의 결합 검사

별도 결합 소스 tree `fec23b13ebb72020d776c2cebcf9861ec952fa7e`의 ReleaseSafe 제품 빌드는 5/5 통과했다. WASM SHA256은 `a47e9a230d0611d680b544933203373d41fc82574cd510c8261884d4a8d3af97`이다. 기존 기본 artifact의 export 311개 이름·종류를 전부 유지하고 총 329개다. signature나 모든 동작의 동일성은 이 검사로 증명하지 않는다.

이 결합 소스의 집중 native는 10/10, 차트 Worker·UI 자동 검사는 26/26, native 사본 출력의 독립 oracle은 3/3 통과했다. 각각 실패·skip 0이다. 실제 브라우저 사본 편집이나 전체 native 완료를 뜻하지 않는다. 별도로 실행 중인 전체 native는 이전 차트 source tree의 검사이므로 결합 tree 전체의 성공으로 합산하지 않는다.

결합 후보의 기본 reader도 참조 975경로 전수를 완료했다. main native 기준 후보 대비 전체 JSON 응답 944개 동일·같은 거부 5개·HWP3 제외 26개다. 지원되지 않은 문서가 새로 지원된 수치가 아니라 기본 읽기 회귀 비교다.

위 API 추가 전 결합 후보의 공개 API·회귀 묶음은 77/77·실패·skip 0으로 종료했다. 이 결과를 아래 새 API 후보 전체의 검증으로 대체하지 않는다.

## 선택 WASM·JS 사본 편집 API

`createExperimentalHwp5Editor(wasm,input,{availableSectionCopy:true})`로 명시적으로 요청한다. 기본값 false이며 Boolean 이외 값과 `distribution:true` 또는 `normalizeObservedCfb:true`와의 결합을 거부한다. 별도 동의가 없는 기존 호출은 변경하지 않는다.

선택 native export는 `hwp5_edit_open_available_section_copy`, `hwp5_edit_available_section_copy_info` 두 개다. 하나라도 없으면 명시적 요청은 `Hwp5AvailableSectionCopyAbiUnavailable`이며 일반 열기로 대체하지 않는다. 정상 기본 편집에는 이 ABI가 필요하지 않다. 새 세션 전체 준비 성공 후에만 기존 세션·이력·보고서를 교체한다. 실패 재열기는 이전 상태를 유지하고 close나 성공한 일반 열기는 사본 보고서를 지운다.

이 모드의 `normalizationInfo()`는 `{normalized:true,historyBaseline:"available-sections-copy",deviations:null,sectionInventory:{declared,available,mismatch:true},missingContentRecovered:false}`를 반환한다. 보고서는 편집 모델의 복사본이 아니고 최초 사본 기준의 사실이다. 출력 buffer를 해제해도 사본 보고서는 유지한다. 예전 native normalization getter를 이 모드에서 직접 부르면 `AvailableSectionCopyBaseline`으로 거부해 원본 기준이라는 잘못된 응답을 막는다.

새 후보 SHA256은 `b44486466c21dcb5be480250f64e2c958a93ccbaa37831258a2a83f9cbd4c439`이며 앞 결합 후보 export 329개를 유지하고 두 개를 추가했다. ReleaseSafe 제품 빌드는 5/5다. 분리된 clean JS와 이 후보의 새 API·기존 CFB 보정 회귀는 12/12·실패·skip 0이다. 실제 문제 원본 3개에서 각 저장 구역의 첫 루트 문단에 기존 제어 뒤의 확인된 UTF16 좌표로 한글·이모지를 넣고 저장·재열기·undo 전체·redo 전체를 검사했다. 기본 거부, 원본 파일 불변, 잘못된 옵션, 각각 누락된 ABI, 과대 입력, 실패 재열기의 기존 변경/이력/보고서 보존, 일반 열기와 close의 보고서 초기화도 검사했다. 이 새 API의 Worker·브라우저 검증은 아직 아니다.

## Worker의 명시적 사본 열기

`load`의 별도 `availableSectionCopy:true`로만 요청한다. 읽기 전용 선택·배포용 동의·기존 CFB 보정 옵션과의 결합 및 HWPX 요청을 거부한다. 옵션은 기존 세션을 닫기 전에 검사한다. 사본 세션이 만든 strict baseline으로 표시용 reader를 열며, 생성 중 실패하면 임시 세션을 닫는다. 원본 bytes는 덮어쓰지 않는다. load만으로 편집 이력을 활성화하지 않으며 기존 `enable`을 거쳐야 저장·편집이 허용된다.

구역 수 불일치와 두 native export가 함께 있을 때만 `availableSectionCopyAvailable`을 응답한다. 자동 재시도나 일반 열기 fallback은 없다. 기존 저장 구역 읽기 전용 경로의 모든 편집 명령 거부도 유지한다. 사본 선언/저장 개수는 최초 baseline의 `normalizationInfo`로 전달하며 일반 reader 결과의 `sectionInventory`와 혼합하지 않는다.

분리된 clean Worker에서 새 실제 파일 편집·저장·undo/redo와 원본 불변, 잘못된 옵션의 기존 redo 보존, 두 ABI 각각의 누락과 기존 읽기 전용/구형 WASM 회귀는 13/13·실패·skip 0이다. 최초 검사는 성공 응답에도 `applied:true`가 항상 있다고 가정해 3개 실패했다. 기존 계약에서 applied는 실패/부분 적용 진단이고 성공에는 포함하지 않으므로 제품 응답을 바꾸지 않고 이력 revision 증가와 저장 바이트·undo/redo로 실제 변경을 검사했다. 브라우저의 별도 동의 버튼·경고·다운로드 UI 검증은 아직 미완료다.

같은 새 후보의 API·Worker·기존 보정·읽기 전용·원본/버전·inventory·선택 UI 회귀를 함께 실행한 결과는 37/37·실패·skip 0이다. 이 묶음도 실제 브라우저 입력 검사는 아니다. main에 연결한 선택 JS·Worker 경로는 새 native ABI가 없는 기존 WASM에서 사본 기능을 광고하지 않는다. native 구현은 여전히 별도 후보이며 전체 gate 뒤에 승격한다.
