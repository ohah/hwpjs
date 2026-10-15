# 수식 결과 부분 치환 코어

## 현재 범위

`formula_result_override_splice.zig`는 명시된 구역/FORMULA begin 식별자의 현재 유효 표시 문자열에 UTF-16 시작/삭제 길이로 치환합니다. 계산 캐시나 원본 Sites를 직접 바꾸지 않습니다. 현재 표시 조회는 `formula_current_snapshot.readFlat`, 문자열 편집은 `text_site_edit.splice`, 최종 반영은 기존 `formula_result_override_edit.set`의 저장 검증 트랜잭션을 재사용합니다. 표시 byte 한도도 `formula_result_sites.max_display_bytes`를 공유합니다.

이력 명령·선택적 WASM ABI `hwpx_edit_splice_manual_formula_result`와 JS `spliceManualFormulaResult(section, beginElement, start, deleted, text)`를 연결했습니다. 전체 교체/부분 치환은 같은 native byte 한도 조회와 JS 문자열 검증 helper를 공유합니다. Worker·Canvas는 아직 연결하지 않았습니다. 생성 표/구조 편집 상태의 거부 정책은 기존 수동 결과 setter와 같으며, 이 기능으로 해당 상태를 지원한다고 주장하지 않습니다. Canvas 연결 전에는 문단 선택 범위를 정확한 결과 소유자와 현재 표시 좌표로 판별하는 native query가 필요합니다. JS에서 필드 문자열이 같다는 이유만으로 소유권을 추측하지 않습니다.

## 검증

전용 진입점은 `src/hwpx_formula_result_splice_tests.zig`이며 root에서도 import합니다. `zig test src/hwpx_formula_result_splice_tests.zig -O ReleaseSafe --test-filter 'HWPX partial manual result splice'`는2/2·exit0입니다. 합성 원본의 전체 할당 실패 지점, no-op의 override 미설치, 서로게이트 절단/XML NUL/위치 overflow/잘못된 식별자 거부 후 저장 불변, 전체 삭제·빈 결과 재열기를 확인했습니다. 실제 chart13필드 각각의 Unicode 접두 입력·저장·재열기·source LastResult 보존과 입력 bytes 불변도 검사했습니다. 실제 fixture 소유 할당자는 안전/누수 검사가 켜진 공통 checked scope를 사용합니다.

첫 OOM 실행은 임시 descriptor 배열의 errdefer와 Sites deinit이 겹쳐 fail_index574에서 이중 해제를 검출해exit1이었습니다. descriptor 배열은 text 복사 실패에만 직접 해제하고 Sites 구성 후에는 Sites에만 해제 책임을 두도록 수정했습니다. 같은 실패 주입 재실행1/1 및 실제 fixture 추가 후2/2가 통과했습니다. 최초 실패를 통과로 소급하지 않습니다.

이 검사는 독립 XML/ZIP 검사·공개 API/이력·실제 브라우저/IME·전체 root gate를 대신하지 않습니다. 기존3947개 전체 바이너리는 이 모듈 등록 전 산출물이며 새2개를 포함한 것으로 해석하지 않습니다.

## 공개 API 연결 후 검증

[바깥 텍스트와 표시 보존](hwpx-formula-exterior-display-preservation.md)은 수식과 무관한 prefix 편집 시 source 표시 provenance를 유지하는 별도 호출 경로의 누락·검증을 소유합니다.

Canvas 선택용 [현재 결과 좌표 조회](hwpx-formula-result-targets.md)는 별도 모듈/검증이 소유합니다. 부분 치환은 이 조회가 정한 결과-local 좌표에서 재사용하며 Worker/Canvas 연결은 아직 남아 있습니다.

ReleaseSafe 제품5/5·exit0 후보 SHA256은 `d7ce1c2cc04845b77190943a3190a82331bacfc9e5ae6630983ca35b762f0c14`입니다. 격리 사본의 새부분치환/전체교체/Worker/edge4파일은20/20·fail/cancel/skip0·exit0(21081.514459ms)이며 로그는 `/tmp/hwpjs-manual-result-publication.ervxKq/manual-splice-public.log`입니다. 실제13필드 각각의 prefix·독립 전체 XML/ZIP 일반/-O/5변조·캐시 보존·undo/redo·재열기 후 부분 삭제와 no-op revision/redo 보존을 포함합니다. 서로게이트 절단/XML/byte 한도/식별자/좌표 거부 뒤 저장·revision·redo도 검사합니다. 이 시점 이후 추가한 선택적 ABI 누락2회귀는 이20개에 소급하지 않습니다.

이 후보는 별도 `zig-out/manual-splice-api/bin/hwpjs.wasm`이며 작업 트리의 기본 WASM은 바꾸지 않았습니다. 실행 중인 전체native3bc44b는 부분 치환 함수/2테스트는 포함하지만 새 이력 명령/ABI 연결 전에 컴파일한 바이너리입니다. 해당 전체 실행을 새 연결의 전체 native 검증으로 해석하지 않습니다.

후속 `--test-name-pattern='partial manual result missing'` 실행은 새 splice export와 공통 표시 한도 export를 각각 제거한2/2·fail/skip0·exit0(185.113625ms)입니다. 두 경우 모두 명시적 ABI 거부·저장 원문·history revision 불변을 확인했습니다. 필터로 선택한2개 결과이며 해당 파일의 나머지 테스트 실행이나 전체27파일 검증으로 해석하지 않습니다. 부분 치환 파일은 build의 HWPX 공개 목록에도 등록했습니다.
