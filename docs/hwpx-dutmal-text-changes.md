# 덧말 문자열의 원문 변경 계획

## 책임과 SSOT

dutmal_text_changes는 run 직접 dutmal의 mainText/subText 중 명시적으로 선택한 leaf에 대한 원문 Change 배열만 준비합니다. 중복·누락·외래 namespace·중첩 자식이 있는 대상은 거부합니다. 반환 배열의 새 텍스트는 호출자 버퍼를 빌리므로 XML 작성이 끝날 때까지 수명을 유지해야 합니다.

xml_content_source_span은 CharData와 CDATA 전체 컨테이너의 UTF-8 범위/포인터/구분자 검증을 소유합니다. 기존 text_sites도 같은 함수를 재사용하도록 분리했으며 기존 인코딩→사이트 한도→범위 오류 순서는 유지했습니다. 원문 재조립·이스케이프·빈 요소 확장은 기존 xml_source_writer가 계속 담당합니다. XML 파서나 별도 문자열 저장 모델을 만들지 않습니다.

전체 문자열 치환은 첫 직접 텍스트 위치에 새 값을 넣고 나머지 직접 텍스트만 지웁니다. 주석·PI·속성·다른 leaf와 불투명 원문은 보존합니다. 정규화된 기존 값과 같으면 변경 배열을 비워 CDATA 표기까지 그대로 유지합니다. 이 계획 자체는 문단 줄 배치 캐시·필드 dirty·세션 설치·이력을 처리하지 않으며 호출자가 그 거래를 책임져야 합니다.

## 검증

ReleaseSafe 집중5/5 exit0, 전체 build.zig/src fmt exit0입니다. 합성 사례는 CharData/CDATA/entity·주석/PI/속성/반대 문자열 보존·no-op·빈 요소 확장·Unicode/한도 거부·중복/외래/중첩 대상·prepare/write 전체 실패 할당·원문 불변을 검사했습니다. 공통 범위 계산기는 완전한 CDATA 구분자·범위 밖 버퍼·비 UTF-8 입력 거부를 검사했고 기존 본문 text_sites 회귀도 통과했습니다.

실제36389301에서 mainText와 subText를 각각 변경한 일시적 section XML을 재파싱해 선택 문자열만 바뀌고 반대 문자열/덧말 속성이 유지되는지 확인했습니다. 원본 세션 save는 입력 ZIP과 byte-exact였습니다. 실제 파일을 수정하거나 공개 편집 세션에 후보를 설치한 검사는 아닙니다.

이 계획을 현재값 intent·공통 save·필드/geometry 거래·clone/예산·History·WASM/Worker/UI에 연결하는 작업은 남습니다. native 변경은 전체 gate 완료 전 로컬 상태이며 내부 문자열 편집 지원 완료로 계수하지 않습니다.
