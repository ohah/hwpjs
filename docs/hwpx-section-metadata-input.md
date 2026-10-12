# 구역 설정만 있는 문단의 원문 입력

## 원문과 경계

`reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx`의1/21/46/147/185/300/348/500/591/877번에는 secPr·colPr·책갈피만 있고 직접 hp:t가 없습니다. 기존 retained_run_metadata.runOnly가 secPr를 제외하여 빈 문단 fallback을 만들지 못했습니다.

로컬 fallback은 run 직접 secPr의 whitespace-only 원문 간격을 검사하고 기존 metadata-only 문단 규칙에 연결합니다. ctrl 분류나 일반 텍스트/앵커 정책의 supported 목록을 넓히지 않습니다. 기존 t/빈 run의 삽입 affinity와 그림/필드 문단 제외를 유지합니다.

## 독립 검사가 드러낸 후속 문제

첫82e76555 후보는 권한 조회를 허용했지만 실제 저장의 독립 전체 XML 검사에서 실패했습니다. 첫 문단 원문은 secPr/colPr/책갈피 순서였는데 다단 구조 편집 경로의 결과는 빈 t/책갈피/새 t/secPr/colPr로 바뀌었습니다. 기존 합성 검사는 metadata 개수만 검사하여 이 순서·affinity 변경을 잡지 못했습니다. 이 실패는 oracle를 느슨하게 바꾸어 통과 처리하지 않았습니다.

`metadata_source_splice.eligible`은 source 상태의 단일 missing_text metadata 사이트만 판정합니다. 기존 필드 외부 보호 준비 이후, page-area/column topology 재작성 전에 공통 plain_paragraph_edit 트랜잭션을 사용합니다. structure_values·여러 사이트·anchor boundary·기존 텍스트/객체/필드 host에는 이 단축 경로를 적용하지 않습니다. 원문 text site와 파생 구조 모델을 동시에 편집하는 것이 아닙니다.

## 검증

합성 권한 회귀는 수정 전1/1 실패를 재현했습니다. 수정 후 native3/3 exit0으로 secPr/단/책갈피 보존·정확한 새 t 순서·undo/redo 및 기존 텍스트/빈 run 선호·객체/필드 제외를 검사했습니다.

source affinity 후보 SHA256 `a6b30bb986825a08e720035019b5a66e9d6bbf0f735df612255ee3fa5922372f`는 ReleaseSafe6/6입니다. 실제10문단 회귀와 기존 쪽번호2문단 회귀2/2 exit0에서 전체 XML/비대상 ZIP payload normal/-O·잘못된 기대값 거부·저장/undo/redo/재열기·파일 불변을 확인했습니다. oracle의 metadata_run 모드는 알려진 metadata roots만 받고 기존 빈 run/텍스트/앵커를 이 경로로 보정하지 않습니다.

기본 검증 목록 등록·누락 방지1/1·전체 source fmt도 통과했습니다. 이 결과는 입력한12개 위치의 실제 편집이며, 문서 전체의 임의 선택/서식/구조 편집이나 한글 조판 완료가 아닙니다. 새 native source 경로의 추가 실패 할당·Worker/브라우저·최신 전체 gate와 core 커밋/제품 승격은 남습니다.
