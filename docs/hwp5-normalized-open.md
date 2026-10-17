# 명시적 CFB 보정본 편집 열기

`createExperimentalHwp5Editor(wasm, input, { normalizeObservedCfb: true })`는 알려진 CFB 관리 정보 편차를 복사본에서 보정한 뒤 기존 strict 편집 세션을 엽니다. 기본값 false이며 Boolean 외 값은 거부합니다. 배포용 HWP5는 기존 `distribution:true` 동의와 결합할 수 있지만 일반 문서를 배포용으로 취급하지 않습니다. HWP3 지원을 추가하지 않습니다.

`normalizationInfo()`는 `{normalized,historyBaseline,deviations}`를 반환합니다. strict 입력은 false/original/null, 보정 입력은 true/normalized/보정 내역입니다. root creation 값은 JS 정밀도를 잃지 않는 문자열로 제공합니다. 원본 입력은 변경하지 않으며, 저장·undo 기준은 보정본입니다. 원본 컨테이너의 byte-exact 저장이나 원본 조판 동치를 약속하지 않습니다. 새 레코드 의미를 합성하거나 부족한 구역을 생성하지 않습니다.

## 책임과 실패 경계

`normalized_open.zig`는 기존 `cfb/observed_repairs.zig`와 `Session.open/openDistribution`을 조합합니다. `text_source.cfb_limits`를 공유하므로 읽기·보정 열기의 입력/스트림 한도 값은 한 곳에서 관리합니다. 원래 strict로 유효한 입력은 재작성하지 않습니다. 관측 보정 대상 밖 오류·손상·한도·OOM은 그대로 거부합니다.

선택 ABI는 `hwp5_edit_open_normalized`, `hwp5_edit_open_normalized_distribution`, `hwp5_edit_normalization_info`입니다. 새 세션 준비가 성공한 뒤에만 기존 세션/이력을 교체하며 실패한 재열기는 이전 내용·이력·보정 내역을 유지합니다. close/성공한 일반 열기는 내역을 초기화합니다. 구형 WASM은 명시적 보정 요청에 ABI unavailable을 반환하며 일반 열기로 조용히 대체하지 않습니다. query 부재도 별도 오류이며 일반 저장/조회는 계속 사용할 수 있습니다.

JS decoder는 필수 편차 개수의 안전한 비음수 정수와 root creation의 canonical u64 문자열/안전한 숫자를 검증합니다. 이 메타데이터는 별도 편집 모델이 아니며 원본·이력의 두 번째 캐시로 쓰지 않습니다. Worker는 보정 ABI 존재와 원본 열기의 RepairedSourceUnsupported를 함께 확인합니다. 배포용 문서는 임시 probe를 닫아 편집 세션을 유지하지 않은 채 제한을 진단하며, load 응답을 편집 가능 상태로 승격하지 않습니다. 명시적 편집 시작에서만 보정 동의를 받고 true인 경우에만 옵션을 전달합니다. HWPX의 보정 옵션은 거부합니다. 브라우저는 저장/undo 기준이 보정본임을 표시하며 파일 reset은 동의 요구 상태를 지웁니다. 기본 데모 산출물 반영은 별도 gate입니다.

## 분리 검증 (2026-10-18)

기존 미커밋 보정 기능에서 native/선택 ABI/JS API와 직접 검사를 main 기반 사본으로 분리했습니다. 첫 빌드는 공유 cfb_limits 노출이 빠져 컴파일 실패했으며 상수를 복제하지 않고 같은 SSOT 추출을 포함한 뒤 다시 빌드했습니다. ReleaseSafe WASM SHA256은 `0f309f10e47ef1918d973c98af23d3629ab4568ba2fd7fb41c1acf88c77f1c59`입니다.

실제 일반/배포 문서·정밀도·실패 재열기·기본 거부·byte-exact strict fast path·15개 차트의 undo/redo와 3개 optional ABI를 제거한 음성 대조는 8/8·skip/실패 0·종료 0입니다. reference가 없는 별도 실행은 5통과/3skip/실패0이며 실파일 통과로 세지 않습니다. native 집중 검사는 Debug/ReleaseSafe 각각 2/2(root 포함)이고, 기존 strict fixture의 root creation만 17로 바꾼 입력에서 모든 할당 실패 지점·원본 불변·보정 후 원래 전체 바이트 복원·기본 strict 거부를 검사했습니다.

이전 글꼴 inventory의 제외 73경로를 이 사본의 JS와 WASM으로 다시 검사했습니다. 69개가 원값/전체 스트림 보존을 통과했고, 그중 67개는 첫 구역·첫 문단 prefix 입력, 변경 구역 전체/비대상 스트림의 독립 oracle 대조, 저장 재열기, undo/redo 바이트 검증을 통과했습니다. 입력 제한 2개·사용자 제외 1개·구역 수 불일치 3개를 성공으로 세지 않습니다. 기본 성공 집합 437개와는 별도 범위이며 임의 위치/구조/서식/UI/조판 전체 완료가 아닙니다. 기본 데모 WASM은 변경하지 않았습니다.

Worker/UI까지 분리한 같은 후보의 6개 파일 검사는 13/13·skip/실패0·종료0입니다. 첫 실행의 11/13은 배포용 read-only load에서 사전 진단 probe를 누락한 분리 오류였고, 새 ABI의 존재 여부와 실제 CFB 보정 필요성을 구분하지 못했습니다. 원래 작업 트리의 probe/close 경로를 함께 분리한 뒤 두 구형 ABI 반례를 포함해 재검사했습니다. 이 임시 세션은 보유하지 않고 load의 read-only/저장 거부를 유지합니다.

분리된 main 후보 서버의 실제 Chromium에서도 sample1-repro 3,192문단을 열어 동의 취소/승인, Canvas 한글·이모지 입력, undo/redo, 배치 동의 전 저장 거부와 직접 동의 후 다운로드를 확인했습니다. 내려받은 변경 구역 전체와 다른 스트림 14개는 독립 oracle과 일치했고 재업로드 후 편집 재시작·동의 초기화·보정 경고 해제를 확인했습니다. HWP5 5.0.5.0 배포용 hwp-3.0-HWPML 8,809문단도 별도 승인 뒤 무편집 저장의 전체 17스트림/배포 플래그 보존을 확인했습니다. 파일명만 HWP3처럼 보이는 HWP5이며 HWP3 구현이 아닙니다. 브라우저 오류 목록은 비었고 스킬에 따라 세션 active=false/pid=null, 임시 포트 58519 listener 없음/서버 exit143을 확인했습니다. 이는 해당 화면·명령 범위의 증거이며 OS IME·원본 조판·전체 위치 편집을 뜻하지 않습니다.

후속 적대적 검사에서 보정 내역 query ABI만 제거하면 기존 Worker가 보정 편집 capability를 켜는 실패를 재현했습니다. Worker는 열기와 내역 조회 ABI 둘 다 있어야 보정 편집을 제공하며, query 없는 명시적 요청도 세션을 만들기 전에 거부하도록 수정했습니다. 기존 13개와 이 추가 실제 Worker 반례를 함께 실행한 최종 결과는 14/14·skip/실패0·종료0입니다. 이 후속 가드는 위 브라우저의 정상 ABI 경로와 별도로 검증했으며 보정 내역 없는 편집을 UI에 제공하지 않습니다.

최종 7파일의 reference 없는 실행은 8통과/6skip/실패0이며 실제 fixture 통과로 세지 않습니다. 같은 후보로 기존 strict 성공 집합도 다시 조사해 HWP5 437경로·28,064모양, HWPX 435경로·29,804모양 모두 원값/무변경 저장 일치·오류0·종료0을 확인했습니다. 각 inventory의 이전 미확인 73/1경로는 strict 감사에서 제외하며 별도의 보정 조사와 혼합하지 않습니다. 5개 진입점의 정적 연결은 540모듈·평가0개이며 실제 실행 증거를 대신하지 않습니다.
