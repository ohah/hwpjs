# HWP5 편집 모델의 하이퍼링크 수정 속성

[제어 보존 편집](hwp5-control-text-edit.md)의 같은 문단 하이퍼링크 텍스트 편집에 표 153의 수정됨 bit 15를 연결합니다. URL/command 편집·필드 재계산·문단 간 필드 지원은 아닙니다.

## 책임과 소유권

`model.FieldAttributes`는 불변 원본 노드에 연결된 편집 가능한 attributes 값입니다. `Paragraph.field_attributes=null`은 아직 materialize하지 않은 상태이며, 소유 배열은 현재 값의 단일 출처입니다. raw command나 저장용 헤더 사본을 별도 모델로 만들지 않습니다. 문단 해제와 실패 경로에서 배열을 해제합니다.

`edit/field_attributes.zig`는 원본 직접 하이퍼링크 헤더의 기존 `field_start.Properties.parse`와 현재 확정 토큰 위치를 사용합니다. 같은 문단의 시작/끝 사이 텍스트를 교체·삭제하거나 그 경계 안에 삽입하면 수정됨 비트를 켭니다. 바깥 삽입은 기존 속성을 유지합니다. 이전 편집 속성은 다음 명령에 계승하며 label을 원래대로 돌려도 수정 비트를 임의로 지우지 않습니다. 무변경 명령은 기존 텍스트 비교에서 먼저 종료합니다. 토큰 삭제 자체는 기존 경계 검사에서 거부합니다.

`field_start.modified_mask`가 bit 15의 단일 출처이며 getter와 편집기가 공유합니다. 다른 비트와 command·instance ID·extra는 보존합니다. `plain_text.zig`는 새 텍스트·서식·범위·필드 속성의 모든 할당과 검사를 마친 뒤 모델을 함께 반영합니다. `text_section_writer.zig`는 직접 부모/source node로 해당 제어 헤더를 찾고 속성 DWORD만 바꿉니다. 고정 길이 레코드의 원래 framing과 나머지 바이트는 유지합니다.

## 2026-10-01 검증

실제 software 하이퍼링크 원본 속성 0x2800이 label 수정 뒤 0xA800으로 바뀝니다. 내부 전체 교체·삭제, 외부 삽입, 무변경, label 복원 후 수정 비트 유지, 반복 저장과 재열기를 확인했습니다. 독립 Node oracle은 별도 원문 위치 순회로 영향받은 필드를 계산해 전체 Section·서식·범위·다른 스트림을 대조합니다. 제품의 필드 준비 함수나 새 모델 값을 oracle의 기대값으로 사용하지 않습니다.

native 집중 할당 실패 검사는 실제 software의 root anchor와 하이퍼링크 label을 각각 사용합니다. open·연결·속성 배열 준비·텍스트 반영·저장 실패 시 원본 값과 byte-exact 무변경 저장을 확인하고 성공 출력은 재열기로 검사했습니다. 집중 검사 1개가 통과했습니다. ReleaseSafe 제품 편집 검사 52개와 전체 Zig 회귀 2,695개가 통과했습니다. 이 결과는 아래 미완료 항목을 포함한 전체 편집기의 완료 증명이 아닙니다.

후속 Canvas 하이퍼링크 입력과 공개 Chromium 실측은 [제어 표시 계약](canvas-control-offsets.md)이 소유합니다. 위 52개·2,695개는 당시 단계의 결과이며, 후속 변경을 포함한 ReleaseSafe 제품 편집 63개와 전체 Zig 2,703개도 통과했습니다. 한컴 GUI 비교·필드 URL 변경·필드 updateKind별 자동 동작·원본 페이지 조판은 아직 미완료입니다. 저장은 계속 명시적 stale-layout 실험 정책을 요구합니다. 실행 명령은 [개발 명령](development-commands.md)이 소유합니다.
