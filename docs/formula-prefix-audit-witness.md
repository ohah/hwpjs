# 수식 결과 prefix 감사의 원문 근거

`tools/hwpx-formula-prefix-inventory.py`는 원본 ZIP의 표준 `Contents/sectionN.xml` 경로를 읽고 수식 필드가 문단의 첫 텍스트 앞에 있는 위치를 section/localParagraph로 반환합니다. 일반 이름 필드 조회에 수식 결과가 없다는 이유로 실제 `ProtectedFieldRange`를 오류로 오분류하지 않도록 하는 보조 관측기입니다. 결과를 편집 허용·대상 해결·모든 필드 파싱의 증거로 사용하지 않습니다. 중첩 문단은 자신의 번호에만 속합니다.

중복 ZIP entry·64MiB 초과 구역·DTD/ENTITY를 거부합니다. 원본은 쓰지 않으며 별도 Python 표준 XML/ZIP 파서를 사용합니다. 잘못된 이름공간·다른 필드 타입·앞선 텍스트/탭·중첩 부모 소유권의 반례와 chart의 정확한13결과 위치를 `tests/hwpx/formula-prefix-inventory.test.mjs`에서 검사합니다. Python 일반/-O 모드 모두 같은 반례를 거부하는2/2 검사가 통과했습니다.

## 연결 후보 조사 (2026-10-10)

WASM SHA256 `deb854e3c472a0a9ecd18763552a04ac16be41e63ab70cd0ca540811a01170cb`로 Git 추적 HWP5/HWPX111파일을 조사했습니다. HWP5는53파일의 전체 문단 prefix가 통과했고 chart1파일은 부분 지원으로 집계됐습니다. HWP5 전체2090시도 중2042입력·저장·이력 통과, 나머지48개는 수식 의존 셀에 비숫자 prefix를 넣어 `InvalidFormulaNumber`로 거부됐습니다. 암호화 HWP5/HWPX 각1개는 읽기 거부, 별도 HWPX45개는 이 HWP5 감사에서 편집하지 않았습니다.

동일 후보의 숫자 수식 전용 검사에서는 chart의48개 의존 값을 두 숫자 크기로 변경하고13개 수식 결과를 독립 산술로 확인했습니다. 각 저장/undo/redo/재열기를 검사했으며 Worker·명시적 수식 편집과 함께3파일5/5·skip0·exit0입니다. 비숫자 입력 거부를 숫자 편집 실패나 전체 임의 값 입력 지원으로 해석하지 않습니다.

HWPX 전수 prefix 감사는 최초 chart/문단24의 실제 수식 결과를 일반 fieldLabels 목록으로만 찾다가 실패했습니다. 원본 관측기는 이 문단을 포함한13개 위치를 확인했습니다. 감사 호출 계층은 로컬 통합 작업에 남아 있으며 그 전수 재실행의 최종 집계는 아직 확인하지 않았습니다. 이 보조 관측기 게시를 HWPX 편집 전수 통과로 간주하지 않습니다.
