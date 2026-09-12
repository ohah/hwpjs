# 관측 Footnote·ChartSection 조립

## 지원 경계

`chart/footnote.zig`는 명시적으로 선택한 VtChartFootnote v1/VtChartText v1 레이아웃을 [TextBlock v2](hwp5-chart-text-block.md)와 ChartSection v1으로 조립합니다. 이 관측 경로에서는 객체의 마지막 기반 타입 참조까지 소비합니다. 다른 버전·일반 객체 재참조·렌더링·편집/저장 또는 전체 차트 지원 완료를 뜻하지 않습니다.

HWP 명세의 차트 항목과 공식 차트 revision 1.2의 3.27 Footnote 표를 대조했습니다. 해당 표는 글꼴·텍스트·배치·배경 등의 API 속성 설명이며 wire 순서의 근거로 확대하지 않습니다. 이 구현은 원시 필드를 보존하는 구조 읽기이고 위치/표시 상태 등 의미 해석은 남아 있습니다.

## 책임과 순서

Footnote는 객체 ID·VtChartFootnote v1·VtChartText v1 참조를 읽은 뒤 기존 TextBlock을 호출하고, 별도 `chart_section.zig`를 호출합니다. ChartSection은 객체 ID 없는 기반 클래스 payload입니다. VtChartSection v1 타입 참조, 원시 26바이트, 기존 [Backdrop·빈 Picture](hwp5-chart-backdrop.md), 마지막 VtObject v1을 읽습니다. 객체 ID와 타입 ID를 혼동하거나 뒤쪽 Legend 마커 검색으로 종료 위치를 정하지 않습니다.

문자열/글꼴/원시 배경 필드를 연결 계층에서 다시 해석하지 않습니다. 타입 목록·클래스/버전 비교·객체 ID 비교·각 하위 파서의 한도는 기존 구현을 재사용합니다. Footnote·TextBlock·Font·이름 String·본문 String·Backdrop·Fill·Picture의 8개 ID 사이 중복은 공통 requireUnique로 검사합니다. 이는 Footnote 밖의 이전 격자/객체까지 포함한 전역 ID 레지스트리가 아닙니다.

TextBlock의 보조 참조는 null, Picture는 빈 데이터인 기존 관측 제한을 유지합니다. 미지원 참조를 기본값이나 빈 문자열로 대체하지 않습니다. 문자열 한도는 TextBlock 옵션을 그대로 전달합니다. 타입 수/이름 한도는 호출자가 소유한 Table, 전체 Contents 길이 한도는 호출자 책임입니다.

## 수명과 실패

반환된 Footnote는 하위 TextBlock 문자열만 입력을 빌리고 ID·원시 필드는 복사합니다. 별도 할당/해제가 없으며 입력을 유지해야 문자열을 사용할 수 있습니다. end는 마지막 Section 기반 참조 직후입니다. block.end·section.backdrop.end 등 하위 경계도 그대로 보존합니다.

실패 시 외부 reader는 유지됩니다. 타입 목록은 하위 파서에서 변경됐을 수 있으므로 호출자는 해당 목록을 폐기해야 합니다. 오류/OOM에서 커서와 타입 목록이 모두 롤백된다고 주장하지 않습니다.

비공개 probe 315는 개별/누적 문자열 한도 u32 두 개와 Contents를 받습니다. TextBlock probe와 `chart-footnote-prefix.zig`의 corpus 진입부를 공유하고 같은 타입 목록에서 Footnote를 읽습니다. 공개 JS 문서 API의 자동 라우팅은 변경하지 않습니다.

응답은 Footnote end·ID·Backdrop/Fill/Picture ID의 u32 다섯 개, Fill 후속 u16, Section 원시 26바이트, Backdrop/Fill/Picture 원시 50/34/4바이트, 기존 TextBlock 응답 순서입니다. 기본 표본은 284바이트이며 문자열 길이에 따라 변합니다. TextBlock 응답 serializer도 기존 probe와 공유하고 기대값은 독립 JS oracle로 만듭니다.

## 실측과 검증

실제 43개 모두 첫 Backdrop 뒤 Footnote 시작부터 436바이트를 순차 소비했습니다. 이후 선언 후보는 VtChartLegend였으며 이것을 별도 확인했지만 파싱 종료 규칙에 사용하지 않았습니다. ChartSection 타입 ID는 15가 41개, 14가 2개였습니다. 원시 26바이트는 첫 표본과 나머지 42개가 다릅니다. 이 값들을 타입 ID 상수나 영 패딩으로 강제하지 않습니다.

네이티브는 비정렬 시작·객체 ID 0·500부터 시작하는 타입 ID·입력 대여/복사 수명·모든 바이트 잘림·11개 타입의 클래스/버전·타입 수 한도·8개 ID의 모든 중복 쌍과 null·마지막 기반 타입 오류를 검사합니다. OOM 주입과 명시적 safety=true allocator로 성공/늦은 실패 해제 잔량 0을 확인합니다. 네이티브는 처음 선언하는 배경 타입, 실제 corpus는 이미 선언한 배경 타입의 재등장을 검사합니다.

WASM 검사는 원본·원시 필드·비연속 객체/새 타입 ID·문자열 길이 0/1/65,535 변형, 전체 Footnote의 각 바이트 잘림, 클래스/버전·기반 참조·모든 중복 쌍·null·Picture 참조·한도를 포함합니다. 잘림/문자열 길이 변경 시 extent를 갱신하고, 거부 뒤 원본을 다시 호출합니다. 정상 오류는 Error 생성자와 기대 오류명이 모두 일치해야 합니다.

전용 WASM은 Debug/ReleaseSafe/ReleaseFast 각각 43개·정상 301건·오류 21,199건을 통과했습니다. `/tmp/hwpjs-chart-footnote-mutants.WT1TpP`에서 원시 Section 삭제(raw), 마지막 기반 타입 생략(base), Section 클래스/버전 검사 생략(class), 바깥 객체 그룹 중복 검사 생략(duplicate), 실패 커서 변경(cursor), 호출자 타입 목록 해제 생략(leak)을 주입했습니다. 여섯 변형 모두 세 모드에서 assertion 또는 MemoryLeakDetected·종료 코드 1로 검출했습니다. 컴파일 실패가 아닙니다. 첫 표본 응답 284바이트의 개별 XOR 1 변형과 같은 메시지의 WebAssembly.RuntimeError 대체도 세 모드에서 모두 검출했습니다.

소스·정규 테스트를 고정한 뒤 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했고 최종 종료 코드는 0입니다. `/tmp/hwpjs-chart-footnote-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·1,019/1,019 네이티브 테스트·HWP/WASM 8,001,299회 검사와 chartFootnoteResults의 43/301/21,199를 확인했습니다. 포맷·JS 구문·공백, 관련 문서 로컬 링크 27개도 검사했습니다. 이 수치는 현재 검사 계약의 결과이며 전체 차트·전체 문서 지원 완료를 뜻하지 않습니다.

최종 `zig build test --summary all`은 5/5 단계·1,019/1,019 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).

## 다음 경계: 범례의 문자열 재참조

검증 중 별도 읽기 전용 조사로 다음 Legend의 Font 이름을 확인했습니다. 무조건 새 String 객체가 온다고 읽는 첫 가설은 세 번째 표본에서 실패했습니다. 43개 중 41개는 앞서 읽은 Footnote의 이름 String 객체 ID를 네 바이트로 재사용하며 타입 참조·문자열 본문·기반 참조가 다시 나오지 않았습니다. 기존 ID로 이름을 찾고 이어지는 Font 원시 14바이트와 VtObject를 대조하면 43개 모두 진행됩니다. 나머지 2개는 길이 16/22바이트의 새 이름 String을 저장합니다.

이 결과를 바탕으로 추가한 [Legend·String 재참조 구현](hwp5-chart-legend.md)은 별도 계약으로 관리합니다. inline String/Font 파서를 그대로 범례 전체에 적용하지 않습니다. 타입 ID 재등장과 객체 ID 재참조를 구분하며, 전체 객체 종류의 재참조·순환/전역 동일성을 구현한 것은 아닙니다.

읽기 전용 조사 출력은 `/tmp/hwpjs-chart-legend-reference-survey.json`에 있습니다. 예를 들어 내부 Contents SHA-256 `888c03ffd1e630417699b9a3b106ef680515a4e7be75482bea56e0b8e0dff3eb`의 offset 1419에 이름 ID 27이 있으며, 앞서 읽은 Footnote 이름 ID도 27입니다. 반면 `2e56516aabde4ff7cb73f946860e83c345d0944b0c11e0322f09b739cac1d56a`는 offset 1413에서 새로운 ID 34를 읽습니다(Footnote 이름 ID 27). 해시는 외부 HWP 전체가 아니라 내부 Contents 기준입니다.
