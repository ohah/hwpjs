# HWP5 객체 CTRL_DATA 원문 보존

## 범위와 책임

`control_data_object_metadata.zig`는 관측된 도형·표 메타데이터의 직접 소유 관계와 ParameterSet 구조를 검사합니다. 공통 ParameterSet 파서와 `owned_record.find`를 재사용하며 이름 전용 스키마는 `control_data_names.zig`에 남깁니다. 이 검사는 객체 속성 편집이나 조판 구현이 아닙니다.

도형은 검증된 shape component 또는 해당 component를 직접 소유한 drawing header만 허용합니다. 표는 직접 table record를 가진 table header만 허용합니다. 이전 형제나 가장 가까운 조상으로 소유자를 추측하지 않습니다.

정확한 root set `0x021b` 아래 도형 `0x3003`의 단일 `0x7001` 정수, 표 `0x0242`의 관측 11/13항목만 허용합니다. 부모·개수·ID 중복·wire type·reserved·꼬리를 검사하며 미지 구조는 거부합니다. 수치 의미를 새로 부여하거나 원문을 다시 작성하지 않습니다. 형식 관측은 공식 명세의 모든 확장 지원을 뜻하지 않습니다.

## 분리 후보 검증 (2026-10-16)

main의 기존 src/js/web-preview 추적 파일 3,067개와 분리 폴더를 대조해 누락0, 기존 파일 변경은 policy/root 두 파일뿐임을 확인했습니다. 새 전체 native 바이너리 `56bc0109d47efb5dcc549d9a96c75bd24ec8ab3df196f0282dffd49a6a66e3db`의 목록은 3,959개로 이전 3,957개에서 메타데이터 테스트 두 선언만 추가됐고 제거는 없습니다. 이 전체 바이너리에서 두 선언을 직접 선택해 status/log/leak0·정상 종료를 확인했습니다. 목록 검사와 선택 실행은 전체 3,959개 실행 완료가 아니며, 이전 main 전수 실행도 계속 별도로 관찰합니다.

일반 입력 38문단의 추가 공개 검사는 각 문단을 원본 상태에서 시작해 저장 Section 전체를 `verifyRaw`의 독립 예상 bytes와 비교합니다. 텍스트뿐 아니라 문자 서식·범위 태그·캐시 제거·비대상 레코드 전체를 비교하고, CFB 메타데이터·재열기·undo/redo·원본 복원도 검사합니다. 숫자 의존 12문단의 잘못된 문자열 거부를 별도로 확인했습니다. 이 추가 선언을 포함한 객체 메타데이터/기존 숫자 수식 공개 검사는 5/5·exit0입니다.

추가 실제 파일 `156636617_240617 2024년 5월 월간 수출입 현황(확정치).hwp`는 수정 전 2,565문단 모두 소유권 오류로 거부됐습니다. 아래 후보로 재실행한 결과 2,565/2,565 prefix 입력·독립 텍스트/비대상 스트림 보존·저장 재열기·undo/redo가 통과했습니다. 문자열 입력 위치는 문단 시작이며 모든 편집 명령/조판 검증이 아닙니다.

직접 component의 tag를 바꿔 component가 사라진 경우와 metadata의 부모를 본문 문단으로 바꾼 경우의 거부도 추가했습니다. 후자는 소유권 판별뿐 아니라 실제 `validateRetainedNode` 정책 경로로 거부를 확인했습니다. 추가 집중 바이너리 `5dcc82d3308792fc2e190dc6e12e9d532a03a066413c605a61f1157d64ccb581`은 3/3·fail/skip/log/leak0·exit0입니다. 앞선 188개 실행과 동일 바이너리는 아니며 결과를 합산하지 않습니다.

main `143b6b2f`에서 분리한 `/tmp/hwpjs-object-metadata-publication.cjlPUR`에 모듈과 policy 연결부만 적용했습니다. 후보 WASM SHA-256은 `58d71f2601cbf3611b52126a742563c3e36fa617f054f78213a6b61d27ab7126`입니다. 기본 데모 WASM은 교체하지 않았습니다. 게시 여부는 Git 이력으로 확인합니다.

실제 `reference/rhwp/samples/143E433F503322BD33.hwp`의 CTRL_DATA record 26/28은 각각 drawing header/shape component의 직접 자식입니다. 수정 전 후보는 50문단 모두 `UnsupportedControlDataOwner`로 거부했습니다. 수정 후보는 일반 문자열 prefix 38문단을 독립 텍스트/비대상 스트림·재열기·이력 검사로 확인했습니다.

남은 12문단은 수식 숫자 입력 의존 셀입니다. 독립 record oracle의 대상 목록은 `18,19,20,23,24,25,28,29,30,33,34,35`이며 native 거부 위치와 일치합니다. 각 셀의 숫자 교체는 독립 수식 산술·결과 표시·3개 CTRL_DATA 전체 raw bytes·CFB 메타데이터·비대상 스트림·재열기·undo/redo를 통과했습니다. 잘못된 문자열은 계속 `InvalidFormulaNumber`로 거부되며 기존 redo도 유지됩니다. 문자열 prefix 거부를 임의 문자열 편집 성공으로 바꿔 집계하지 않습니다.

`object-metadata-numeric-retention.test.mjs`와 기존 숫자 수식 검사는 4/4·exit0입니다. 수정 전 WASM으로 새 검사를 실행하면 `UnsupportedControlDataOwner`로 실패합니다. 독립 산술 oracle의 기본 수식 개수 13은 유지하고 이 표본의 관측 개수만 명시적으로 전달합니다.

집중 native 진입점의 전체 의존 테스트는 188/188·fail/skip/log/leak0·exit0입니다. 바이너리 SHA-256은 `6fa26bdc76562ca42da954e27dddd35e0259db148e117c342cb923f02acdde94`입니다. 구조/타입/부모/꼬리/절단·전체 할당 실패 검사를 포함합니다. 정규 root에 직접 import를 추가한 후보의 선택 검사는 root 포함 3/3입니다. 최초 등록 전 root 1개만 실행된 결과는 메타데이터 검증으로 계산하지 않습니다.

기존 고정 WASM 경로·UI 파일이 누락된 최초 공개 회귀 실행은 무효한 harness 실행으로 중단했습니다. 누락을 보완한 HWP5/CFB 정규 등록 31파일 검증은 385/385·fail/cancel/skip0·exit0(491638.899709ms)입니다. 같은 후보 WASM을 임시 기본 경로에도 설치해 고정 경로 검사와 환경변수 검사가 다른 WASM을 읽지 않게 했습니다. 양식 1,446문단 Worker 검사(459117.10425ms)와 신규 일반/숫자 메타데이터 검사를 포함합니다. 최초 실행과 부분 성공 수는 합산하지 않습니다. 기존 main의 전체 native·전체 참조 편집·모든 필드/명령·실제 브라우저/IME/한글 조판 검증은 아직 별도이며 이 회귀 결과로 대체하지 않습니다.
