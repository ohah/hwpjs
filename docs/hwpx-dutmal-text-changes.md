# 덧말 문자열의 원문 변경 계획

## 책임과 SSOT

dutmal_text_changes는 run 직접 dutmal의 mainText/subText 중 명시적으로 선택한 leaf에 대한 원문 Change 배열만 준비합니다. 중복·누락·외래 namespace·중첩 자식이 있는 대상은 거부합니다. 반환 배열의 새 텍스트는 호출자 버퍼를 빌리므로 XML 작성이 끝날 때까지 수명을 유지해야 합니다.

xml_content_source_span은 CharData와 CDATA 전체 컨테이너의 UTF-8 범위/포인터/구분자 검증을 소유합니다. 기존 text_sites도 같은 함수를 재사용하도록 분리했으며 기존 인코딩→사이트 한도→범위 오류 순서는 유지했습니다. 원문 재조립·이스케이프·빈 요소 확장은 기존 xml_source_writer가 계속 담당합니다. XML 파서나 별도 문자열 저장 모델을 만들지 않습니다.

전체 문자열 치환은 첫 직접 텍스트 위치에 새 값을 넣고 나머지 직접 텍스트만 지웁니다. 주석·PI·속성·다른 leaf와 불투명 원문은 보존합니다. 정규화된 기존 값과 같으면 변경 배열을 비워 CDATA 표기까지 그대로 유지합니다. 이 계획 자체는 문단 줄 배치 캐시·필드 dirty·세션 설치·이력을 처리하지 않으며 호출자가 그 거래를 책임져야 합니다.

## 검증

ReleaseSafe 집중5/5 exit0, 전체 build.zig/src fmt exit0입니다. 합성 사례는 CharData/CDATA/entity·주석/PI/속성/반대 문자열 보존·no-op·빈 요소 확장·Unicode/한도 거부·중복/외래/중첩 대상·prepare/write 전체 실패 할당·원문 불변을 검사했습니다. 공통 범위 계산기는 완전한 CDATA 구분자·범위 밖 버퍼·비 UTF-8 입력 거부를 검사했고 기존 본문 text_sites 회귀도 통과했습니다.

실제36389301에서 mainText와 subText를 각각 변경한 일시적 section XML을 재파싱해 선택 문자열만 바뀌고 반대 문자열/덧말 속성이 유지되는지 확인했습니다. 원본 세션 save는 입력 ZIP과 byte-exact였습니다. 실제 파일을 수정하거나 공개 편집 세션에 후보를 설치한 검사는 아닙니다.

이 계획을 현재값 intent·공통 save·필드/geometry 거래·clone/예산·History·WASM/Worker/UI에 연결하는 작업은 남습니다. native 변경은 전체 gate 완료 전 로컬 상태이며 내부 문자열 편집 지원 완료로 계수하지 않습니다.

## 현재 문자열 소유권과 체크포인트

dutmal_text_values는 control/kind 키마다 변경 문자열 한 개만 소유합니다. 같은 값은 no-op, 원본 정규화 값으로 복원하면 override를 제거합니다. 후보 clone과 전체 소유 바이트/항목 한도를 검사한 뒤 교환하므로 실패 시 원래 현재값을 유지합니다. source 값 조회와 Change 생성은 같은 collector를 공유하며 별도 XML 캐시는 저장하지 않습니다. clone의 중복 키 검사는 hash map을 사용해 항목 수에 대한 이중 순회를 피합니다.

Section의 해제·editor_checkpoint의 capture/해제/교환/예산에 연결했습니다. 이 시점에는 공통 ZIP 저장이 연결되지 않았으므로 pending override가 있으면 UnsupportedDutmalTextSave로 명시적 거부해 변경값을 조용히 누락하지 않습니다. 임시 안전 경계이며 최종 편집 지원으로 계수하지 않습니다.

ReleaseSafe 집중7/7 exit0, 전체 fmt exit0입니다. 본문/주석 독립 소유·clone 격리·원본 복원·no-op·Unicode/예산 거부·clone/set 전체 실패 할당·실패 후 기존 문자열 불변을 검사했습니다. 실제36389301 세션에서는 기존 체크포인트로 변경 문자열 복원/다시 교환·캡처 예산 거부·pending 저장 거부·원문 source 불변을 확인했고, override를 되돌린 상태의 save는 원본 ZIP과 byte-exact였습니다. 공개 setter/History·필드 dirty·geometry 캐시·저장 작성기·WASM/Worker/UI와 실제 거래 전체 OOM은 남습니다.

## 변경된 본문 XML과의 조합 작성기

dutmal_text_save는 기존 xml_identity_binding으로 원본과 본문 편집 후 XML의 덧말/컨테이너/표 소유권을 연결합니다. 원문 덧말 payload가 그대로 보존돼 있는지도 비교한 뒤 main/sub Change를 같은 현재 XML에 모아 적용합니다. 중복 slot intent·소유권 불일치·다른 경로가 이미 바꾼 덧말은 거부합니다. 바뀐 덧말의 직접 소유 문단 linesegarray만 제거하며 두 slot이 같은 캐시를 두 번 지우지 않도록 합니다.

ReleaseSafe 집중1/1 exit0, 전체 fmt exit0에서 앞선 본문 Unicode 입력과 두 문자열 변경 조합·정확한 전체 XML·소유 문단 캐시 제거/다른 문단 캐시 보존·중복/기존 payload 변경 거부·작성기 전체 실패 할당을 검사했습니다. 이 작성기는 아직 Session.save에 연결하지 않았습니다. 필드 dirty와 보호 문맥을 검증한 뒤 연결해야 하므로 pending 저장 거부는 유지합니다. 구조 재배치/동일 payload의 모호한 소유권·실제 ZIP 독립 비교·공개 API/이력/UI는 계속 미완료이며 native 변경은 로컬 상태입니다.
