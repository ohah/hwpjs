# 관측 Backdrop와 빈 Picture

## 선택 범위

`chart/backdrop.zig`는 호출자가 확정한 inline Backdrop 위치부터 VtBackdrop·VtFill·VtPicture v1의 관측 레이아웃을 읽습니다. [셀 이후 조사](hwp5-chart-grid-tail-evidence.md)의 26바이트를 자동으로 찾거나 건너뛰는 제품 기능이 아닙니다. 전체 차트 버전 판별·스타일 의미 해석·그림 데이터 복호화·편집/저장은 아직 제공하지 않습니다.

공식 차트 revision 1.2의 3.4/3.11/3.26/3.28/3.53은 Picture·Backdrop·Fill·Frame·Shadow의 API 속성을 설명합니다. 그 표가 직렬화 바이트 순서를 정의한다고 가정하지 않았습니다. 특히 Picture 표에 Filename·Embedded·Map·Type이 있어도 아래 원시 필드에 그 이름을 임의 대응시키지 않습니다. 이번 43개 표본에서는 Frame·Shadow·Brush·Color 이름 마커가 해당 후속 영역에서 관측되지 않았습니다. 이것만으로 해당 속성이 없거나 지원되지 않는다고 결론 내리지 않습니다.

## 순서와 원시 보존

선택한 관측 레이아웃의 순서는 다음과 같습니다. 타입 선언/재등장은 기존 타입 목록을 재사용합니다. 숫자 타입 ID를 하드코딩하지 않습니다.

1. 객체 ID, VtBackdrop v1 타입 참조, 원시 50바이트
2. 객체 ID, VtFill v1 타입 참조, 원시 34바이트
3. 객체 ID, VtPicture v1 타입 참조, 원시 4바이트, 관측 null 참조 u32=FFFFFFFF
4. VtObject v1 타입 참조, Fill 후속 원시 u16, VtObject v1 타입 참조 두 개

세 객체 ID와 원시 필드는 복사해 반환합니다. API 속성 이름을 추측해서 부여하거나 수치를 정규화하지 않습니다. 관측 null 참조가 다른 값이면 UnsupportedChartPictureData로 거부합니다. 실제 그림이 있는 변형의 길이를 모르는 상태에서 같은 폭으로 계속 읽지 않습니다. 세 inline ID 중 null 또는 서로 중복인 ID는 UnsupportedChartObjectReference입니다. 이전 셀이나 다른 객체와의 전역 객체 동일성/재참조는 호출자가 별도로 관리해야 하며 이 모듈의 지원 범위가 아닙니다.

성공한 end는 위 관측 블록 뒤의 위치입니다. 43개 실제 표본 모두 그 뒤에서 VtChartFootnote 선언 후보가 관측됐지만, 이번 파서는 Footnote를 읽지 않습니다. 고정 관측 폭을 모든 작성기·버전의 일반 객체 경계로 확대하지 않습니다.

## 소유권과 실패

결과는 입력을 빌리지 않으며 별도 해제가 필요 없습니다. 타입 목록은 호출자가 소유하며 타입 이름 할당·개수·바이트 제한은 기존 Table이 담당합니다. 실패 시 입력 커서는 유지됩니다. 단, 실패 전에 타입 목록에 새 선언이 추가됐을 수 있으므로 호출자는 오류 후 해당 목록을 폐기해야 합니다. 커서와 타입 목록 모두 롤백된다고 주장하지 않습니다.

비공개 probe mode 313은 기존 셀 파서 결과의 타입 목록을 재사용하고, 명시적으로 관측 전이 26바이트를 소비해 Backdrop을 호출합니다. 오류·OOM에서도 Grid를 해제합니다. limit은 전체 Contents 바이트 한도입니다. 출력은 end u32, 세 객체 ID u32, Fill 후속 u16, 전이 26바이트, 원시 Backdrop 50바이트·Fill 34바이트·Picture 4바이트로 총 132바이트입니다. 공개 JS 문서 API나 자동 차트 검사는 변경하지 않았습니다.

## 검증 기록

독립 JS oracle은 셀 끝에서 타입 선언과 기반 참조를 순차로 확인해 기대 출력을 만듭니다. 실제 43개에 대해 원본·원시 필드 변경·비연속 타입 ID 변경, 전이 이후 모든 바이트 잘림, 입력 한도, 각 클래스/버전, Picture 참조, 기반 타입, null 객체 ID를 검사합니다. 오류 후 원본을 다시 호출해 상태 오염을 검사합니다. 정상 오류 판정은 Error 생성자와 오류명이 모두 일치해야 하며 WASM trap은 성공으로 세지 않습니다.

네이티브는 비정렬 위치·ID 0·비연속 객체/타입 ID·입력 변경 이후 원시 결과 유지·모든 잘림·잘못된 참조/클래스/버전·타입 개수 제한·OOM 주입을 검사합니다. 성공과 실패 경로 모두 safety=true allocator로 해제 잔량을 확인합니다.

Debug/ReleaseSafe/ReleaseFast 전용 WASM에서 각각 실제 43개·정상 129건·오류 8,944건을 통과했습니다. ReleaseFast 빌드가 끝나기 전 실행한 첫 호스트 호출은 파일 부재 ENOENT였으며 파서 검증으로 세지 않았습니다. 해당 빌드의 종료 코드 0 확인 후 다시 실행해 통과했습니다.

`/tmp/hwpjs-chart-backdrop-mutants.NxagsT`의 원시 Backdrop 삭제(raw), Picture 참조 검사 생략(picture), 실패 커서 변경(cursor), 호출자 타입 목록 해제 생략(leak) 변형 모두 세 모드에서 assertion 또는 MemoryLeakDetected·종료 코드 1로 검출했습니다. 컴파일 실패가 아닙니다. 첫 표본의 응답 132바이트를 한 바이트씩 XOR 1 한 변형과 같은 오류 메시지의 WebAssembly.RuntimeError 대체도 세 모드에서 모두 검출했습니다.

소스·테스트를 고정한 뒤 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했고 최종 종료 코드는 0입니다. `/tmp/hwpjs-chart-backdrop-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·1,013/1,013 네이티브 테스트·HWP/WASM 7,938,562회 검사, chartBackdropResults의 43/129/8,944를 확인했습니다. 포맷·JS 구문·공백과 관련 문서 로컬 링크 23개도 검사했습니다. 전체 검사 수는 현재 검사 계약의 결과이며 모든 차트 속성이나 전체 문서 구현 완료를 뜻하지 않습니다.

최종 `zig build test --summary all`은 5/5 단계·1,013/1,013 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).
