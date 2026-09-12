# OLE 내부 컨테이너

## 책임과 지원 경계

`hwp5/ole/envelope.zig`는 이미 압축 해제된 BinData의 명시적 raw_cfb 또는 observed_size_prefix 배치를 처리합니다. 후자는 선두 u32 little-endian 값이 남은 전체 바이트 길이와 정확히 같아야 합니다. 잘림·후행 바이트를 허용하거나 다른 배치로 재시도하지 않습니다. 반환 슬라이스는 입력을 빌립니다. 빈 payload의 프레이밍 성공은 CFB 성공이 아닙니다.

`hwp5/ole/container.zig`는 그 결과를 기존 CFB File.open으로 전달하며 strict 검사를 강제합니다. 별도 CFB 파서·시그니처·섹터 규칙을 복제하지 않습니다. max_input_bytes는 접두사를 포함한 전체 decoded 입력에 적용하고, 나머지 CFB 자원 한도도 전달합니다. 반환 File은 입력과 독립적으로 소유되며 호출자가 deinit해야 합니다.

현재 독립 Zig API와 비공개 WASM 시험 연결만 구현했습니다. HWP 컨테이너의 BinData 순회에 자동 연결하지 않았습니다. OLE 참조의 ordinal→저장 경로 해결, 내부 Contents/OlePres/Workbook/Package의 의미 해석, 차트 스키마, OLE 실행, 재귀 열기, 편집·저장은 완료하지 않았습니다. 제품 JS 공개 API도 변경하지 않습니다.

## 명세와 표본

공개 문서의 4.2.3 표 18은 BinData 압축을 항목별로 정의합니다. 3.2.5에 덧붙은 레거시 구현 메모의 무조건 DEFLATE·실패 시 원본 재시도는 채택하지 않습니다. 4.3.9.6은 차트의 내부 Compound file과 Contents/OOXMLChartContents를 설명하지만 4바이트 envelope를 모든 버전의 규칙으로 확정하지 않습니다.

루트에서 `node tests/hwp5/ole-container-survey.mjs`로 재현합니다. 두 fixture 디렉터리를 재귀 조사한 584개 경로는 고유 파일 내용의 수가 아닙니다. HWP5 fingerprint 관측 482개, 기존 strict CFB 거부 73개, 비-CFB 29개였고, 관측 문서 중 보안 플래그 7개는 제외했습니다. 전체 HWP5 헤더/본문 의미 검증 결과로 해석하지 않습니다.

DocInfo STORAGE 또는 extension OLE인 항목 52개를 선택했습니다. STORAGE의 관측 선택적 extension 배치를 읽고 정확한 저장 경로만 조회했습니다. 모두 압축 모드 0(파일 기본값 따름)이었고, 각 항목 규칙에 따라 Node raw DEFLATE를 적용했습니다. 누락 경로·압축 오류는 없었습니다. 52개 모두 정확한 크기 접두사 뒤 CFB였고 내부 strict 검사도 모두 통과했습니다. raw CFB의 실제 표본은 이번 조사에 없었습니다.

관측 스트림 이름에는 Contents 43, OOXMLChartContents 42, Workbook 4, Package 3, 대문자 CONTENTS 1이 포함됩니다. 존재 횟수는 콘텐츠 의미 검증이나 이름별 대체 규칙의 증거가 아닙니다. 본문 참조가 없거나 DocInfo에 없는 물리 스트림은 이 52개에 포함하지 않습니다.

## 초기 검증과 남은 검증

네이티브는 접두사 모든 짧은 길이, 선언 크기의 여러 비영 바이트와 상하한, borrowed 슬라이스, v3/v4, 알려지지 않은 스트림 보존, 전체 입력/내부 스트림 한도, 강제 strict, 정상·실패 경로 OOM 및 명시적 할당 회계를 검사합니다. 초기 OOM 시험에서 테스트가 OutOfMemory를 LimitExceeded로 기대하던 문제를 수정해 OOM을 전달하도록 했습니다. 세 모드 OLE 필터는 각각 root 포함 9/9 통과했습니다.

비공개 mode 306은 layout u8 뒤 decoded BinData를 받아 strict CFB를 열고 보유 CFB 원본 바이트를 복사해 반환합니다. limit 인자는 envelope 바이트 한도입니다. Debug 실제 WASM은 위 52개에서 두 배치 정상 104건과 한도·크기·잘림·정책·strict 오류 676건을 통과했습니다. 오류 뒤 정상 입력 복구도 검사합니다. raw 배치는 실제 표본의 접두사를 제거한 파생 입력이며 원시 형태의 실제 HWP 표본으로 세지 않습니다.

ReleaseSafe/ReleaseFast 실제 WASM에서도 정상 104건·오류 676건을 각각 통과했습니다. 세 모드 모두 반환 CFB의 0/7/8/511/512/1024/마지막 위치를 개별 변형한 7개 응답을 검출했습니다. LimitExceeded를 같은 메시지의 WebAssembly.RuntimeError로 바꿔도 정상 오류로 세지 않고 assertion 실패했습니다. 이는 선택 위치의 검사이며 전체 출력 모든 바이트 변형 검사는 아닙니다.

별도 소스 복사본 `/tmp/hwpjs-ole-container-mutants.9SfsP1`에서 선언 크기 비교를 `!=` 대신 `>`로 변경(size), strict 해제(strict), 접두사를 제거하지 않고 전체 입력 반환(borrow)을 시험했습니다. 각 변형은 세 모드 모두 실제 테스트 실패·종료 코드 1로 검출됐습니다. borrow는 이름과 달리 메모리 소유권 변형이 아니라 슬라이스 시작 위치 변형입니다. 제품 소스는 변형하지 않았습니다.

같은 별도 복사본의 leak 변형은 내부 CFB reader의 실패 시 arena 해제를 제거했습니다. 세 모드 모두 OLE 컨테이너 테스트의 OOM 주입에서 MemoryLeakDetected로 실패했습니다(종료 코드 1). ReleaseFast도 실패했으며, 컴파일 오류가 아닙니다. 정상 코드의 명시적 allocator 잔량 검사는 위 네이티브 테스트에 별도로 포함됩니다.

소스·테스트를 고정해 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. `/tmp/hwpjs-ole-container-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·988/988 네이티브 테스트·HWP/WASM 7,841,966회 검사 통과와 종료 코드 0을 확인했습니다. 포맷·JS 구문·공백 검사와 변경 문서의 로컬 링크 12개 검사도 통과했습니다. 이 결과는 독립 OLE 컨테이너 코어의 검증이지 HWP 컨테이너 순회 연결이나 내부 콘텐츠 의미 검증 완료가 아닙니다.

최종 `zig build test --summary all`은 5/5 단계·988/988 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).
