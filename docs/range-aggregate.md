# 숫자 범위 집계 SSOT

## 게시 소스의 정규 감사 재현

Git 체크아웃 `/tmp/hwpjs-main-extrema.xOQ1cV`의 `97cb3335781510d34110dc265e0b062324789cdb`에서 `zig build hwp5-editor-audit hwpx-text-audit -Doptimize=ReleaseSafe`가 exit0으로 끝났습니다. 게시 소스 ReleaseSafe WASM SHA256은 `5d6006852fc4f8997f4efcf076a858e624cd0ba4e9087943284fda18e7c01bea`입니다. `/tmp/hwpjs-main-extrema-regular-audits-20261011.log`에는 HWP5292/292(3391ms), HWPX34/34(41379ms), 각각fail0/skip0이 기록돼 있습니다. 기존 로컬 e27f03ce 후보와 구분합니다. 정규 선택 밖의 전체 native/참조 문서/브라우저·원본 조판이나 기본 데모 승격 근거로 확대하지 않습니다.

전체 필드 범위 보강: 동일 e27f03ce 후보에서 실제 HWP5 chart13필드×MIN/MAX26거래를 독립 레코드 참조/산술/정확 command·label로 비교하고, 비대상 stream·undo/redo·재열기를 확인했습니다. 기존 숫자 corpus 포함2파일10/10·skip0·exit0입니다. HWPX는13필드×기존 반대 SUM/AVG 및MIN/MAX39거래를 Python 일반/최적화 전체 XML/ZIP·산술과 대조해2/2·skip0·exit0(21976ms)입니다. HWPX 첫 확장 검사 실패는 재열기 검사를 inner-loop 밖에 둔 테스트의 변수 범위 오류였으며 제품 저장 오류가 아니었습니다. 이 범위는 단일 chart의13필드이며 모든 원본/문법을 뜻하지 않습니다.

후속 양쪽 Worker 검사도 e27f03ce 후보에서3파일4/4·skip0·exit0(37531ms)입니다. HWP5 MIN11.2/MAX24.7 제출과 undo AVG16.875·이전 저장 바이트 복원, HWPX MIN/MAX의 독립 XML/ZIP/산술·undo/redo와 잘못된 UNKNOWN 식 거부 후 redo 보존을 확인했습니다. HWPX의 이전 MAX 미지원 기대는 새 의미 지원에 맞게 UNKNOWN으로 바꿨습니다. 실제 Worker 모듈 검사이며 브라우저 수식 폼 E2E·기본 데모 승격은 아직 후속입니다.

`src/model/range_aggregate.zig`가 SUM/AVG/PRODUCT/MIN/MAX 함수 종류·초깃값·한 값 집계·최종 평균을 소유합니다. HWP5/HWPX 편집 계산기는 같은 모듈을 사용합니다. 참조 선택·표/셀 소유권·현재 입력·한도·결과 문자열/원문 저장은 포맷별 기존 계층에 유지합니다. 관측용 별도 compensated range evaluator의 SUM/AVG 계약을 이 모듈로 무조건 교체하지 않습니다.

MIN/MAX는 각각 양/음 무한대 초깃값에서 시작하고 모든 실제 입력과 결과는 finite여야 합니다. 빈 집계는 EmptyFormulaRange, 비유한 입력/결과는 FormulaNumericOverflow입니다. SUM/AVG는 기존 순차 f64 합산을 유지하며 상쇄 잔여값·Decimal/한글 반올림 동치를 해결했다고 주장하지 않습니다.

HWP5에 MIN/MAX 문법을 추가한 이전 a925954a 후보에서 HWPX도 공유 문법을 받아들이지만 별도 evaluator가 합계로 계산하는 오류를 독립 Python 산술로 재현했습니다. 공통 집계 모듈을 양쪽에 연결해 수정했습니다. 이전 후보를 정상 HWPX MIN/MAX 지원으로 계수하지 않습니다.

ReleaseSafe 후보 `/tmp/hwpjs-shared-extrema-20261011/bin/hwpjs.wasm` SHA256 `e27f03ce891d2a11213bd4785ea5b6d77ac58c58d0499c621f6ffed0d899ae15` 빌드 exit0입니다. HWP5 정의/음수 후속 재계산/Worker·HWPX13정의/범위 MIN/반복 MAX·48숫자 정확 표시4파일10/10·skip0·exit0(15538ms)을 확인했습니다. 독립 command/XML/ZIP·산술·재열기·이력 및 변조 거부를 포함합니다. native 공통 비유한/빈 입력·HWPX 주입 reader/반복 주소·전체 할당 실패4/4와 별도 lookup 실패3/3·exit0입니다. 기본 데모는 아직 교체하지 않았으며 MIN/MAX 원본 corpus·최신 전체 native/브라우저·모든 함수 지원은 별도입니다.
