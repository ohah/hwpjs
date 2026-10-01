# HWPX 일반 문단 텍스트 편집 기반

## 책임과 계약

일반 문단은 `plain_paragraph_edit.zig`가 위치와 정책을 연결하고 `text_splice_transaction.zig`가 원자적 문자열 거래를 소유합니다. [명시적 필드 라벨 편집](hwpx-field-text-edit.md)도 같은 거래를 재사용하며 plain 정책에서 필드를 통과시키지는 않습니다. 아래 파일 책임과 검사 수치는 분리 전 이력도 포함합니다.

plain 진입점은 inline을 거부하며 공개 세션은 선택적으로 같은 원자적 명령의 탭-aware 경로를 사용합니다. 최신 탭 경계·사이트·검증 수치는 [탭 보존 위치](hwpx-paragraph-text-positions.md)가 소유합니다. 아래 inline 거부와 단 설정 수치는 각 경로 및 당시 단계의 범위를 구분해서 읽습니다.

`plain_paragraph_policy.zig`는 현재 경로의 적격성만 소유합니다. 기존 트리·정확한 스캐너 위치를 이용해 문단 소유자를 확인하고, 직접 run의 `t`·section 메타·아래 단 설정과 문단의 lineseg 외의 미투영 컨트롤을 거부합니다. inline 컨트롤이 있는 `t`도 아직 plain 경로에서 편집하지 않습니다. 필드·객체를 텍스트 길이 0으로 간주하고 조용히 통과시키는 임시 대체 경로는 없습니다. 이는 컨트롤 지원 완료가 아니라 명시적 미지원 경계입니다.

`ctrl` 안에 정확한 paragraph namespace의 `colPr`만 있으면 단 설정 원문을 보존하며 주변 텍스트를 편집합니다. `colPr`의 직접 자식은 요소 자식이 없는 `colLine`·`colSz`만 허용합니다. 필드 혼합·다른 namespace·알 수 없는 자식·중첩 텍스트는 거부합니다. 단 폭·줄 배치 계산이나 단 설정 수정 명령은 구현한 것이 아닙니다. ReleaseSafe·ReleaseFast 집중 검사 각각 6/6 및 제품 audit 11/11이 통과했습니다. 후속 공개 세션 검사 5/5에는 실제 charshape 단 설정 문단 편집의 독립 Python XML/ZIP 비교를 일반·최적화 모드로 포함합니다.

단 설정 허용 후 공개 API 전수 결과는 1,379문단 중 1,206건 성공·173건 거부입니다. 거부는 UnsupportedParagraphControl 165, UnsupportedInlineControl 7, MissingTextSite 1입니다. 기존보다 47문단의 삽입·저장·제품 재열기·원본 ZIP 복원이 추가됐습니다. 필드·그림·표 등의 전체 편집 완료를 의미하지 않습니다. 독립 구조 조사 `tools/hwpx-paragraph-controls.py`는 raw XML 문단에 있는 컨트롤을 분류하며 selected native 순번·거부 수와 동일한 지표가 아닙니다.

`plain_paragraph_edit.zig`는 같은 paragraph ordinal의 사이트에 UTF-16 단위 splice를 분배합니다. 현재 텍스트의 교체 구간이 삽입값과 같으면 원본 조각·서식 경계를 그대로 두는 no-op입니다. 변경이 있으면 현재 사이트 문자열의 소유 초안을 만들고 기존 단일 사이트 명령으로 삽입·삭제를 준비합니다. 모든 경계·내용·할당·합계 출력 크기 검사 성공 후에만 모델을 한 번 교체합니다. 실패는 이전 모든 사이트를 유지합니다. 원본 XML 바인딩은 변하지 않으며 생성 출력은 [텍스트 조각 저장](hwpx-text-site-edit.md)이 소유합니다.

기존 run의 서식 ID와 태그는 보존합니다. 삽입 경계의 affinity는 앞 사이트를 우선하며 새 문자열은 그 run을 상속합니다. 다른 사이트에서 삭제한 텍스트의 빈 run/빈 t는 제거하지 않습니다. 문단 분할·병합·선택 서식·undo/redo·레이아웃은 아직 별도 미구현입니다. 새 문단/텍스트 구조를 만들지 않고 기존 빈 run의 `t` 생성만 별도 조각 저장기가 수행합니다.

## 적대적 검증

2026-10-01 Debug·ReleaseSafe·ReleaseFast 집중 root 포함 각각 4/4: 다른 두 서식 사이트를 가로지르는 이모지 교체·서식 ID 보존, surrogate 중간 거부, 모든 초안 할당 실패의 원본 보존·해제, 미투영 fieldBegin 컨트롤 거부가 통과했습니다. 같은 텍스트로 교체해도 서식 경계가 이동하는 버그와 field 컨트롤을 무시하는 버그를 각각 실패 테스트로 재현한 뒤 수정했습니다. 일반 문단 경계 검사를 모든 필드 의미·조판 지원이라고 주장하지 않습니다.

`src/hwpx_paragraph_edit_survey.zig`는 추적 fixture 디렉터리의 HWPX 45개를 조사하며 암호화 1개를 명시적으로 분류합니다. 비암호화 파일의 모든 section에서 selected 공개 스캐너 번호를 누적하고 각 문단에 prefix 삽입·XML 저장·재파싱·현재 텍스트 대조·prefix 삭제·원본 XML 바이트 복원을 시도합니다. 예측된 거부도 코드별 집계하며 임의 오류는 실패로 반환합니다. 이는 native XML 검사이며 저장 ZIP의 독립 비교나 브라우저 E2E를 대신하지 않습니다.

빈 run 지원 전 기준: 1,379개 문단 중 778개 성공·601개 거부였습니다. 거부는 MissingTextSite 382개, UnsupportedParagraphControl 212개, UnsupportedInlineControl 7개입니다. 빈 run 지원 후 같은 45개 파일(암호화 1개)의 1,379개 문단 조사에서 1,159개 성공·220개 거부로 완료됐습니다. 거부는 MissingTextSite 1개, UnsupportedParagraphControl 212개, UnsupportedInlineControl 7개입니다. 성공 문단은 XML 삽입·재파싱·원본 복원까지 확인했으며 모든 문단·컨트롤 편집 완료율로 해석하지 않습니다.

명령은 [개발·검증 명령](development-commands.md), 경로는 [프로젝트 구조](project-structure.md)가 소유합니다. 공개 Canvas/WASM 연결과 최신 제품·브라우저·전수 검증은 [편집 세션](hwpx-editor-session.md)을 따릅니다. 아래 수치는 해당 시점의 기반 검증 이력입니다.

전체 ReleaseSafe native 검사는 7/7 단계·2,734/2,734 테스트·종료 코드 0으로 완료됐습니다. 빈 run 지원 후 문단 전수 조사도 종료 코드 0으로 완료됐으며 220개 거부를 성공처럼 처리하지 않습니다. 확인된 파일별 개선은 table-position 0→52개, table-bug 275→462개, borderfill 0→7개 성공입니다. 최신 원문/위치/출력 기반의 독립 ZIP/XML 비교는 일반·최적화 Python에서 44개/499개 항목이 통과했습니다. 제품 공개 읽기 전용 Canvas audit 7/7 통과를 편집 UI 검증으로 읽지 않습니다.
