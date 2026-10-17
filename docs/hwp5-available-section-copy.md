# 저장된 구역의 명시적 편집 사본 후보

## 범위와 미완료 경계

기본 열기의 `SectionCountMismatch` 거부와 [읽기 전용 선택](hwp5-available-sections-preview.md)은 유지한다. `edit/available_section_copy.zig`는 호출자가 명시적으로 선택할 별도 편집 사본의 기반이다. 사라진 구역이나 원래 문서의 의도를 복원하지 않는다. native·선택 WASM·JS API·Worker·명시적 웹 선택까지 연결했으며 기본 WASM·외부 데모 배포는 아직 미완료다.

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

같은 새 후보의 API·Worker·기존 보정·읽기 전용·원본/버전·inventory·선택 UI 회귀를 함께 실행한 결과는 37/37·실패·skip 0이다. 이 묶음도 실제 브라우저 입력 검사는 아니다. 새 native ABI가 없는 기존 WASM에서는 사본 기능을 광고하지 않는다. 검증한 native·JS·Worker·UI 소스를 main에 통합하며, 기본 WASM·외부 데모의 artifact 승격과 전체 회귀 gate는 별도로 남긴다.

## 웹 선택·경고와 실제 브라우저 검증

정확한 불일치 오류와 capability가 함께 있을 때만 `저장된 구역으로 편집 사본 만들기` 버튼을 보인다. 클릭 후 별도 확인창으로 누락 내용 미복원·저장/undo 기준 변경·원본 불변을 알리고 취소 시 원래 파일과 선택을 유지한다. 승인 전 자동 열기나 읽기 전용 보기의 자동 편집 승격은 없다. 성공 후 선언/저장 구역 수와 사본 기준 경고를 계속 표시하며 일반 CFB 보정 경고와 구분한다. 다른 파일을 열면 경고·선택·저장 동의를 초기화한다.

`document-reopen-choice.mjs`가 읽기 전용/사본 선택의 File 수명·중복 클릭·generation·오래된 실패·close를 공유한다. 두 컨트롤 모듈은 각 정책·문구만 소유한다. 사본 메타데이터 검사는 기존 구역 inventory 검사기를 재사용한다. app은 옵션 전달과 표시만 담당하고 원본/사본 바이트를 편집 모델로 캐시하지 않는다.

정상 ABI 후보를 사용하는 실제 Chromium에서 원본 3개를 오류→사본 선택→승인으로 열어 118/23/2,614문단과 선언/저장 개수 경고를 확인했다. 첫 파일은 취소 후 다시 승인하고 실제 마우스로 Canvas의 편집 가능한 문단을 선택해 한글·이모지 입력, undo/redo를 했다. 재조판 동의 전 저장 거부, 직접 동의 뒤 다운로드와 재업로드 후 입력 문자열 유지도 확인했다. 독립 Python olefile/zlib 검사는 DocInfo 구역 수만 변경·다른 스트림 동일·편집하지 않은 문단 레코드 동일·새 문자열 정확히 1회를 확인했다. 정상 charshape.hwp로 전환 후 경고/버튼 숨김과 저장 동의 초기화를 확인했고 수집한 브라우저 오류는 없었다. 화면 캡처를 직접 확인했다. 전체 문단/구역의 Canvas 편집·OS IME·원본 조판 동치를 증명하지 않는다.

다운로드 자동화 명령이 활성 상태로 대기하던 동안 실제 페이지·버튼·동의 상태를 CDP로 확인하고 소유 페이지의 버튼을 실제 마우스 이벤트로 눌렀다. 기존 다운로드 핸들이 종료 0으로 완료됐으며 이 자동화 대기를 제품 저장 실패로 단정하지 않았다. 브라우저 close 후 daemon의 지연 종료까지 다시 확인해 active=false/pid=null, 임시 서버 listener 없음으로 정리했다. 다른 프로젝트의 브라우저 세션은 종료하지 않았다.

추가 반례로 기존 CFB normalization getter만 제거하면 사본 경고 메타데이터가 누락되는 실패를 재현했다. JS editor의 `supportsNormalizationInfo()`가 현재 열기 모드에 맞는 getter만 확인하게 하고 Worker가 이를 사용하도록 수정했다. 구형 getter가 없어도 사본 경고는 유지하고, 일반 문서는 메타데이터 부재 때문에 열기 실패하지 않는다. 실제 export를 제거한 회귀와 기존 검사를 포함한 최종 묶음은 41/41·실패·skip 0, 기존 기본 WASM 회귀는 16/16·skip 0이다. 정적 링크는 559모듈·평가 0개이며 브라우저 증거로 대신하지 않는다.

## 제어 표식이 있는 첫 문단의 Canvas 범위 검증

세 문제 원본의 저장 구역 4개 각각에서 첫 루트 문단의 제어 뒤·앞 텍스트를 Canvas 입력 큐로 편집했다. 기존 projection은 이미 해당 문단을 편집 후보로 제공했다. 문단 전체가 막혔다고 단정하거나 입력 허용 정책을 완화하지 않았다. 독립 CFB/레코드 oracle로 전체 변경 Section, 다른 스트림과 메타데이터 보존을 대조했다. 대기 입력 3개의 표시→원문 좌표·단일 요청 순서, 잘못된 삽입값 불일치 반례, 보호 표식 삭제 실패와 이전 redo 유지, 제어 내부 7위치 거부, 전체 undo/redo·재열기·원본 불변을 검사했다. 최초 원본이 아니라 구역 수를 고친 사본을 이력/다른 스트림 보존의 비교 기준으로 삼는다.

가장 오래된 5.0.0.6 파일의 첫 표시 문자열은 보호 표식 바로 뒤에 U+20DE 결합문자가 있다. 표시 위치 1은 grapheme 내부여서 caret 선택이 거부된다. 처음 이를 유효 경계로 가정한 검사가 실패했으며, 실제 결합문자와 거부를 확인한 뒤 위치 2/원문 9부터 입력하도록 검사를 고쳤다. native API의 코드 단위 경계와 Canvas의 grapheme 경계를 혼동하지 않는다. 다른 파일의 첫 경계는 실제 16바이트 제어 원문에서 독립적으로 확인한 8/16/24유닛이다.

새 Canvas/Worker/WASM 검사는 4/4·skip 0이며 관련 전체 회귀는 45/45·실패·skip 0이다. simulated DOM이므로 실제 브라우저와 구분한다. 별도 실제 Chromium에서는 hf_cross_section_inherit.hwp의 첫 루트 문단을 마우스로 선택해 입력창 활성화, Home/Delete의 제어 삭제 거부, 제어 뒤 한글·이모지 입력과 undo/redo를 확인했다. 전후 화면을 직접 검토했고 수집한 브라우저 오류는 없었다. 브라우저 active=false/pid=null, 임시 서버 listener 없음/exit143도 확인했다. 모든 문단·모든 제어의 UI 완료나 원본 조판 동치는 여전히 아니다.
