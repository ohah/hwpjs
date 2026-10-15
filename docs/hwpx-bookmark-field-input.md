# HWPX 책갈피 필드 내용 입력

## 2026-10-16 공개 소스의 BOOKMARK 지원 복원

차트 조립 후보 `f6decd1d…`의 공개 추적 테스트180파일 검사에서 BOOKMARK 라벨0개/기대1개 실패를 재현했습니다. 같은 JS/픽스쳐의 기본 WASM `cbaaf27f…`는 해당 검사를 통과하므로 기존 제품 대비 회귀입니다. 후보의 원본 소스에서 BOOKMARK 종류와 필드 전용 책갈피 위치 경로가 빠져 있었습니다.

공개 main `4a85bca4`에 필요한 변경만 합친 독립 소스 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-bookmark-main-4ScM9H`에서 필드 종류/허용 마커/공통 위치 계산의 필드 모드와 호출부를 복원했습니다. 차트 코어·미게시 markpen/위치 순회 최적화·다른 필드 재설계는 포함하지 않았습니다. 일반 문단 전체 편집 보호와 DATE 거부를 유지합니다.

ReleaseSafe 빌드5/5·exit0, WASM SHA256 `ee9aacb29df1a658cdb08722676ff6319b8897bb7264e58b3e11efd9704a5aa8`입니다. native BOOKMARK 거래/정확한 종류 판정은 root 포함3/3·exit0, 실제 공개 reference 검사는1/1·792.317ms·exit0입니다. 독립 normal/-O 전체 XML/비대상 ZIP·잘못된 기대값 거부·undo/redo·재열기와 BOOKMARK→DATE 파생 거부를 포함합니다. 차트 통합 수정 후보 `34f99386…`도 별도로 native3/3·공개1/1을 통과했지만 이 두 소스를 같은 빌드로 계수하지 않습니다.

기본 WASM은 교체하지 않았습니다. 보호된 필드 종료 뒤 외부 입력의 다른 회귀와 전체180파일 검사는 별도이며, 이 수정으로 전체 필드/픽스쳐·실제 브라우저·전체 native/전체 할당 실패가 완료됐다고 주장하지 않습니다. 아래 이전 후보의 로컬 대기 기록은 당시 이력입니다.

## 원인과 계약

opengov/36388711의 첫 문단은 HYPERLINK가 아니라 BOOKMARK fieldBegin/fieldEnd와 뒤쪽 일반 bookmark 선언이 함께 있는 문단입니다. 초기 후보는 BOOKMARK를 텍스트 필드 종류에서 제외했고, 일반 책갈피가 있는 위치 계산을 제목표시 원문 축으로 검증하면서 필드 ctrl을 거부했습니다.

field_text_kind는 BOOKMARK를 기존 HYPERLINK/CLICK_HERE와 같은 라벨 거래에 연결합니다. 필드 링크·소유권·중첩/미해결 보호·범위·dirty·저장은 기존 공통 모듈이 계속 담당합니다. plain_paragraph_policy는 필드 허용 모드에서만 검증된 field marker를 일반 책갈피와 함께 보존할 수 있게 합니다. 일반 문단 전체 편집 권한은 풀지 않습니다.

paragraph_text_positions와 anchor_text_positions의 buildForFieldText는 기존 계산 루프를 공유합니다. 먼저 필드 정책/소유권 검증을 거친 호출자가 일반 책갈피를 표시 폭0으로 처리할 때만 사용합니다. 필드의 HWP5 원문 레코드 폭이나 제목표시 원문 축을 임의로 추정하지 않습니다. 제목표시 혼합·다른 구조 편집 완료를 의미하지 않습니다.

## 검증

최초 종류/정책 변경 후보 `5e5b0e6a3bdc76fb6b06c49ed49cd0fa235b82da164e03150073811d8e8e9c2b`의 실제 테스트는 UnsupportedParagraphControl로 실패했고, 위 위치 계산 경로를 분리한 뒤 통과했습니다. 최종 ReleaseSafe 빌드6/6 exit0, 후보 SHA256 `62a5550bbfdf9bf8821e3b04df45a7c6cf183a62933df9f4a3e2d73d7d28972d`입니다.

native2/2 exit0에서 실제 fieldLabels 하나·전체 canEdit false 유지·내용 입력·범위 밖 거부·저장 재열기·원문 source 불변과 종류 판정을 확인했습니다. 공개 reference 회귀1/1 exit0은 prefix 입력·독립 전체 XML/비대상 ZIP normal/-O·잘못된 기대 본문 거부·undo 원문/redo 수정본 byte-exact·재열기를 확인합니다. 필드 마커/이름/구역 설정/일반 책갈피 선언은 원문 그대로 비교됩니다. 이름 변경·상호참조 결과 재평가는 구현하지 않습니다.

메모리 파생본에서 BOOKMARK를 DATE로 바꾼 반례는 canEdit false·라벨 없음·명시적 입력 UnsupportedFieldLabel 거부·저장 원문 불변을 확인했습니다. 종류 하나를 추가했다고 계산/미지 필드를 풀지 않습니다. 기본 build 등록·누락 검사도1/1 exit0, 전체 fmt도 exit0입니다. 공개 거래 전체 OOM·다른 책갈피 픽스쳐·Worker/실제 브라우저·서식/구조·현재 전체 gate는 남습니다. native 코드는 아직 로컬 검증 대기 상태입니다.

동일 후보로 opengov21파일2614문단 prefix 조회를 재실행했습니다. plain1643·anchored123·field847·거부1·파일 읽기 실패0, 종료코드1입니다.36388711의 첫 문단 거부는 해소됐고 남은 거부는36389301의26번 덧말 문단입니다. 이 결과는 조회 적격성이며 전체 문단 실제 편집/저장/조판 완료로 계수하지 않습니다.
