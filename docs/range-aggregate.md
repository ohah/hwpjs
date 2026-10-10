# 숫자 범위 집계 SSOT

`src/model/range_aggregate.zig`가 SUM/AVG/PRODUCT/MIN/MAX 함수 종류·초깃값·한 값 집계·최종 평균을 소유합니다. HWP5/HWPX 편집 계산기는 같은 모듈을 사용합니다. 참조 선택·표/셀 소유권·현재 입력·한도·결과 문자열/원문 저장은 포맷별 기존 계층에 유지합니다. 관측용 별도 compensated range evaluator의 SUM/AVG 계약을 이 모듈로 무조건 교체하지 않습니다.

MIN/MAX는 각각 양/음 무한대 초깃값에서 시작하고 모든 실제 입력과 결과는 finite여야 합니다. 빈 집계는 EmptyFormulaRange, 비유한 입력/결과는 FormulaNumericOverflow입니다. SUM/AVG는 기존 순차 f64 합산을 유지하며 상쇄 잔여값·Decimal/한글 반올림 동치를 해결했다고 주장하지 않습니다.

HWP5에 MIN/MAX 문법을 추가한 이전 a925954a 후보에서 HWPX도 공유 문법을 받아들이지만 별도 evaluator가 합계로 계산하는 오류를 독립 Python 산술로 재현했습니다. 공통 집계 모듈을 양쪽에 연결해 수정했습니다. 이전 후보를 정상 HWPX MIN/MAX 지원으로 계수하지 않습니다.

ReleaseSafe 후보 `/tmp/hwpjs-shared-extrema-20261011/bin/hwpjs.wasm` SHA256 `e27f03ce891d2a11213bd4785ea5b6d77ac58c58d0499c621f6ffed0d899ae15` 빌드 exit0입니다. HWP5 정의/음수 후속 재계산/Worker·HWPX13정의/범위 MIN/반복 MAX·48숫자 정확 표시4파일10/10·skip0·exit0(15538ms)을 확인했습니다. 독립 command/XML/ZIP·산술·재열기·이력 및 변조 거부를 포함합니다. native 공통 비유한/빈 입력·HWPX 주입 reader/반복 주소·전체 할당 실패4/4와 별도 lookup 실패3/3·exit0입니다. 기본 데모는 아직 교체하지 않았으며 MIN/MAX 원본 corpus·최신 전체 native/브라우저·모든 함수 지원은 별도입니다.
