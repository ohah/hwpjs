# HWPX 책갈피 필드 내용 입력

## 원인과 계약

opengov/36388711의 첫 문단은 HYPERLINK가 아니라 BOOKMARK fieldBegin/fieldEnd와 뒤쪽 일반 bookmark 선언이 함께 있는 문단입니다. 초기 후보는 BOOKMARK를 텍스트 필드 종류에서 제외했고, 일반 책갈피가 있는 위치 계산을 제목표시 원문 축으로 검증하면서 필드 ctrl을 거부했습니다.

field_text_kind는 BOOKMARK를 기존 HYPERLINK/CLICK_HERE와 같은 라벨 거래에 연결합니다. 필드 링크·소유권·중첩/미해결 보호·범위·dirty·저장은 기존 공통 모듈이 계속 담당합니다. plain_paragraph_policy는 필드 허용 모드에서만 검증된 field marker를 일반 책갈피와 함께 보존할 수 있게 합니다. 일반 문단 전체 편집 권한은 풀지 않습니다.

paragraph_text_positions와 anchor_text_positions의 buildForFieldText는 기존 계산 루프를 공유합니다. 먼저 필드 정책/소유권 검증을 거친 호출자가 일반 책갈피를 표시 폭0으로 처리할 때만 사용합니다. 필드의 HWP5 원문 레코드 폭이나 제목표시 원문 축을 임의로 추정하지 않습니다. 제목표시 혼합·다른 구조 편집 완료를 의미하지 않습니다.

## 검증

최초 종류/정책 변경 후보 `5e5b0e6a3bdc76fb6b06c49ed49cd0fa235b82da164e03150073811d8e8e9c2b`의 실제 테스트는 UnsupportedParagraphControl로 실패했고, 위 위치 계산 경로를 분리한 뒤 통과했습니다. 최종 ReleaseSafe 빌드6/6 exit0, 후보 SHA256 `62a5550bbfdf9bf8821e3b04df45a7c6cf183a62933df9f4a3e2d73d7d28972d`입니다.

native2/2 exit0에서 실제 fieldLabels 하나·전체 canEdit false 유지·내용 입력·범위 밖 거부·저장 재열기·원문 source 불변과 종류 판정을 확인했습니다. 공개 reference 회귀1/1 exit0은 prefix 입력·독립 전체 XML/비대상 ZIP normal/-O·잘못된 기대 본문 거부·undo 원문/redo 수정본 byte-exact·재열기를 확인합니다. 필드 마커/이름/구역 설정/일반 책갈피 선언은 원문 그대로 비교됩니다. 이름 변경·상호참조 결과 재평가는 구현하지 않습니다.

메모리 파생본에서 BOOKMARK를 DATE로 바꾼 반례는 canEdit false·라벨 없음·명시적 입력 UnsupportedFieldLabel 거부·저장 원문 불변을 확인했습니다. 종류 하나를 추가했다고 계산/미지 필드를 풀지 않습니다. 기본 build 등록·누락 검사도1/1 exit0, 전체 fmt도 exit0입니다. 공개 거래 전체 OOM·다른 책갈피 픽스쳐·Worker/실제 브라우저·서식/구조·현재 전체 gate는 남습니다. native 코드는 아직 로컬 검증 대기 상태입니다.

동일 후보로 opengov21파일2614문단 prefix 조회를 재실행했습니다. plain1643·anchored123·field847·거부1·파일 읽기 실패0, 종료코드1입니다.36388711의 첫 문단 거부는 해소됐고 남은 거부는36389301의26번 덧말 문단입니다. 이 결과는 조회 적격성이며 전체 문단 실제 편집/저장/조판 완료로 계수하지 않습니다.
