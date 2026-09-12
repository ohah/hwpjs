# ValueBlock v1 조립

## 책임과 경계

`chart/value_block.zig`는 원시 u32와 VtValueBlock v1부터 선택 값, 선택 TextFormat, 원시 u16, 라벨 String, 원시 3바이트, TextBlock v2 기반 본문 끝까지 읽습니다. 앞선 배열의 다섯 null 슬롯과 이후 Axis 꼬리는 포함하지 않습니다. 배치 근거는 [값 블록 앞부분](hwp5-chart-value-prefix-evidence.md)과 [기반 본문 관측](hwp5-chart-value-text-evidence.md)입니다.

원시 u32는 객체 ID로 등록하지 않습니다. 실제 연속 Axis에서 65536이 반복된 반례가 있으므로 0만 허용하지도 않습니다. 선택 값은 null/String/Double이며 공통 값 객체 사전으로 신규 정의와 기존 참조를 구분합니다. TextFormat·라벨·TextBlock은 각 공통 파서로 위임합니다. 숫자는 부동소수점 연산 없이 비트 그대로 유지하고, 원시 필드는 복사하며 String은 입력 버퍼를 빌립니다.

필드 문자열 합계는 선택 String, 서식 코드, 라벨, 글꼴명, 본문 텍스트의 최대 다섯 필드를 계산합니다. 같은 String을 재참조하더라도 각 필드에서 다시 차감합니다. Double은 문자열 합계를 차감하지 않습니다. 객체 사전이 소유하는 고유 저장량 제한과는 별개입니다. 실패 시 Reader는 유지되지만 호출자는 타입·객체 사전을 폐기해야 합니다.

## 현재 검증

독립 합성 입력 생성은 `value_block_test_fixture.zig`, 검증은 `value_block_tests.zig`가 소유합니다. null·신규 String·신규 Double·기존 String·기존 Double의 다섯 종류와 서식 유무 조합을 검사합니다. 각 조합에서 offset 0/1/17/257, 정확한 끝 이후 데이터, 원시 비영 값, 숫자 NaN payload, 서식 코드와 글꼴명·본문 텍스트 별칭, 필드 합계의 정확한 한도 및 한 바이트 부족, 고유 저장량과 객체 개수의 정확한 한도를 확인했습니다.

모든 잘림 및 각 신규 타입의 클래스·버전 변형, 전체 OOM 주입, 정상/후기 오류의 safety=true 할당자 해제 회계도 검사했습니다. Debug·ReleaseSafe·ReleaseFast 각각 새 테스트 두 개와 루트 테스트가 3/3으로 통과했습니다.

`/tmp/hwpjs-value-block-mutants.jwKewM`에서 원시 헤더 삭제, 헤더의 잘못된 객체 등록, 참조/서식/라벨의 합계 차감 누락 각각, Reader 조기 반영, 원시 3바이트 삭제, 사전 해제 누락의 8종을 만들었습니다. 세 모드 모두 런타임 FAIL과 종료 코드 1로 검출했습니다(24회). 컴파일 오류를 검출로 세지 않았고 ReleaseFast 해제 누락은 정상/후기 오류 테스트 모두 MemoryLeakDetected로 실패했습니다.

## WASM 대조 구조

테스트 전용 mode 322에 ValueBlock 이전의 타입·String·Number 사전을 주입합니다. 범위는 값 객체와 해당 블록에서 새로 읽는 비문자열 객체이며, 이전의 모든 비문자열 객체 그래프를 검증하는 공개 ABI가 아닙니다. `chart-value-block-oracle.mjs`는 독립 Axis 관측값에서 입력 구간과 기대 응답을 계산하고, `chart-value-blocks.mjs`가 실제 corpus와 변형 검사를 담당합니다.

기반 TextBlock의 테스트 응답은 기존 mode 319의 직렬화 함수로 공유하고, 독립 기대 응답도 기존 본문 oracle의 함수로 공유했습니다. 소비 끝과 Backdrop 끝은 ValueBlock 시작에 상대적인 값으로 대조합니다. 문자열·숫자 참조의 종류/정의 여부/원시 값, 서식·라벨·본문·Backdrop 필드와 최종 객체 개수·고유 저장량까지 확인합니다.

Debug·ReleaseSafe·ReleaseFast WASM에서 실제 차트 43개, 블록 69개(숫자 선택 값 2개)를 대조했습니다. 각 모드 정상/변형 276건, 거부 25,326건이 통과했습니다. 모든 구간 잘림, 정확한 필드/저장 문자열·객체/입력 제한과 한도 미달, 신규 타입 버전, 끝 이후 데이터, 원시 헤더 변경 및 원시 필드 FF 변형을 검사했습니다. 매 거부 후 원본을 다시 확인합니다. 응답 첫 바이트 변조와 정상 오류를 같은 메시지의 WebAssembly.RuntimeError로 치환하는 변형은 세 모드 모두 AssertionError로 검출했습니다. 기존 mode 319 검사도 각 모드 69개 본문, 정상/변형 345건·거부 18,483건으로 통과했습니다.

정규 Debug·ReleaseSafe·ReleaseFast audit는 각 종료 코드 0, 27/27 steps, 1,044/1,044 native tests, 8,207,214 HWP/WASM checks로 통과했습니다. 로그는 `/tmp/hwpjs-value-block-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.

최종 기본 테스트도 1,044/1,044 tests, 5/5 steps로 통과했고 ReleaseSafe 제품 빌드는 5/5 steps로 통과했습니다. Zig 포맷·변경 JS 문법·문서 링크·diff 공백 검사도 통과했습니다.

이 결과는 선택된 ValueBlock v1 조립 범위의 검증입니다. 전체 Axis/차트 지원 완료를 뜻하지 않습니다.

## 다음 Axis 조립을 위한 ID 범위 점검

읽기 전용 추가 점검에서 같은 43개 차트의 그리드 비-null 셀, 초기 Backdrop, Footnote, Legend, Plot/Light 및 연속 Axis 172개의 관측된 신규 ID를 차트별 Map에 순서대로 등록했습니다. 총 3,671개 등록에서 충돌은 0개였습니다. Axis/기반 본문의 objectOffsets, 선택 값·서식 코드·라벨의 introduced, 서식 헤더 ID를 사용했고, 재참조 및 ValueBlock의 원시 header_word는 신규 ID로 세지 않았습니다. Plot 조사기가 미리 본 첫 Axis ID도 Plot 등록 목록에서 제외해 실제 Axis 경계에서 한 번만 등록했습니다.

이는 관측된 구간의 ID 충돌 점검이지 모든 객체의 발견이나 전체 객체 그래프 의미 검증은 아닙니다. 특히 Chart/DataGrid 앞부분의 미확정 원시 헤더와 마지막 Axis 이후 Plot 데이터는 범위 밖입니다. 다음 제품 Axis 조립에서는 기존 String/Number와 비문자열 객체 사전을 연결하고 이 범위를 제품 오류 경로로 검증해야 합니다.
