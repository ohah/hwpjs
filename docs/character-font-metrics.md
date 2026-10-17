# 언어별 글꼴 조판 원값

후속 표시 소비자 중 [상대 글자 크기](relative-font-size.md)는 별도 계약을 따릅니다. 아래 원값 전달 검증과 장평·자간·위치·전체 조판 적용 완료를 구분합니다.

## API

HWP5/HWPX editor의 선택적 `characterFontMetrics()`는 `[{id,values:{ratio,spacing,relativeSize,offset}}]`를 반환합니다. 언어 순서는 기존 글꼴 참조와 같은 hangul/latin/hanja/japanese/other/symbol/user입니다. 각각 장평·자간·상대 크기·글자 위치의 % 원값이며 CSS px가 아닙니다. 기존 `characterShapes()`의 HCS1와 id/height/bold/italic 응답은 변경하지 않습니다.

별도 `hwp5_edit_character_font_metrics`/`hwpx_edit_character_font_metrics` ABI는 `{version:1,format:"hwp5"|"hwpx",shapes:[...]}`를 직렬화합니다. 구형 WASM은 형식별 `CharacterFontMetricsAbiUnavailable` 오류를 반환하며 다른 글꼴·서식 조회나 저장에 전파하지 않습니다. Worker attachment는 값과 오류를 별도 필드로 전달하고 조회 성공으로 편집 지원을 추론하지 않습니다.

HWP5 values의 각 필드는 숫자 7개입니다. 장평·상대 크기의 원래 unsigned 바이트와 자간·위치의 signed 바이트를 구분하며 명세 권장 범위를 벗어나도 임의로 clamp하지 않습니다. JSON 숫자 배열이 문자열로 바뀌지 않도록 projection에는 i16을 사용합니다. HWPX는 각 요소가 없으면 null, 존재하면 언어별 정수 또는 null 7개입니다. 빈 요소와 부재 요소, 명시적 0과 속성 부재를 구분합니다. schema default를 원문 값처럼 만들어 넣지 않습니다. HWPX 수치 파싱은 signed32 범위이며 범위 초과·중복 요소는 선택적 조회의 오류입니다.

## SSOT와 소유권

HWP5 원시 CharShape 파서를 다시 구현하지 않습니다. 기존 현재 DocInfo materialization과 `character_display_shapes.zig`를 거쳐 `character_font_metrics.zig`가 scalar projection·직렬화를 소유합니다. HWPX 전용 모듈은 현재 편집 리소스를 적용한 헤더에서 같은 namespace의 직접 자식을 읽고 실제 리소스 ID 목록과 대조합니다. 기존 shape 조회에 새 XML 파싱 오류를 전파하지 않도록 선택적 경로를 분리합니다. 결과는 호출자 소유이며 중간 실패에도 해제합니다.

JS decoder는 packet 버전·형식·ID 순서·중복·배열 길이·정수 범위를 검증합니다. 표시용 조회 사본은 원본이나 편집 모델을 변경하지 않습니다. 언어 판정·글리프 선택·브라우저 spacing/scale/offset 적용은 이 원값 조회의 책임이 아닙니다. 특히 원문의 글자별 자간과 PDF의 Tm/TJ 위치를 단순 폭 합으로 대체하지 않습니다.

## 검증

분리 ReleaseSafe 후보 SHA256은 `1139bb101d67072e33b3b02a97c0d4864c67e4fb57193266d6320dce0426e7a0`입니다. 실제 HWP5/HWPX facename/charshape/linespacing에서 독립 레코드 오프셋·ZIP/XML oracle과 응답을 대조했습니다. 기존 응답 키·무변경 저장·조회 사본 분리·새 글꼴 추가 후 현재 값·undo/redo·닫힌 세션·양 형식 구형 ABI 부재·실제 Worker를 검사했습니다. native 집중 검사는 signed 양끝값·미지 원값·배열 직렬화·XML 부재/빈 요소/0·namespace·중복·overflow·할당 실패를 포함합니다.

기존 HWP5 조사에서 열렸던 437개·28,064개 글자 모양이 독립 원문과 일치하고 무변경 저장도 동일했습니다. 433개에는 기본값과 다른 항목이 있습니다. 이전 조사에서 열리지 않았던 73개는 이번 성공에 포함하지 않으며 coverageComplete는 false입니다. 배포용 문서는 기존 조사와 같은 명시적 distribution 옵션을 사용합니다. 이 결과는 원값 전달 검증이지 조판 적용·폭·baseline·페이지 동치가 아닙니다.

HWPX의 기존 성공 집합 435개·29,804개 글자 모양도 일치하고 무변경 저장은 동일했습니다. 비기본값을 가진 파일은 409개입니다. 이전 oracle 오류 1개는 제외하며 역시 coverageComplete는 false입니다. 전수 도구는 이전 inventory의 verified 집합만 대상으로 삼으므로 원래 누락·오류 집합을 성공으로 바꾸지 않습니다. 큰 파일의 표준입력 전달에서 분석용 Python이 read 대기한 경우는 샘플링으로 확인한 뒤 파일 경로 입력과 30초 oracle timeout으로 바꿨습니다. 이는 조사 도구의 문제이며 WASM 파서 오류로 집계하지 않습니다.

분리 최종 소스의 관련 JS 39/39 검사는 skip 없이 통과했습니다. 앞선 작업 트리 40개 실행과 겹치므로 합산하지 않습니다. native 집중 검사는 Debug/ReleaseSafe 각각 7/7(대상 6개+root 진입 1개) 통과했고 현재 헤더 목록의 전체 부분 할당 실패도 포함합니다. 전체 native 검사는 아직 완료되지 않았습니다. 전체 실행 중인 4,033개 snapshot은 앞선 메타데이터 단계 소스이며 이번 원값 조회의 전체 통과 근거로 쓰지 않습니다.
