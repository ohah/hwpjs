# 생성 표의 문서 참조 검증

내부 `created_table_session.stage`는 anchor 확인 후 문단 ID와 서식 참조를 검증하고, 그 다음 후보 registry를 만듭니다. 원문과 현재 모델의 소유권은 변경하지 않습니다.

`created_table_paragraph_ids.validate`는 모든 section 원본과 공통 `paragraph_id_source_parts`가 읽은 header/masterpage 원본을 공통 ID 검사기에 전달합니다. 모든 section의 현재 생성 문단·생성 셀 ID를 포함합니다. 신규 셀의 원본/생성 충돌·중복·0·전체 예산을 거부합니다. 원본 중복/넓은 ID는 공통 기존 정책대로 보존합니다.

`created_table_resources.validate`는 기존 패키지/header 리소스 선택·희소 ID 색인을 사용합니다. paragraph/character는 현재 생성 서식 intents도 인정합니다. style/border_fill은 원본 header에 실제로 존재해야 합니다. ID를 배열 순번으로 취급하지 않고 누락된 참조를 기본값으로 보정하지 않습니다.

2026-10-11 문단 ID 연결판의 ReleaseSafe 집중5/5(root 포함)·exit0은 원본·분할·기존 생성 셀 충돌 거부, 저장/재열기/history/예산과 전체 staging 할당 실패를 확인했습니다. 후속 서식 검증 추가판은 별도 검증하며 이전 실행을 소급하지 않습니다.

서식 연결판의 최종 ReleaseSafe 집중3/3(root 포함)·exit0은 네 종류 미해결 참조 거부와 원문/빈 registry 보존, 현재 생성 문단·글자 서식을 사용하는 성공 삽입, 문단 ID 충돌을 확인했습니다. 초기 테스트의 bold=false는 원본과 같아 no-op이었으며 Debug stack으로 확인 후 실제 다른 크기1234로 수정했습니다. ReleaseSafe build·fmt/diff 및 공개5/5·exit0(22470.838666ms)은 조회/거부 회귀와 native 생성 저장의 독립 전체 XML/ZIP·변조 반례를 확인했습니다. 서식 연결판의 전체 staging 할당 실패는 별도 실행 중이며 아직 완료로 계수하지 않습니다. 기본 제품 WASM은 교체하지 않았습니다.

표 instance_id와 생성 object identity의 문서 전체 충돌/할당, public 생성 명령, Worker/Canvas 연결·host 위치 재배치는 아직 남아 있습니다. 내부 생성 거래를 웹 UI 완료로 해석하지 않습니다.
