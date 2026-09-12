# 관측 Legend와 Font 이름 재참조

## 지원 범위

`chart/legend.zig`는 관측된 inline VtChartLegend v1을 Font v1, 원시 10바이트, 기존 ChartSection v1으로 조립합니다. Font 이름만 [객체 목록](hwp5-chart-object-table.md)을 통해 새 String/기존 String 참조를 구분합니다. Legend·Font·배경 객체 자체의 재참조나 그림 데이터가 있는 Picture는 아직 지원하지 않습니다. 렌더링·저장·모든 차트 버전 지원을 의미하지 않습니다.

공식 차트 revision 1.2의 3.35 Legend 표와 [앞선 재참조 실측](hwp5-chart-footnote.md)을 대조했습니다. API 속성 표를 wire 순서로 해석하지 않았으며 원시 값에 표시 여부/좌표 등의 뜻을 임의 부여하지 않습니다. 다음 Plot 마커를 검색해 종료 위치를 정하지 않습니다.

## 책임 분리와 수명

기존 Font의 readObservedV1은 inline 이름 계약을 유지합니다. 새 readObservedWithObjects는 같은 읽기 본문을 공유하되 이름만 객체 목록으로 해석합니다. Font.name_introduced에 새 정의 여부를 보존하며, 기존 inline 경로는 true입니다. Font 원시 14바이트와 기반 타입 읽기를 다시 구현하지 않습니다.

Legend는 새 Legend/Font ID와 ChartSection의 Backdrop·Fill·Picture ID를 객체 목록에 등록합니다. 앞선 정의와 충돌하면 거부합니다. 이름이 이미 있는 String을 참조하는 것은 중복 정의가 아니므로 허용합니다. 알려진 비문자열이나 현재 Font/Legend를 이름으로 참조하면 거부합니다.

문자열은 등록된 원본 버퍼를 빌리고 원시 필드는 복사합니다. 입력과 두 목록의 수명은 호출자가 소유합니다. 실패 시 외부 reader는 유지하지만 타입/객체 목록이 갱신됐을 수 있어 둘 다 폐기해야 합니다. 문자열이 참조였어도 필드 길이 상한은 검사합니다. 저장량·객체 수 상한은 객체 목록의 단일 규칙을 재사용합니다.

## 비공개 검증 연결

Mode 316은 이름 바이트 상한·객체 개수 상한·저장 String 합계 상한 u32 세 개와 Contents를 받습니다. 별도 limit은 Contents 길이 상한입니다. 기존 격자·첫 Backdrop·Footnote를 읽고 확인된 셀/배경/Footnote 객체를 등록한 뒤 Legend를 읽습니다. 의미 미확정인 root/grid prefix 숫자를 객체 ID로 추정해 등록하지 않습니다. 따라서 모든 차트 객체의 전역 동일성 검증을 완료했다고 주장하지 않습니다. 공개 JS 문서 API의 자동 차트 라우팅도 변경하지 않았습니다.

응답은 end·Legend ID·Font ID·이름 ID·새 정의 여부·이름 길이·이름 후속 값·객체 수·저장 String 바이트 합계 u32 아홉 개, 배경 세 ID u32, Fill 후속 u16, Font/Legend/Section/Backdrop/Fill/Picture 원시 14/10/26/50/34/4바이트, 이름 원본 순서입니다. 첫 표본은 204바이트이며 이름 길이에 따라 변합니다.

## 실측과 적대적 검증

43개 원본 중 이름 재참조 41개, 새 이름 정의 2개를 구분했습니다. 전자는 앞선 Footnote 이름 객체를 사용하고, 후자는 16/22바이트의 새 이름입니다. 세 모드 전용 WASM에서 각각 정상 258건·오류 11,211건을 통과했습니다. 원본 종료 뒤 VtChartPlot 선언을 별도 확인했으나 그것을 파싱 종료 규칙으로 사용하지 않았습니다.

정상 변형은 원시 필드·이름 원본/후속 값 변경, 원본 정의의 문자열 길이 0/1/65,535, 원래 글꼴 이름이 아닌 다른 유효한 이전 String ID 참조를 포함합니다. 따라서 특정 Footnote 이름 ID만 하드코딩한 복구가 아닙니다. 각 잘림/길이 변경에서 extent를 갱신합니다. 오류는 모든 바이트 잘림, 클래스/버전·타입 참조·잘못된 종류/null·중복 객체·Picture 참조와 독립 한도를 검사합니다. 거부 뒤 원본을 재호출하고 Error 생성자/기대 오류명이 모두 맞아야 통과시킵니다.

네이티브는 빈 타입 목록에서 시작하는 새 이름/이전 버퍼 이름 두 경우, 서로 다른 버퍼의 대여 수명, 개별·저장량·객체 수의 정확한 한도, 모든 잘림, 클래스/버전, 늦은 배경 ID 충돌과 OOM을 검사합니다. safety=true allocator로 성공/늦은 오류의 잔량 0을 확인합니다.

`/tmp/hwpjs-chart-legend-mutants.Z5WO8Y`에서 객체 조회 무력화(lookup), 참조 길이 한도 생략(cap), 참조에 저장량 재부과(recharge), 중복 정의 검사 생략(duplicate), 늦은 등록 전에 reader 변경(cursor), 다른 종류를 빈 문자열로 대체(kind), 객체 맵 해제 생략(leak), 배경 객체 등록 생략(legend_ids), Legend 원시 값 삭제(raw)를 주입했습니다. 아홉 변형 모두 세 모드에서 실제 assertion/MemoryLeakDetected 등 테스트 실패와 종료 코드 1로 검출했습니다. 27개 로그의 FAIL과 실제 테스트 프로세스 종료를 확인했으며 컴파일 실패를 검출로 세지 않았습니다.

첫 표본 응답 204바이트의 개별 XOR 1 변형과 같은 오류 메시지의 WebAssembly.RuntimeError 대체도 세 모드에서 모두 검출했습니다. 늦은 객체 맵 할당 OOM의 상태 보존을 보강한 후 소스·정규 테스트를 고정해 전체 회귀 검증을 실행했습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 27/27 단계, 네이티브 1,025/1,025개, HWP/WASM 8,023,979회 검사를 통과했습니다. 각 모드의 Legend 결과는 원본 43개(재참조 41개·새 정의 2개), 정상 258건·거부 11,211건입니다. 로그는 `/tmp/hwpjs-chart-legend-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 검사 횟수는 지원 범위나 모든 입력의 무결함을 뜻하지 않습니다.

전체 audit 이후 최종 `zig build test --summary all`은 5/5 단계·1,025/1,025개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. 변경 Zig/JS의 포맷·구문 검사, diff 공백 검사와 관련 문서의 로컬 링크 31개도 확인했습니다.
