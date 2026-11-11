# 기존 문단 글머리표 적용과 해제

`APPLY_FORMATTING_PATCH_COMMAND`의 `paragraph.bullet`은 `{ kind: 'existing', id }`로 현재 HWPX 문서의 기존 문자 글머리표 선언을 참조하고, `{ kind: 'none' }`으로 해제합니다. 조회는 `queryFormatting`의 `paragraph.bullet` 필드를 사용합니다. 문자 모양이나 본문 문자열에 글머리 기호를 삽입하는 기능이 아닙니다.

## 원본과 저장

Native가 원본 문단·현재 헤더의 선언을 검사하고 기존 문단 리소스와 History를 통해 반영합니다. 원본 확장 속성·자식은 보존하고 heading의 type·idRef·level만 현재 값에 맞춥니다. 글머리표 선언 자체를 바꾸거나 새 선언을 만들지 않습니다. 서식 patch의 정렬과 함께 적용해도 한 편집 이력으로 저장합니다.

원본 일반 본문 문단과 확인된 문자 글머리표 선언부터 지원합니다. 그림/체크 글머리표, 모호한 참조, 번호/개요 소스, 새 생성 문단, 중첩 셀과 보호·제어를 가진 대상은 거부합니다. HWP5 writer와 새 정의 생성·번호 이어가기는 후속입니다. 표시의 글꼴·배치 지원 범위는 [머리표 Canvas 표시](canvas-paragraph-markers.md)를 따르며 저장 성공을 모든 글꼴의 조판 완료로 해석하지 않습니다.

## 검증

실제 HWPX에서 적용·해제·정렬 조합을 저장하고 독립 ZIP/XML 기대값, 실행 취소·다시 실행·재열기를 비교합니다. 구형 엔진·stale 대상·없는 선언·보호 owner는 변경 없이 거부합니다. Native는 원본 확장 보존·할당 실패와 checkpoint 예산 실패 후 리소스·redo 복원을 검사합니다. 누름틀 속성 수정과 같은 세션에 조합하는 검사는 [누름틀 계약](named-fields.md)이 소유합니다.

현재 헤더 전체 정의의 read-only 공개 조회와 서식/문단 모양 UI 선택·적용/해제는 [문단 글머리표 정의 목록](paragraph-bullet-inventory.md)을 따릅니다. 미참조 정의도 포함하며 새 선언 생성 지원과는 구분합니다.
