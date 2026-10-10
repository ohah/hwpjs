# 신규 표의 내부 Session staging과 이력

아래 공개 회귀 후보의 SHA256은 `9057f29dca43cfd2db703cbb2d0a638044ced8641f6efe594898178a4fcb4939`입니다. 결과를 기본67dc85ca 산출물에 소급하지 않습니다.

Section의 `created_tables`가 Table/셀 텍스트와 host Anchor를 함께 소유합니다. `created_table_values`는 독립 clone·부분 실패 해제·현재 staged 표 사이의 표 identity/instance 및 셀 문단 ID 충돌·메모리 크기를 소유합니다. entries capacity·셀 배열·문자 버퍼가 체크포인트 예산에 포함됩니다. 원본 트리와 별도 직렬화 XML 캐시는 저장하지 않습니다.

내부 `created_table_session.stage`는 현재 점과 fragment 적합성을 먼저 검사하고, 기존 registry의 독립 candidate에 새 표를 clone한 뒤 크기 검증이 성공해야 swap합니다. 실패에서 기존 값/용량을 바꾸지 않습니다. 입력 Table은 빌려 읽고 clone하므로 호출자가 나중에 텍스트를 변경해도 Session 값은 독립적입니다. 이 단계는 아직 문서 전체 원본/현재 객체 ID·리소스 참조 검증이나 삽입 허가·프로젝션을 완성한 거래가 아닙니다.

Checkpoint는 registry를 clone/deinit/예산/교환에 포함하고, native History의 내부 `created_table_stage` 명령은 기존 거래/롤백/redo 규칙을 사용합니다. 늦은 배치 실패와 예산 초과는 이전 상태·redo를 유지합니다. 빈 registry인 기존 문서 경로는 유지합니다.

저장/프로젝션과 앵커 rebase가 준비되지 않았으므로 staged 값이 있으면 save는 `UnsupportedCreatedTableSave`를 반환해 조용한 표 손실을 막습니다. 본문/필드 텍스트 변경·분할/병합·수식 정의 변경은 임시 `UnsupportedCreatedTableHostEdit`로 막고 분할 가능 조회는 false입니다. 이는 최종 편집 정책이 아니라 아직 내부 staging만 있는 단계의 안전 경계이며 host 이동 연결 뒤 제거해야 합니다. WASM은 이 명령을 명시적으로 미지원 처리하고 public export·Worker/UI에 노출하지 않습니다. 실제 표 삽입 지원이라고 광고하지 않습니다.

2026-10-11 최종 root 집중6/6·exit0(root+새staging3+기존checkpoint2)입니다. 입력 clone 독립성·save/host edit 거부·undo 원문 저장·늦은 실패 후 redo의 표/텍스트/anchor 복원·예산 초과 롤백·capture와 staging 모든 할당 실패·체크포인트 교환을 확인했습니다. staging 실패 검사는 빈 registry만 공유한 borrowed Session을 사용하고 매 종료에 그 registry를 비워 원본 XML/site 소유자를 해제하지 않습니다.

ReleaseSafe 첫 build는 새 Command enum의 WASM switch 누락으로 실패했습니다. 내부 명령을 양쪽 이력 경로에서 명시적으로 미지원 처리하고 재빌드 exit0을 확인했습니다. 후보 `/tmp/hwpjs-created-table-session-20261011/bin/hwpjs.wasm`으로 기존 편집/이력/도형 배치4파일16/16·fail/skip0·exit0(3099.109875ms), fmt/diff도 exit0입니다. 후보는 기존 dirty 변경을 포함해 깨끗한 게시 전체 gate·최신 전수 native·브라우저 검증이 아니며 기본 데모 WASM은 교체하지 않았습니다.
