# 숫자 범위 집계 SSOT

## 포맷 독립 문법·참조 선택

게시c1c987101ccb8d810e574074a07a1616caaacf28의 깨끗한 체크아웃 `/tmp/hwpjs-main-model-syntax.Ql7dDn`에서도 ReleaseSafe 빌드와 정규 HWP5293/293(3232ms)/HWPX34/34(46667ms)·fail0/skip0·exit0을 확인했습니다. WASM SHA256은 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`, 로그는 `/tmp/hwpjs-main-model-syntax-regular-audits-20261011.log`입니다. 미게시 로컬 파일을 섞지 않은 파일 이동의 재현 근거이며 최신 전체 native/대형 참조/브라우저 전수 완료나 기본 데모 승격으로 확대하지 않습니다.

호환 계약의 별도 native 회귀는 기존 HWP5 진입점의 Function/Axis/Address/Cell/Rectangle/Range 타입, resolveAddress 함수와 Iterator가 모델 구현과 정확히 같은 identity인지 검사합니다. 단순 결과값 일치가 아니라 복제 타입/함수 생성을 감지하는 계약이며 native root 포함2/2·exit0·포맷 검사가 통과했습니다. 테스트는 `src/model/formula_compatibility_tests.zig`에 분리해 root에 등록했습니다.

`src/model/formula_range.zig`가 UTF16 숫자 함수 문법/주소 해결, `formula_selection.zig`가 범위·반복 주소의 선택 순서/한도/교차 판정을 소유합니다. 기존 코드와 테스트를 이동했으며 HWP5 body의 두 경로는 같은 타입/함수를 재노출하는 호환 진입점만 남깁니다. HWPX expression/cell owner/evaluator는 모델 경로를 직접 사용하므로 HWP5 body 파서에 의존하지 않습니다. HWP5 레코드/CFB와 HWPX XML/ZIP, 원본/현재 셀 소유권은 각각 포맷 계층에 유지합니다. 별도 compensated 관측 문법의 정책은 합치지 않았습니다.

ReleaseSafe 후보 `/tmp/hwpjs-model-formula-syntax-20261011/bin/hwpjs.wasm` SHA256 `c4f935939ae3b4b71b9693cc62585cc63780c3bcb4d21929ec031e4587c7ee2b` 빌드·포맷/diff 검사와 native 문법/선택/반복 주소·HWPX 산술 전체 할당 실패6/6·exit0입니다. 실제 양쪽13수식 정의·MIN/MAX/AVERAGE·HWP548숫자·독립 레코드/XML/ZIP·저장/재열기/이력3파일13/13·skip0·exit0(24519ms)도 통과했습니다. 기본 데모는 이 파일 이동 후보로 교체하지 않았으며 전체 최신 native/브라우저/대형 원본 전수와 구분합니다.

## AVERAGE 별칭

게시5d58cef95ff1a7582d2a273633358acbce5acb2a의 깨끗한 Git 체크아웃 `/tmp/hwpjs-main-average.XqeZp7`에서도 ReleaseSafe 빌드와 양쪽 정규 감사가 exit0입니다. WASM SHA256 `e8bea3a5ee0c5b23d2e0c5f1b862599ac25302175cd14b780eca756c888623de`, 로그 `/tmp/hwpjs-main-average-regular-audits-20261011.log`의 HWP5293/293(5183ms)/HWPX34/34(62007ms), 각각fail0/skip0입니다. 이후 공유 문법 파일 위치 변경이나 전체 native/브라우저 전수 검증에 소급하지 않습니다. 기본 데모는 이 별칭 산출물로 교체하지 않았습니다.

동일5da4790c 후보의 양쪽 Worker·HWPX 정의 corpus3파일4/4·skip0·exit0(47000ms)와 추가 HWPX Worker 식 이름 응답 검사1/1·exit0(45623ms)도 통과했습니다. 저장본 원래 식이 AVG인 상태에서 AVERAGE가 같은 숫자를 반환하는 경우, 독립 정의 검사기는 원문과 기대값에서 실제 필요한 텍스트 변경 수를 계산합니다. 고정4변경을 요구하지 않되 결과 표시 문자열은 변경 유무와 무관하게 캐시와 일치해야 합니다. Worker 응답의 formula가 AVERAGE를 보존하고 undo/redo·거부 후 redo가 유지됨을 확인했습니다. 기본 데모는 여전히 별칭 이전5d600685이며 실제 브라우저 별칭 검증은 아직 별도입니다.

공유 편집 문법의 대문자 AVERAGE를 AVG와 같은 평균 함수로 연결했습니다. 저장 식을 AVG로 정규화하지 않으며 표현식의 원래 이름도 편집 모델이 소유합니다. HWP5에서 AVG→AVERAGE는 숫자 결과16.875가 같아도 별도 정의 변경이며 undo/redo는 각 저장 바이트를 복원합니다. 후속 숫자12.2 입력 뒤에도 이름AVERAGE/결과17.125를 유지합니다. RHWP의 AVERAGE/AVG 별칭 처리와 비교했고 외부 코드를 복사하지 않았습니다. 별도 관측용 계산 문법의 소문자/공백 정책을 편집 문법에 자동 확장하지 않습니다.

ReleaseSafe 후보 `/tmp/hwpjs-average-alias-20261011/bin/hwpjs.wasm` SHA256 `5da4790c1a1bc8db358dd0f1b5a5d71f94fd35785335f6466f1c46f7b04e145b` 빌드·포맷/diff 검사와 native 함수/참조 범위2/2·exit0입니다. 양쪽 정의 corpus2파일10/10·skip0·exit0(18154ms)은 반복 주소AVERAGE의 독립 산술·command/XML/ZIP·재열기/이력, HWP5 동일 숫자/다른 식 이름·후속 재계산과 기존 MIN/MAX 전수를 포함합니다. 처음 native 비교는 사용하지 않는 undefined 주소 슬롯까지 비교해 실패했으며 함수/두 주소/사용 개수만 비교하도록 고쳤습니다. 기본 데모는 이 별칭 후보로 교체하지 않았고 전체 native/원본 AVERAGE corpus·실제 브라우저 검증은 별도입니다.

## 게시 소스의 정규 감사 재현

후속 HWPX 실제 Chromium 재검증은 새 세션에서 chart.hwpx를 단독 로드하고 enable 후13옵션/fieldset 활성 상태를 기다려 실행했습니다. DOM 입력값MIN 확인 → submit 완료 문구/11.2 결과 → 실제 undo SUM/redo MIN → MAX 반복 참조24.7까지 모두 조건 대기를 통과했습니다. 브라우저 오류는 없었고 agent-browser 스킬에 따라 소유 브라우저 close·loopback8085 서버exit130을 확인했습니다. 앞선 문서 전환 실패의 원인은 이 단독 성공만으로 확정하지 않습니다. 양쪽 단독 수식 폼 E2E는 확인됐지만 Canvas 포인터 선택·다운로드 재업로드·문서 전환 레이스/OS IME 전수는 여전히 별도입니다.

같은5d600685 게시 WASM을 loopback8085로 제공해 agent-browser 스킬로 실제 Chromium의 chart.hwp 픽스쳐 선택/편집 enable·MIN11.2 submit·undo SUM·redo MIN·MAX24.7 submit을 DOM 조건으로 확인했습니다. 후속 chart.hwpx 전환에서는 MIN 제출 뒤25초 조건 대기가 실패했고, 진단 DOM은 입력SUM/결과67.5/상태 빈 문자열/fieldset 활성 상태였습니다. HWPX enable 응답과 초안 입력 타이밍 또는 제출 경로를 다시 분리해야 하며 실제 HWPX MIN 성공으로 계수하지 않습니다. 브라우저 오류는 없었고 소유 브라우저 close·임시 서버exit130을 확인했습니다. 기본 데모는 유지했습니다.

Git 체크아웃 `/tmp/hwpjs-main-extrema.xOQ1cV`의 `97cb3335781510d34110dc265e0b062324789cdb`에서 `zig build hwp5-editor-audit hwpx-text-audit -Doptimize=ReleaseSafe`가 exit0으로 끝났습니다. 게시 소스 ReleaseSafe WASM SHA256은 `5d6006852fc4f8997f4efcf076a858e624cd0ba4e9087943284fda18e7c01bea`입니다. `/tmp/hwpjs-main-extrema-regular-audits-20261011.log`에는 HWP5292/292(3391ms), HWPX34/34(41379ms), 각각fail0/skip0이 기록돼 있습니다. 기존 로컬 e27f03ce 후보와 구분합니다. 정규 선택 밖의 전체 native/참조 문서/브라우저·원본 조판이나 기본 데모 승격 근거로 확대하지 않습니다.

전체 필드 범위 보강: 동일 e27f03ce 후보에서 실제 HWP5 chart13필드×MIN/MAX26거래를 독립 레코드 참조/산술/정확 command·label로 비교하고, 비대상 stream·undo/redo·재열기를 확인했습니다. 기존 숫자 corpus 포함2파일10/10·skip0·exit0입니다. HWPX는13필드×기존 반대 SUM/AVG 및MIN/MAX39거래를 Python 일반/최적화 전체 XML/ZIP·산술과 대조해2/2·skip0·exit0(21976ms)입니다. HWPX 첫 확장 검사 실패는 재열기 검사를 inner-loop 밖에 둔 테스트의 변수 범위 오류였으며 제품 저장 오류가 아니었습니다. 이 범위는 단일 chart의13필드이며 모든 원본/문법을 뜻하지 않습니다.

후속 양쪽 Worker 검사도 e27f03ce 후보에서3파일4/4·skip0·exit0(37531ms)입니다. HWP5 MIN11.2/MAX24.7 제출과 undo AVG16.875·이전 저장 바이트 복원, HWPX MIN/MAX의 독립 XML/ZIP/산술·undo/redo와 잘못된 UNKNOWN 식 거부 후 redo 보존을 확인했습니다. HWPX의 이전 MAX 미지원 기대는 새 의미 지원에 맞게 UNKNOWN으로 바꿨습니다. 실제 Worker 모듈 검사이며 브라우저 수식 폼 E2E·기본 데모 승격은 아직 후속입니다.

`src/model/range_aggregate.zig`가 SUM/AVG/PRODUCT/MIN/MAX 함수 종류·초깃값·한 값 집계·최종 평균을 소유합니다. HWP5/HWPX 편집 계산기는 같은 모듈을 사용합니다. 참조 선택·표/셀 소유권·현재 입력·한도·결과 문자열/원문 저장은 포맷별 기존 계층에 유지합니다. 관측용 별도 compensated range evaluator의 SUM/AVG 계약을 이 모듈로 무조건 교체하지 않습니다.

MIN/MAX는 각각 양/음 무한대 초깃값에서 시작하고 모든 실제 입력과 결과는 finite여야 합니다. 빈 집계는 EmptyFormulaRange, 비유한 입력/결과는 FormulaNumericOverflow입니다. SUM/AVG는 기존 순차 f64 합산을 유지하며 상쇄 잔여값·Decimal/한글 반올림 동치를 해결했다고 주장하지 않습니다.

HWP5에 MIN/MAX 문법을 추가한 이전 a925954a 후보에서 HWPX도 공유 문법을 받아들이지만 별도 evaluator가 합계로 계산하는 오류를 독립 Python 산술로 재현했습니다. 공통 집계 모듈을 양쪽에 연결해 수정했습니다. 이전 후보를 정상 HWPX MIN/MAX 지원으로 계수하지 않습니다.

ReleaseSafe 후보 `/tmp/hwpjs-shared-extrema-20261011/bin/hwpjs.wasm` SHA256 `e27f03ce891d2a11213bd4785ea5b6d77ac58c58d0499c621f6ffed0d899ae15` 빌드 exit0입니다. HWP5 정의/음수 후속 재계산/Worker·HWPX13정의/범위 MIN/반복 MAX·48숫자 정확 표시4파일10/10·skip0·exit0(15538ms)을 확인했습니다. 독립 command/XML/ZIP·산술·재열기·이력 및 변조 거부를 포함합니다. native 공통 비유한/빈 입력·HWPX 주입 reader/반복 주소·전체 할당 실패4/4와 별도 lookup 실패3/3·exit0입니다. 기본 데모는 아직 교체하지 않았으며 MIN/MAX 원본 corpus·최신 전체 native/브라우저·모든 함수 지원은 별도입니다.
