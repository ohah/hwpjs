# HWPX 일반 문단 텍스트 편집 기반

## 책임과 계약

[머리말·꼬리말 소유 문단 편집](hwpx-header-footer-edit.md)은 기존 run metadata 보존 경로를 확장하며 중첩 본문과 바깥 소유 문단을 합치지 않습니다. 컨테이너 모양·검증 수치는 해당 문서가 소유합니다.

일반 문단은 `plain_paragraph_edit.zig`가 위치와 정책을 연결하고 `text_splice_transaction.zig`가 원자적 문자열 거래를 소유합니다. [명시적 필드 라벨 편집](hwpx-field-text-edit.md)도 같은 거래를 재사용하며 plain 정책에서 필드를 통과시키지는 않습니다. 아래 파일 책임과 검사 수치는 분리 전 이력도 포함합니다.

plain 진입점은 inline을 거부하며 공개 세션은 선택적으로 같은 원자적 명령의 탭-aware 경로를 사용합니다. 최신 탭 경계·사이트·검증 수치는 [탭 보존 위치](hwpx-paragraph-text-positions.md)가 소유합니다. 아래 inline 거부와 단 설정 수치는 각 경로 및 당시 단계의 범위를 구분해서 읽습니다.

`plain_paragraph_policy.zig`는 현재 경로의 적격성만 소유합니다. 기존 트리·정확한 스캐너 위치를 이용해 문단 소유자를 확인하고, 직접 run의 `t`·section 메타·아래 단 설정과 문단의 lineseg 외의 미투영 컨트롤을 거부합니다. inline 컨트롤이 있는 `t`도 아직 plain 경로에서 편집하지 않습니다. 필드·객체를 텍스트 길이 0으로 간주하고 조용히 통과시키는 임시 대체 경로는 없습니다. 이는 컨트롤 지원 완료가 아니라 명시적 미지원 경계입니다.

`retained_run_metadata.zig`는 `ctrl` 안의 정확한 paragraph namespace `colPr`·leaf `pageNum`을 텍스트 위치 0단위의 원문 설정으로 보존합니다. `colPr`의 직접 자식은 요소 자식이 없는 `colLine`·`colSz`만 허용합니다. 공통 source gap 검사를 wrapper·설정·leaf에 적용해 숨은 문자·주석·PI도 거부합니다. 필드 혼합·다른 namespace·알 수 없는 자식·중첩 텍스트는 거부합니다. 단 폭·쪽 번호 배치 계산이나 설정 수정 명령은 구현한 것이 아닙니다. 번호 속성 원값은 [번호 컨트롤](hwpx-number-controls.md)의 기존 파서가 계속 소유합니다. 단 설정만 허용했던 이전 단계에서는 ReleaseSafe·ReleaseFast 집중 검사 각각 6/6 및 제품 audit 11/11이 통과했습니다. 후속 공개 세션 검사 5/5에는 실제 charshape 단 설정 문단 편집의 독립 Python XML/ZIP 비교를 일반·최적화 모드로 포함합니다.

단 설정 허용 후 공개 API 전수 결과는 1,379문단 중 1,206건 성공·173건 거부입니다. 거부는 UnsupportedParagraphControl 165, UnsupportedInlineControl 7, MissingTextSite 1입니다. 기존보다 47문단의 삽입·저장·제품 재열기·원본 ZIP 복원이 추가됐습니다. 필드·그림·표 등의 전체 편집 완료를 의미하지 않습니다. 독립 구조 조사 `tools/hwpx-paragraph-controls.py`는 raw XML 문단에 있는 컨트롤을 분류하며 selected native 순번·거부 수와 동일한 지표가 아닙니다.

`plain_paragraph_edit.zig`는 같은 paragraph ordinal의 사이트에 UTF-16 단위 splice를 분배합니다. 현재 텍스트의 교체 구간이 삽입값과 같으면 원본 조각·서식 경계를 그대로 두는 no-op입니다. 변경이 있으면 현재 사이트 문자열의 소유 초안을 만들고 기존 단일 사이트 명령으로 삽입·삭제를 준비합니다. 모든 경계·내용·할당·합계 출력 크기 검사 성공 후에만 모델을 한 번 교체합니다. 실패는 이전 모든 사이트를 유지합니다. 원본 XML 바인딩은 변하지 않으며 생성 출력은 [텍스트 조각 저장](hwpx-text-site-edit.md)이 소유합니다.

기존 run의 서식 ID와 태그는 보존합니다. 삽입 경계의 affinity는 앞 사이트를 우선하며 새 문자열은 그 run을 상속합니다. 다른 사이트에서 삭제한 텍스트의 빈 run/빈 t는 제거하지 않습니다. 문단 분할·병합·선택 서식·undo/redo·레이아웃은 아직 별도 미구현입니다. 새 문단/텍스트 구조를 만들지 않고 기존 빈 run의 `t` 생성만 별도 조각 저장기가 수행합니다.

쪽 번호 설정의 0단위는 이 API의 편집 가능한 텍스트 projection 계약입니다. XML의 lineseg/textpos나 HWP5 PARA_TEXT 원시 위치 축을 0단위라고 주장하지 않습니다. 로컬 RHWP의 `parser/hwpx/section.rs`는 pageNum을 PageNumberPos 컨트롤과 `PAGE_FOOTER_SLOT_PART`로 분리하고 보통 원시 대응 축에서는 8단위, 특정 HWP3-origin issue_5251 축에서만 0단위로 취급합니다. 그 원시 변환 축을 우리 공개 문자열 splice 위치와 합치지 않습니다. 현재 lineseg 원문은 보존하지만 입력 후 재조판·원시 위치 재계산은 별도 미완료입니다.

## 적대적 검증

쪽 번호 설정 단계의 최종 전체 ReleaseSafe native 검사는 종료 코드 0·2787/2787 테스트·빌드 7/7로 완료됐습니다. 아래 중간 단계의 전체 검사 대기 기록은 이 결과로 대체합니다. 최신 제품 HWPX 24/24·HWP5 편집 69/69, 실제 세 문단의 독립 XML/ZIP 대조 및 외부 Chromium page 문단 입력·복원, 포맷·diff 검사와 문서 링크/도구 회귀까지 확인했습니다. 공개 문자열 위치와 원시 컨트롤 위치의 차이·원본 조판 및 구조 편집 미완료는 유지합니다.

실제 외부 Chromium에서 page.hwpx 첫 문단을 포인터로 선택해 `검증😀` 삽입 후 Home/Delete 세 번으로 `페이지1` 복원을 확인했습니다. 캡처 `/private/tmp/hwpjs-page-metadata-e2e.png`를 직접 관찰했으며 pageNum placeholder 없이 일반 텍스트 입력으로 표시됩니다. agent-browser 입력이며 OS IME·원본 쪽 조판 증명은 아닙니다. 일반 편집 전수는 45파일·암호화 1개·1379문단 중 1173성공·UnsupportedParagraphControl 158·InvalidFormulaNumber 48로 완료됐습니다. HWP5 편집 회귀 69/69·빌드 7/7, 문서 링크 3031개 누락 0·도구 반례 2/2도 통과했습니다. 전체 native 종료 결과는 아직 기다리고 있습니다.

쪽 번호 단계의 최신 제품 일괄 재검사는 EOF 대기 수정 후 24/24·빌드 7/7·종료 코드 0으로 완료됐습니다. 아래 일괄 제품 '추적 중' 기록은 이 결과로 대체합니다. 전체 native 검사는 아직 진행 중이며 최종 커밋 게이트로 남습니다.

후속 쪽 번호 집중 회귀는 Debug·ReleaseSafe·ReleaseFast 각각 11/11, 최신 Worker 집중 검사는 5/5로 통과했습니다. Worker의 실제 세 문단에서도 pageNum placeholder를 추가하지 않고 prefix 입력·제거·현재 표시 복원이 확인됐습니다. anchored 전수 조사는 45파일·암호화 1개·158후보 중 137성공·21거부로 종료했습니다. 직전 161후보와의 차이 3개는 쪽 번호 설정 문단이 일반 canEdit=true로 승격돼 후보에서 빠진 것이며 anchored 성공 137개를 지원 퇴행으로 해석하지 않습니다. 일괄 제품 검사에서 기존 자동 번호 oracle도 Python stdin EOF 대기가 재현되어 이 테스트 파일의 모든 비교·변이 입력을 줄 단위 봉투와 30초 제한으로 바꿨습니다. 수정 후 공개 앵커 3/3은 통과했고 일괄 제품·전체 native는 같은 실행 상태를 추적 중입니다.

쪽 번호 설정 추가 단계: 한컴 고정 버전 pageNum 모델의 세 속성과 빈 자식 map을 확인했습니다. ReleaseSafe 일반 문단 집중 검사 11/11은 설정 양옆 UTF-16 위치·전체 할당 실패의 원자성·원문 복원과 숨은 gap/leaf 데이터·혼합 필드 거부를 포함합니다. 첫 양쪽 사이트 경계 테스트의 실패는 기존 앞 사이트 우선 affinity와 테스트 기대의 불일치였으며 사이트 내부 교체로 0단위 설정·복원 계약을 별도로 검증했습니다. 제품 빌드 5/5와 공개 앵커 검사 3/3이 통과했고 실제 noori 13·page 1·table-bug 1 문단의 prefix 삽입·저장·재열기·원본 ZIP 복원 및 Python 일반/최적화 전체 XML·다른 ZIP payload 비교를 포함합니다. 최신 전체 회귀·전수·실제 브라우저·문서 해시 검증은 아직 완료 전이며 이전 자동 번호 단계의 결과로 대체하지 않습니다.

2026-10-01 Debug·ReleaseSafe·ReleaseFast 집중 root 포함 각각 4/4: 다른 두 서식 사이트를 가로지르는 이모지 교체·서식 ID 보존, surrogate 중간 거부, 모든 초안 할당 실패의 원본 보존·해제, 미투영 fieldBegin 컨트롤 거부가 통과했습니다. 같은 텍스트로 교체해도 서식 경계가 이동하는 버그와 field 컨트롤을 무시하는 버그를 각각 실패 테스트로 재현한 뒤 수정했습니다. 일반 문단 경계 검사를 모든 필드 의미·조판 지원이라고 주장하지 않습니다.

`src/hwpx_paragraph_edit_survey.zig`는 추적 fixture 디렉터리의 HWPX 45개를 조사하며 암호화 1개를 명시적으로 분류합니다. 비암호화 파일의 모든 section에서 selected 공개 스캐너 번호를 누적하고 각 문단에 prefix 삽입·XML 저장·재파싱·현재 텍스트 대조·prefix 삭제·원본 XML 바이트 복원을 시도합니다. 예측된 거부도 코드별 집계하며 임의 오류는 실패로 반환합니다. 이는 native XML 검사이며 저장 ZIP의 독립 비교나 브라우저 E2E를 대신하지 않습니다.

빈 run 지원 전 기준: 1,379개 문단 중 778개 성공·601개 거부였습니다. 거부는 MissingTextSite 382개, UnsupportedParagraphControl 212개, UnsupportedInlineControl 7개입니다. 빈 run 지원 후 같은 45개 파일(암호화 1개)의 1,379개 문단 조사에서 1,159개 성공·220개 거부로 완료됐습니다. 거부는 MissingTextSite 1개, UnsupportedParagraphControl 212개, UnsupportedInlineControl 7개입니다. 성공 문단은 XML 삽입·재파싱·원본 복원까지 확인했으며 모든 문단·컨트롤 편집 완료율로 해석하지 않습니다.

명령은 [개발·검증 명령](development-commands.md), 경로는 [프로젝트 구조](project-structure.md)가 소유합니다. 공개 Canvas/WASM 연결과 최신 제품·브라우저·전수 검증은 [편집 세션](hwpx-editor-session.md)을 따릅니다. 아래 수치는 해당 시점의 기반 검증 이력입니다.

전체 ReleaseSafe native 검사는 7/7 단계·2,734/2,734 테스트·종료 코드 0으로 완료됐습니다. 빈 run 지원 후 문단 전수 조사도 종료 코드 0으로 완료됐으며 220개 거부를 성공처럼 처리하지 않습니다. 확인된 파일별 개선은 table-position 0→52개, table-bug 275→462개, borderfill 0→7개 성공입니다. 최신 원문/위치/출력 기반의 독립 ZIP/XML 비교는 일반·최적화 Python에서 44개/499개 항목이 통과했습니다. 제품 공개 읽기 전용 Canvas audit 7/7 통과를 편집 UI 검증으로 읽지 않습니다.
