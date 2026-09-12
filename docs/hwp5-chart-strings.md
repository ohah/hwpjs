# 관측 차트 문자열 해석

## 계약과 SSOT

`chart/string_value.zig`의 readObservedDual은 호출자가 [셀 원본 문자열](hwp5-chart-grid-cells.md)의 관측 이중 인코딩 레이아웃을 명시적으로 선택한 경우에 사용합니다. 전체 차트의 자동 인코딩 판별기나 문서 본문 변환 API가 아닙니다.

첫 `00 00` 앞은 원본 legacy 바이트로 보존하고, 그 뒤부터 마지막 `00 00` 앞까지를 UTF-16LE로 해석합니다. 마지막 종결자와 UTF-16 바이트 길이를 검사합니다. 입력에서 UTF-16 시작 위치가 홀수여도 허용합니다. Unicode scalar 읽기와 surrogate 검사는 `src/text/scalars.zig`를 재사용하고 UTF-8 인코딩은 표준 라이브러리에 위임합니다.

CP949 해석·두 인코딩의 동일성 검사는 제품 함수에 넣지 않습니다. Unicode가 잘못되어도 legacy 인코딩으로 자동 대체하지 않습니다. legacy가 없다는 것과 Unicode 필드가 없다는 것을 구분합니다. 네 바이트 `00 00 00 00`은 두 부분이 모두 빈 유효 레이아웃이지만 `00 00`만 있는 입력은 Unicode 부분 부재로 거부합니다. CP949 단독 레이아웃과 다른 차트 버전은 아직 지원하지 않습니다.

UTF-8 결과에서 BOM, 일반/전각 공백, 내장 NUL, 탭·개행, 보충 평면 문자와 비문자를 삭제하거나 정규화하지 않습니다. max_bytes, max_utf8_bytes, max_scalars는 독립 상한입니다. 최대 입력과 출력 확장은 먼저 검사하고, 이미 만든 UTF-8 버퍼는 실패/OOM에서 해제합니다.

Text는 UTF-8 버퍼만 소유합니다. legacy_bytes와 utf16le는 입력을 빌리므로 호출자는 결과 사용 중 원본을 유지해야 합니다. utf16_offset은 원본 입력 기준입니다. deinit은 소유 UTF-8만 해제합니다. 같은 문자열을 다시 디코딩하거나 전역 캐시를 만드는 정책은 넣지 않았고, 여러 셀의 누적 디코딩/보관 예산은 상위 소비자의 책임입니다. 기존 Grid의 원본 값 보존 동작은 바꾸지 않습니다.

## 표본과 경계 검증

43개 Contents의 셀 배열에서 문자열 272개, 수치 427개를 조사했습니다. 문자열 총 바이트는 4,319이고 272개 모두 관측 이중 레이아웃으로 읽혔습니다. UTF-16 부분의 시작이 홀수인 항목은 27개였습니다. Node의 fatal UTF-16LE 디코더로 해석했으며 이 표본에서는 CP949 쪽과 모두 같았습니다. 이 일치는 관측 근거이지 제품이 두 부분의 일치를 요구하거나 모든 인코딩을 지원한다는 뜻이 아닙니다.

비공개 mode 312는 UTF-8 바이트·scalar 상한 u32 두 개 뒤 문자열 원본을 받습니다. 별도 limit은 원본 길이 상한입니다. 출력은 legacy 길이·UTF-16 offset·UTF-16 길이·scalar 수·UTF-8 길이 u32 다섯 개와 각각의 바이트입니다. 공개 JS API는 변경하지 않습니다.

세 모드 전용 WASM에서 각각 정상 547건·오류 2,176건을 통과했습니다. 실제 표본 원본과 고의로 다른 legacy 바이트, 합성 빈 문자열·BOM/공백/제어문자·보충 평면/비문자를 검사했습니다. malformed UTF-16, 잘못된 레이아웃, Unicode 부분 부재, 입력·출력·scalar 한도와 오류 후 원본 복구를 검사합니다. Node UTF-16LE 디코더는 ignoreBOM=true를 명시해 BOM을 그대로 대조합니다.

네이티브는 입력 변경 후 UTF-8 소유권, 원본 슬라이스 대여, 0/1/2/17/256바이트 legacy 길이, 최대 65,535바이트 입력, OOM 전부와 명시적 allocator 잔량 0을 검사합니다. 모든 잘림을 검사하되 내장 NUL에서 끝나는 별도의 완전한 짧은 프레임은 허용되는 것으로 구분합니다. 입력의 선언 길이가 바뀌지 않은 채 원본이 잘린 경우의 검사는 상위 셀 파서가 소유합니다. Debug/ReleaseSafe/ReleaseFast 모두 root 포함 5/5 통과했습니다. 초기 테스트의 @memcpy 원본 리터럴에 배열 타입이 빠진 컴파일 오류를 수정한 뒤 실행한 결과이며, 컴파일 오류를 파서 검증 성공으로 세지 않았습니다.

`/tmp/hwpjs-chart-string-mutants.AOsDDA`의 별도 소스에서 BOM 제거(bom), 홀수 시작 거부(alignment), UTF-8 출력 한도 제거(budget), 부분 UTF-8 해제 누락(leak)을 실행했습니다. 네 변형 모두 세 모드에서 실제 테스트 실패·종료 코드 1로 검출했습니다. BOM은 문자열 불일치, alignment는 InvalidChartStringLayout, budget은 ExpectedChartStringRejection, leak는 MemoryLeakDetected/할당 잔량으로 실패했습니다. 첫 표본의 출력 41바이트 각각을 XOR 1 한 변형과 같은 메시지의 RuntimeError로 바꾼 한도 오류도 세 모드 모두 검출했습니다.

소스·테스트를 고정한 뒤 별도 실행에서 xorshift32(seed 0x12345678)로 구성한 Unicode 문자열 1,000개를 세 모드에서 대조했습니다. 추가로 U+0000..U+10FFFF에서 surrogate 코드 포인트를 제외한 모든 유효 scalar 1,112,064개를 1,024개씩 1,086개 배치로 묶고 legacy 길이 0/1/17을 번갈아 사용해 Node의 UTF-8과 비교했습니다. 세 모드 모두 일치했습니다. 이는 모든 scalar의 해당 변환 대조이지 가능한 모든 문자열 조합이나 문서 형식 검증을 뜻하지 않습니다. 정규 audit 검사 수에는 포함하지 않은 별도 검사입니다.

추가 검사의 최초 실행은 shell here-document 임시 파일 생성 중 디스크 부족으로 실행되지 않았고, 이후 임시 파일을 만들지 않는 node -e 방식으로 위 결과를 얻었습니다. 당시 문서 갱신도 실패했으나 기존 문서가 보존된 것을 확인했습니다. 최초 전체 Debug audit는 종료 코드 0·27/27 단계·1,010/1,010 테스트로 끝났지만 상세 HWP/WASM JSON이 로그에 남지 않았습니다. 이 로그를 전체 상세 검증 기록으로 취급하지 않습니다. 사용자 승인 후 이 프로젝트의 재생성 가능한 .zig-cache만 삭제했고 소스·레거시 자료·검증 로그는 보존했습니다. 공간 복구 후 별도 recheck 로그로 전체 검증을 다시 실행합니다.

공간 복구 후 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 재실행했습니다. `/tmp/hwpjs-chart-strings-{Debug,ReleaseSafe,ReleaseFast}-recheck-audit.log`에서 각 모드 27/27 단계·1,010/1,010 네이티브 테스트·HWP/WASM 7,920,545회 검사와 chartStringResults의 정상 547건·오류 2,176건을 확인했습니다. Debug 실행과 뒤이은 두 최적화 모드의 순차 실행 모두 종료 코드 0입니다. 포맷·JS 구문·공백 및 문서 로컬 링크 20개 검사도 통과했습니다. 차트 문자열을 모든 문서의 텍스트 지원 완료로 취급하지 않습니다.

최종 `zig build test --summary all`은 5/5 단계·1,010/1,010 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).
