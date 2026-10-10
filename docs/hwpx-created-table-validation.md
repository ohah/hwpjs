# 생성 표의 문서 참조 검증

자동 ID 후보의 소유권·예약 경계는 [생성 표 ID 계획](hwpx-created-table-id-plan.md)을 따릅니다.

내부 `created_table_session.stage`는 anchor 확인 후 문단 ID와 서식 참조를 검증하고, 그 다음 후보 registry를 만듭니다. 원문과 현재 모델의 소유권은 변경하지 않습니다.

`created_table_source_ids.validate`는 모든 section 원본과 공통 `paragraph_id_source_parts`가 읽은 header/masterpage 원본을 공통 ID 검사기에 전달합니다. 모든 section의 현재 생성 문단·생성 셀 ID를 포함합니다. 신규 셀의 원본/생성 충돌·중복·0·전체 예산을 거부합니다. 원본 중복/넓은 ID는 공통 기존 정책대로 보존합니다. 같은 원본 part 목록을 저장용 표 instance ID 검증에도 사용합니다.

`created_table_resources.validate`는 기존 패키지/header 리소스 선택·희소 ID 색인을 사용합니다. paragraph/character는 현재 생성 서식 intents도 인정합니다. style/border_fill은 원본 header에 실제로 존재해야 합니다. ID를 배열 순번으로 취급하지 않고 누락된 참조를 기본값으로 보정하지 않습니다.

2026-10-11 문단 ID 연결판의 ReleaseSafe 집중5/5(root 포함)·exit0은 원본·분할·기존 생성 셀 충돌 거부, 저장/재열기/history/예산과 전체 staging 할당 실패를 확인했습니다. 후속 서식 검증 추가판은 별도 검증하며 이전 실행을 소급하지 않습니다.

서식 연결판의 최종 ReleaseSafe 집중3/3(root 포함)·exit0은 네 종류 미해결 참조 거부와 원문/빈 registry 보존, 현재 생성 문단·글자 서식을 사용하는 성공 삽입, 문단 ID 충돌을 확인했습니다. 초기 테스트의 bold=false는 원본과 같아 no-op이었으며 Debug stack으로 확인 후 실제 다른 크기1234로 수정했습니다. ReleaseSafe build·fmt/diff 및 공개5/5·exit0(22470.838666ms)은 조회/거부 회귀와 native 생성 저장의 독립 전체 XML/ZIP·변조 반례를 확인했습니다. 서식 연결판의 전체 staging 할당 실패는 별도 실행 중이며 아직 완료로 계수하지 않습니다. 기본 제품 WASM은 교체하지 않았습니다.

`created_table_object_ids.validateCurrent`는 생성 객체 identity와 저장 instance ID를 모든 section의 생성 표에 대조합니다. `validateSource`는 source-part 목록의 모든 paragraph namespace `tbl/@id`를 검사하므로 중첩·비활성 표도 포함합니다. 동일 값의 다른 정수 어휘와 원본 넓은 ID는 기존 XML 수치 판정기를 사용합니다. paragraph ID는 별도 namespace입니다. 원본 표 ID 부재는 보존하며 이를 임의로 보충하지 않습니다. 다른 그림·도형과의 ID namespace 공유 여부는 아직 증명하지 않았으므로 표끼리 충돌 검증을 전체 object namespace 완료로 확대하지 않습니다.

2026-10-11 객체 ID 연결판의 최종 ReleaseSafe 집중4/4(root 포함)·exit0은 다른 section 위치에 둔 현재 생성 표의 identity/instance 충돌, 중첩 원본 표의 +033/33 동일값 충돌, 넓은 원본 ID와 별도 paragraph ID 보존, source 검사 전체 할당 실패 및 기존 문단/서식 검증 회귀를 확인했습니다. 다른 section 검사는 소유권을 변경하지 않는 임시 section view이며 실제 다구역 UI 삽입 E2E는 아닙니다.

자동 ID 할당, 다른 도형 ID 정책, public 생성 명령, Worker/Canvas 연결·host 위치 재배치는 아직 남아 있습니다. 내부 생성 거래를 웹 UI 완료로 해석하지 않습니다.

## 공통 shape ID 충돌 확장

후속 source 검사는 tbl/pic/rect/line/ellipse/arc/polygon/curve/connectLine/container/ole/equation/textart/chart/video의 `id`를 동일 예약 공간으로 취급해 신규 충돌을 방지합니다. `instid`는 별개이며 paragraph `id`도 이 공간에 포함하지 않습니다. 근거는 한컴 공개 [AbstractShapeObjectType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/AbstractShapeObjectType.cpp)의 id와 각 타입의 상속 관계입니다. 공통 타입은 필드 공유를 증명하지만 모든 원본 ID의 전역 고유성까지 증명하지는 않으므로 원본을 다시 번호 매기지 않습니다. 신규 ID만 충돌을 피하는 정책입니다.

RHWP reference e8800c8de의 serializer/hwpx/shape.rs·picture.rs는 common.instance_id를 XML id에 사용하고 그림/도형의 instid를 별도로 보존합니다. 이를 둘을 같은 필드로 합칠 근거로 사용하지 않습니다. 그림7/도형+08 충돌과 instid33·paragraph9 분리의 native 반례를 추가했습니다.

이전 서식 연결판(d9168602 source)의 전체 staging 할당 실패 실행은 2026-10-11 root 포함2/2·exit0으로 완료됐습니다. 이후 객체 ID 추가판에 결과를 소급하지 않습니다.
