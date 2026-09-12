# TextBlock 보조 Backdrop·문자열 재참조

## 구현 계약

기존 `chart/text_block.zig`의 readObservedV2는 null 보조 값과 inline String 계약을 유지합니다. 새 readObservedWithObjects는 같은 읽기 본문을 공유하며, inline Backdrop 보조 객체와 객체 목록 기반 Font 이름/본문 String 해석을 선택합니다. 실제 배치 근거는 [Axis 제목 조사](hwp5-chart-axis-prefix-evidence.md)입니다. Axis 전체 조립이나 일반 객체 그래프 지원을 의미하지 않습니다.

Block은 새 backdrop 옵션과 text_introduced 플래그를 보존합니다. 기존 진입점에서는 각각 null/true입니다. Font의 이름 정의 여부는 기존 font.name_introduced를 그대로 사용합니다. null 보조 값은 두 진입점에서 허용하며, 새 경로의 non-null 값은 기존 Backdrop·빈 Picture 파서로 읽습니다. 보조 Backdrop 자체 재참조나 그림 데이터가 있는 Picture는 아직 지원하지 않습니다.

Backdrop 필드 읽기를 복제하지 않고, 읽은 세 ID를 공통 객체 목록에 등록합니다. TextBlock/Font ID도 같은 목록에서 충돌을 검사합니다. String은 공통 resolver를 사용하므로 이름과 본문이 같은 이전 String을 참조해도 중복 정의로 오판하지 않습니다. 알려진 비문자열을 String으로 대체하거나 null String을 빈 값으로 복구하지 않습니다.

## 한도·소유권

max_string_bytes는 각 필드 길이에 적용합니다. max_total_string_bytes는 이름 길이와 본문 길이의 합이며 같은 저장 String을 재사용해도 두 번 계산합니다. 객체 목록의 저장 String 합계는 고유 정의만 계산하는 별도 상한입니다. 따라서 저장량과 읽어 낸 필드 합계를 혼동하지 않습니다.

String은 등록된 원본 버퍼를 빌리고 raw/Backdrop은 복사합니다. 실패 시 외부 reader는 유지하지만 타입/객체 목록은 갱신됐을 수 있으므로 둘 다 폐기해야 합니다. 별도 소유 할당은 Block에 추가하지 않았습니다.

## 검증 연결과 현재 상태

Mode 318은 max_string_bytes·max_total_string_bytes·max_objects u32 세 개와 Contents를 받습니다. Mode 317과 공유하는 `chart-light-prefix.zig`에서 Light까지 읽고, probe에서만 관측 Axis v3 + 원시 82바이트를 거쳐 제목 TextBlock을 읽습니다. 이 고정 길이를 일반 Axis 파서로 승격하지 않았습니다.

출력은 이름/본문 정의 여부·Backdrop 존재 여부·등록 객체 수·저장 String 바이트 합계 u32 다섯 개, Backdrop이 있으면 세 ID·end u32와 fill_suffix u16·raw50/34/4, 이후 기존 TextBlock serializer 응답입니다. 기존 Mode 314/315의 응답 형식은 변경하지 않습니다.

기존 테스트와 새 테스트를 함께 실행한 네이티브 전용 검증은 Debug·ReleaseSafe·ReleaseFast 각각 7/7개(root 포함)를 통과했습니다. null/Backdrop, 새/이전 이름, 이름과 본문의 alias 조합 8개, 필드·합계·저장량·객체 수의 정확한 한도, OOM, 모든 잘림·타입·버전·늦은 실패, 복사/대여 수명, 배경 ID 충돌, 기존 진입점의 거부 유지를 검사합니다. safety=true 회계에서 성공/늦은 실패 후 잔량 0을 확인했습니다.

Debug 전용 WASM에서 실제 Axis 제목 43개를 기존 SHA-256별 조사 기록과 먼저 대조했습니다. 이후 임시 JSON에 의존하지 않는 `chart-text-block-objects-oracle.mjs`와 정규 `chart-text-block-objects.mjs`로 대체했습니다. Axis 이전 타입/문자열 준비는 기존 조사기와 `chart-axis-context.mjs`를 공유하고, 기대 응답은 제품 serializer가 아닌 독립 관측 필드로 조립합니다.

세 모드 전용 WASM에서 각각 원본 43개·정상 516건·거부 13,244건을 통과했습니다. 모든 제목 바이트 잘림에서 extent를 갱신했으며, 개별/합계/객체 수/입력 길이 한도, 잘못된 타입·종류·객체 ID·Picture 참조를 검사합니다. 보조 값 null은 유효하므로 ID만 바꿔 나머지 본문을 남기는 대신 보조 객체 전체를 제거한 정상 입력으로 대조합니다. 원시 FF, 두 문자열 각각 0/1/65,535바이트, 이름과 본문의 동일 객체 참조, null 배경, 정확한 제목 끝과 그 뒤 FF 꼬리를 검사했습니다. 별도 저장량과 alias 필드 합계도 구분합니다. 각 거부 뒤 원본을 재호출하며 Error 생성자·기대 이름이 모두 일치해야 통과합니다.

공유 전처리 변경 후 Light(43개·정상 173·거부 6,720)와 Legend(43개·정상 258·거부 11,211) 대조도 세 모드에서 유지됐습니다. Axis 조사기의 합성 테스트 4개와 실제 잘림 18,823·버전 변형 77건도 메타데이터/사전 준비 분리 이후 다시 통과했습니다.

`/tmp/hwpjs-chart-text-objects-mutants.bfrJEl`에서 합계 차감 생략(total), 반환 Backdrop 삭제(backdrop), 배경 ID 등록 생략(scope), 기존 null 전용 계약 무력화(legacy), alias를 중복 정의로 거부(alias), 늦은 실패 전 cursor 변경(cursor), 객체 맵 해제 생략(leak), 원시 suffix 삭제(raw)의 8종을 세 모드 모두 검출했습니다. 24개 로그에서 실제 테스트 실패와 내부 테스트 종료 코드 1 또는 누수 확인 후 ABRT를 확인했고, Zig test 명령은 모두 종료 코드 1이었습니다. 컴파일 실패를 검출로 세지 않았습니다.

첫 실제 응답 287바이트의 개별 XOR 변형과 같은 메시지의 WebAssembly.RuntimeError 대체도 세 모드 모두 검출했습니다.

소스·정규 테스트를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 27/27 단계, 네이티브 1,033/1,033개, HWP/WASM 8,064,596회 검사를 통과했습니다. 로그는 `/tmp/hwpjs-chart-text-objects-{Debug,ReleaseSafe,ReleaseFast}-audit.log`이며, 순차 실행 명령의 종료 코드 0도 확인했습니다. 각 모드 chartTextBlockObjectResults는 원본 43개·정상 516건·거부 13,244건입니다. 이 수치는 선택한 계약의 검증 결과이지 전체 Axis/차트 지원이나 공개 문서 API 통합 완료를 뜻하지 않습니다.

전체 audit 이후 최종 `zig build test --summary all`은 5/5 단계·1,033/1,033개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. 변경 Zig 포맷·JS 구문·diff 공백과 관련 문서 로컬 링크 39개도 확인했습니다.
