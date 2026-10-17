# 언어별 글꼴 조판 원값

후속 표시 소비자 중 [상대 글자 크기](relative-font-size.md)와 [장평](horizontal-font-scale.md)은 별도 계약을 따릅니다. 아래 원값 전달 검증과 자간·위치·전체 조판 적용 완료를 구분합니다.

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

분리 최종 소스의 관련 JS 39/39 검사는 skip 없이 통과했습니다. 앞선 작업 트리 40개 실행과 겹치므로 합산하지 않습니다. native 집중 검사는 Debug/ReleaseSafe 각각 7/7(대상 6개+root 진입 1개) 통과했고 현재 헤더 목록의 전체 부분 할당 실패도 포함합니다. 전체 native 검사는 아직 완료되지 않았습니다. 앞선 메타데이터 단계의 4,033개 snapshot은 3,954개 통과·14개 skip·65개 실패로 종료했습니다. 실패 64개는 reference 디렉터리가 없는 검사 사본의 FileNotFound이며, 나머지 수식 저장 기대값 불일치에서 누수도 보고됐습니다. 이 결과를 이번 원값 조회의 전체 통과 근거로 쓰지 않습니다.

2026-10-18 현재 작업 트리에서 해당 수식 저장 집중 검사는 Debug/ReleaseSafe 각각 4/4·종료 0으로 재검증했습니다. 현재 트리에는 SUM/AVG의 문자열 입력 처리와 PRODUCT의 엄격한 숫자 거부를 구분하고 예상 밖 성공 버퍼도 해제하는 테스트 보완이 이미 존재했습니다. 이번 확인으로 그 기존 변경을 새 수정으로 계수하지 않습니다. 관련 JS 53개도 명시적 원값 조회 후보로 재실행해 skip/실패 없이 통과했습니다. 이는 현재 트리 전체를 다시 빌드한 WASM 검사나 전체 native 완료를 뜻하지 않습니다.

이후 현재 작업 트리의 새 ReleaseSafe WASM `cde74b9bf2ff9b2358b5790ef2325748d88ab2f3e7ab5bde0c5f844ed4034484`로 관련 JS와 실제 수식 저장 회귀를 함께 실행해 55/55·skip/실패 0·종료 0을 확인했습니다. 같은 후보의 원값/무변경 저장 재감사도 HWP5 437경로·28,064모양, HWPX 435경로·29,804모양 모두 일치·오류 0·종료 0입니다. 두 형식의 이전 미검증 73/1경로는 여전히 제외하며 coverageComplete는 false입니다. 이번 후보는 기존의 광범위한 미커밋 변경을 포함하는 작업 트리 빌드이므로 main만의 산출물로 표시하지 않습니다. 기본 데모 WASM은 변경하지 않았으며 최신 전체 native 4,318개 실행은 별도 gate입니다.

이전 실패 65건의 선택 재검증에서는 현재 전체 바이너리에 존재하는 64건이 표준 Zig IPC runner에서 pass·오류 로그/누수 0을 반환했습니다. 나머지 `hwpx_field_host_query_tests`의 실제 표 소유권 검사는 현재 작업 트리의 root 목록에 없어 선택 도구가 누락을 보고하고 종료 2로 끝났습니다. 이 누락을 성공으로 숨기지 않고 별도 파일 진입점으로 ReleaseSafe 1/1·종료 0을 확인했습니다. 따라서 이전 실패 항목은 64+1 별도 실행으로 모두 통과했지만, 현재 root 목록만으로 같은 65건을 전부 포함한다고 주장하지 않습니다. 기존 root의 미커밋 목록 변경은 이번 검증에서 수정하거나 커밋하지 않았습니다.

추가 분리 native snapshot 4,037개에서 진단 스택 수집을 끄고 이름에 alloc이 포함된 619개를 명시적으로 제외한 확대 실행은 3,418개 통과·619개 skip·실패 0개로 종료했습니다. 기본 runner의 나머지 검사·로그·누수 판정을 유지했습니다. 이름에 alloc이 없는 검사 내부의 할당 실패 검사는 실행됐을 수 있으므로 모든 할당 실패 검사를 제외했다고 표현하지 않습니다. 이 결과를 전체 native 통과나 앞선 Debug/ReleaseSafe 집중 검사와 합산하지 않습니다. 별도 전체 할당 실패 전수 실행은 아직 미완료입니다.

후속 작업 트리 전체 native 4,318개 실행은 4,316통과·1skip·1실패·종료1로 끝났습니다. 이전의 실행 중 기록은 이 종료 결과로 대체합니다. skip은 환경변수로 단일 지점을 선택하는 글자 속성 OOM shard입니다. 실패는 `character_property_failure_tests`가 고정 샘플 20,000/50,000에서도 반드시 할당 실패가 나야 한다고 가정한 검사였습니다. 같은 소스 집중 재현도 20,000에서 정상 성공해 실패했으며 제품 누수나 롤백 불일치가 보고된 것은 아닙니다.

검사를 실제 거래 할당 수에 연결해 ReleaseSafe 집중4/4를 확인했습니다. 측정된 거래는 11,812회 할당이며 11,811에서 OOM/바이트·리소스·style rollback, 11,812/20,000/50,000에서 정상 성공을 확인했습니다. 기존 0/1/10/100/1,000/5,000 실패 표본도 유지합니다. 성공에서 induced-failure가 있거나 OOM에서 induced-failure가 없으면 검사를 실패시켜 삼켜진 OOM을 정상 성공으로 세지 않습니다. 이 집중 통과를 앞선 전체 실행의 소급 통과로 바꾸지 않습니다. CFB 보정본 API의 후속 현재 지원은 [보정본 열기](hwp5-normalized-open.md)를 따릅니다.

같은 작업 트리의 Debug도4/4·종료0입니다. 미커밋 구현을 섞지 않은 main 분리 사본에서는 ReleaseSafe3/3(보정 열기/글꼴 거래/root), Debug2/2(글꼴 거래/root)·종료0을 확인했습니다. 이 사본의 거래 실측은64,261회이며64,260에서 rollback,64,261에서 성공했습니다. 11,812는 별도 구현 변경이 있는 작업 트리 수치입니다. 고정 샘플을 전부 실패로 가정하지 않고 각 소스의 실제 마지막 실패/첫 성공 경계를 검사하므로 두 수치에 모두 적용됩니다. 이 차이를 main의 성능 개선 완료나 전체 native 통과로 해석하지 않습니다.
