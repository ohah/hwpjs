# HWP5 각주·미주 속성의 명시적 의미 조회

`src/hwp5/body/note_shape_attributes.zig`는 HWP5 명세 표134를 해석하며 `Shape.attributeSemantics(kind)`가 이를 명시적으로 호출합니다. 기존 raw 파서는 이미 모든 비트를 보존하며, 이 API는 문맥별 의미 조회만 추가합니다.

각주 placement0~2와 numbering0~2, 미주 placement0~1과 numbering0~1을 해석합니다. placement3·numbering3 및 미주 placement2·쪽별 재시작2는 각각 UnsupportedNotePlacement/UnsupportedNoteNumbering입니다. 의미 조회 실패가 원본 파싱·보존을 거부하지 않으며 기존 raw getter는 같은 원값을 돌려줍니다.

bit12 번호 위첨자는 각주 Boolean입니다. 명세가 같은 의미를 부여하지 않은 미주는 null과 uninterpreted_flags 원비트로 남깁니다. bit13은 beneath_text, bit14~31은 uninterpreted_flags입니다. 미지 번호 모양 octet0~255도 기본 glyph로 치환하지 않습니다.

observed28/spec26 선택, 분리선 길이/간격, WCHAR 원값, 확장, 공개 wire, 저장과 페이지 정책은 변경하지 않습니다. 기존 JS note-page-policy의 bit13 배치 해석과 별개인 할당 없는 Native opt-in 조회입니다.

격리 ReleaseSafe focused는 신규6+기존 note raw2+전이 binary Reader2+wrapper1=11/11 통과입니다. 정규 등록은 src/root.zig가 전용 note_shape_attributes_tests.zig를 한 번 import하며 기존 note_tests도 보존합니다. 실제 주석 fixture·정규 root 전체·새 WASM/Worker/Canvas 검증이나 배치 지원 확대는 이 focused 결과에 포함하지 않습니다.

통합 고정 소스의 정규 ReleaseSafe 전체 검사도 종료 0입니다. root 5,032통과·1 skip과 별도 text-splice 9통과를 합쳐 이번 실행은 5,041통과·1 skip이며, cached reference 실행은 이번 통과 수에 더하지 않습니다. skip은 시작·끝 환경변수를 지정하지 않은 mixed-runs 단일 OOM shard입니다. 제품 Safe는 6/6 단계 성공이고, 전체 입력 source 3,464개·로컬 fixture 559개의 전후 해시는 변하지 않았습니다. 새 WASM은 기존 428 export·426 함수의 이름/타입과 0 import를 보존하지만 운영의 d849 엔진과 바이트가 다르며 아직 배포하지 않았습니다. 이 결과가 실제 주석 배치, OLE 편집 권한, 독립 저장 oracle이나 웹 성능을 검증한 것은 아닙니다.
