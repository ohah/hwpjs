# 관측 차트 TextBlock·글꼴·문자열 객체

## 범위와 책임

이 문서는 `chart/text_block.zig`의 기존 readObservedV2 계약과 검증 이력입니다. 호출자가 확정한 VtTextBlock v2 위치에서 Font v1·두 inline String v1 객체를 조립합니다. 별도 readObservedWithObjects의 보조 객체·재참조 계약은 [확장 경로](hwp5-chart-text-block-objects.md)에 둡니다. Footnote 전체, 제목/범례/축의 전체 객체 그래프, 글꼴 선택·색상·배치·렌더링이나 저장을 구현했다는 뜻이 아닙니다.

HWP 명세의 차트 항목과 공식 차트 revision 1.2의 3.3 VtFont, 3.27 Footnote, 3.56 TextLayout을 대조했습니다. API 속성 표가 wire 순서를 정의한다고 가정하지 않았습니다. 원시 필드에 표시 여부·크기·좌표 등의 의미를 임의 부여하지 않습니다.

- `string_object.zig`: 객체 ID, VtString v1, 기존 cell_value의 길이/원시 문자열/후속 u8, VtValue v1·VtObject v1 기반 참조를 읽습니다. 문자 해석은 [별도 문자열 디코더](hwp5-chart-strings.md)의 책임입니다.
- `font.zig`: 객체 ID, VtFont v1, 이름 String 객체, 원시 14바이트, VtObject v1을 읽습니다.
- `text_block.zig`: 객체 ID·VtTextBlock v2, 원시 12바이트, 관측 null 보조 참조 u32, Font 객체, 원시 24바이트, 본문 String 객체, 원시 26바이트, VtObject v1을 읽습니다.
- `object_ids.zig`: inline ID의 null 거부와 호출자가 제공한 유한 그룹 내 중복 검사를 공유합니다. 기존 Backdrop도 동일한 ID 읽기를 재사용하며 오류 규칙은 바꾸지 않았습니다.

보조 참조가 FFFFFFFF가 아니면 UnsupportedChartTextReference로 거부합니다. 그때 따라오는 본문 길이가 미확정인 상태로 계속 읽지 않습니다. TextBlock·Font·이름 String·본문 String 네 객체 ID 사이의 중복/null을 거부하되 ID 0과 비연속 값은 허용합니다. 이 검사는 이전 셀·Footnote·다른 객체까지 포함하는 전역 ID 레지스트리가 아니며 일반 객체 재참조는 아직 지원하지 않습니다.

## 소유권과 한도

문자열 payload만 입력을 빌립니다. 나머지 원시 고정 폭 필드와 ID는 복사해 반환합니다. 결과 자체에는 할당/해제가 없고, 타입 이름은 호출자가 소유한 Table이 관리합니다. 입력을 유지하는 동안만 이름/본문 bytes를 사용할 수 있습니다.

개별 문자열 상한과 두 문자열의 누적 상한을 독립 적용합니다. 기본값은 각각 65,535/131,070바이트입니다. 이름을 읽은 뒤 남은 누적 한도를 본문에 적용하므로 합계가 초과한 뒤 검사하지 않습니다. 타입 수·이름 크기/합계는 기존 타입 목록이 책임집니다. 저수준 파서의 전체 입력 한도는 호출자 책임이며 비공개 probe는 전체 Contents 한도를 적용합니다.

각 파서는 실패 시 외부 커서를 유지하지만 타입 목록은 이미 갱신됐을 수 있습니다. 오류/OOM 뒤에는 호출자가 해당 목록을 폐기해야 합니다. 결과의 end는 TextBlock 기반 참조 직후입니다. 이후 ChartSection/Backdrop은 이 모듈이 아닌 [별도 Footnote 조립 계층](hwp5-chart-footnote.md)에서 읽습니다.

## 실제 관측과 테스트 경계

43개 실제 차트의 첫 Footnote에서 VtChartFootnote v1 → VtChartText v1 → VtTextBlock v2 → VtFont v1 순서를 확인했습니다. TextBlock 종료 위치는 첫 Backdrop 뒤부터 253바이트였습니다. 고정 offset으로 종료 위치를 계산하는 제품 코드는 없으며 선언·길이·기반 참조를 순차로 읽습니다.

이 표본들의 이름/본문 원시 길이는 24/12바이트이고, 명시적으로 이중 문자열 레이아웃의 UTF-16 부분을 해석하면 각각 ‘함초롬돋움’/‘각주’입니다. 문자열은 같지만 첫 표본과 나머지 42개의 원시 TextBlock 필드가 다릅니다. 같은 텍스트라고 원시 필드를 합치거나 영으로 정규화하지 않습니다. 이 문자열이 모든 실제 문서에서 화면에 표시된다고 주장하지 않습니다.

비공개 mode 314는 개별/누적 문자열 상한 u32 두 개와 Contents를 받습니다. 기존 셀·Backdrop 파서 이후의 Footnote/ChartText 관측 진입부를 확인하고 TextBlock을 호출합니다. 출력은 end·TextBlock ID·Font ID·이름 ID·본문 ID·이름 길이·이름 후속 값·본문 길이·본문 후속 값 u32 아홉 개, 원시 12/14/24/26바이트, 이름·본문 원시 바이트 순서입니다. 원본 표본 응답은 148바이트이며 가변 문자열에서는 출력 길이도 변합니다. 공개 JS API나 자동 문서 차트 라우팅은 변경하지 않았습니다.

독립 JS oracle은 기존 격자/Backdrop 기대 파서를 재사용하고 별도 타입 상태로 TextBlock을 순차 대조합니다. 제품 serializer를 기대값 생성에 쓰지 않습니다. 네이티브는 비정렬 시작·ID 0/비연속 값·대여 문자열과 복사 원시 값 수명·각 바이트 잘림·클래스/버전·중복/null/미지원 보조 참조·독립 한도·OOM을 검사합니다. 성공/늦은 실패 경로 모두 safety=true allocator 잔량 0을 확인합니다.

## 적대적 검증

Debug/ReleaseSafe/ReleaseFast 전용 WASM에서 각각 실제 43개·정상 258건·오류 9,890건을 통과했습니다. 정상 변형은 원시 필드/문자열/후속 값, 비연속 새 타입 ID, 두 문자열 길이 각각 0/1/65,535를 포함합니다. 문자열 길이 변경 시 전체 extent를 다시 계산해 깊은 읽기까지 도달시켰습니다. 각 거부 뒤 원본을 재호출하고 Error 생성자와 기대 오류명을 모두 확인합니다.

`/tmp/hwpjs-chart-text-block-mutants.XMTmfJ`의 원시 Font 삭제(raw), 누적 한도 차감 생략(total), 보조 참조 검사 생략(auxiliary), 그룹 중복 검사 생략(duplicate), 실패 커서 변경(cursor), 호출자 해제 생략(leak)을 검사했습니다. 여섯 변형 모두 세 모드에서 assertion 또는 MemoryLeakDetected·종료 코드 1로 검출했습니다. 변형 패치의 첫 부분 문자열 매칭 실패는 실행 결과에 포함하지 않았고, 실제 줄 전체에 적용한 후 컴파일·실행한 결과만 셌습니다.

첫 표본 응답 148바이트를 한 바이트씩 XOR 1 한 변형과 같은 메시지의 WebAssembly.RuntimeError 대체도 세 모드에서 모두 검출했습니다. 정상 입력·오류 입력을 구분하지 않는 포괄적인 예외 처리를 통과 조건으로 쓰지 않습니다.

소스·정규 테스트를 고정한 뒤 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했고 최종 종료 코드는 0입니다. `/tmp/hwpjs-chart-text-block-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·1,016/1,016 네이티브 테스트·HWP/WASM 7,958,600회 검사와 chartTextBlockResults의 43/258/9,890을 확인했습니다. 포맷·JS 구문·공백, 관련 문서 로컬 링크 23개도 검사했습니다. 검사 수는 현재 계약의 검증 범위이며 전체 차트·전체 문서 지원 완료를 뜻하지 않습니다.

최종 `zig build test --summary all`은 5/5 단계·1,016/1,016 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).
