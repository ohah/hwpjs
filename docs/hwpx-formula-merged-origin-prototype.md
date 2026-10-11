# 병합 원점 수식 임시 구현

## 상태와 책임

후속 수정은 현재 작업 트리에 옮겼으며 최신 정책/책임/진행 중인 검증은 [셀 분류와 입력 검증 계약](hwpx-formula-cell-scalars.md)이 소유합니다. 아래의 임시 경로/hash/미반영 표기는 각 당시 snapshot의 이력입니다. 현재 소스 반영과 기본 데모/깨끗한 checkout 승격은 구분합니다.

이 구현은 원 작업 트리나 기본 데모에 반영하지 않았습니다. `/tmp/hwpjs-field-style-clean.2ptRk4`의 소스에만 수식 변경을 적용하고 `/tmp/hwpjs-merged-origin-prototype/bin/hwpjs.wasm`으로 빌드했습니다. SHA256은 `37591586a8ae271db053bf83daea27af1b53028bacc81640e788c6beab9c8825`입니다. 앞서 같은 임시 소스에서 만든 field style75d658fe와 다른 후보이며 두 검증을 합치지 않습니다.

임시 formula_cell_rectangle.zig는 주소/크기/표 경계 검사와 포함/겹침을 소유합니다. formula_values의 선택/집계/reader 주입/예산과 숫자 해석은 기존 계층에 둡니다. 병합 셀 원점은 읽되 선택한 병합 사각형 전체와 다른 셀의 겹침을 추가로 검사하고 그 재방문도 inspection/reader charge에 포함합니다. 원점 이외 내부 좌표는 여전히 UnsupportedMergedFormulaCell입니다. 반복된 명시 주소는 기존 반복 집계 의미를 유지하며 무조건 unique로 합치지 않습니다.

## 관측 숫자 서식

참조 reader 성공 HWPX435개의 독립 ZIP/XML에서 수식 서식35건 모두 %g,였고 dirty1이 아닌 일관된 Command/LastResult 중 큰 값3건은 aift의1,000,000과 copay_cap_tac_table_leading의1,749,831 두 건입니다. 후자는7자리 정수를 그대로 보존하므로 기본6유효숫자 가정으로1,749,830이나 지수 표기를 만드는 것은 이 원문과 다릅니다. 원점만 허용한 최초 임시 구현에서 aift 조회는 성공했으나 표시가1e+06으로 나와 지원 완료로 계산하지 않았습니다.

최초 임시 shared calculation_result_text는 grouping true/precision null의 general을 shortest decimal로 렌더링했지만, 이후48입력 독립 Decimal 회귀에서 부동소수점 꼬리값 노출로17개 중1개가 실패했습니다. 검사기를 완화하지 않고 임시 정책을15유효숫자와 큰 grouped 값의 decimal 전개로 보완했습니다. 이15자리 정책은 현재 관측/회귀 후보이지 모든 원본이나 공식 한글 규칙의 완전 증명은 아닙니다. 기존 명시 정밀도·fixed·ungrouped 동작은 유지합니다. 기존 HWP5 formula_format adapter도 원본 %g에 정밀도가 명시되지 않은 grouping 호출을 null precision으로 전달합니다. general6 enum 이름의 ungrouped 기존 동작은 유지하며, 모든 HWP5 원본의 서식 동치를 검증한 것은 아닙니다. 최소/최대 f64·정밀도/반올림·음수·7자리 grouped 정수 및 명시 %.6g,의 구분을 집중 검사했습니다.

## 검증 범위

임시 root에서 수식 반복/겹침·독립 occupied mask 사각형(빈 span/최대 u32 포함)·서식/계획/기존 format을 선택한 native7/7·exit0을 확인했습니다. 실제 aift 전체 snapshot6343문단도 조회됐습니다. 값 자체는 독립820000+180000=1000000 관측과 비교했고, 입력 source 문단4392의820,000을900,000으로 바꿔1,080,000의 Current/Command/LastResult·저장/재열기를 확인했습니다. undo는 원문 전체 바이트, redo는 수정 저장본 전체 바이트와 일치했습니다. 병합 내부 좌표·전체 수식 함수/범위·실제 browser/한글 조판은 아직 검증하지 않았습니다.

tools/hwpx-merged-origin-save-oracle.py는 실제 병합 원점 입력과 source formula identity를 고정하고 기존 독립 Decimal cell oracle로900000+180000=1080000을 계산합니다. source 전체 XML에서 input/result/Command/LastResult/dirty만 기대 변경으로 적용해 완전 비교하고, 다른 ZIP payload·entry metadata·CRC/순서/주석은 보존을 요구합니다. 처음 줄 배치 정보를 제거하는 것으로 예상해 실패했고 차이를 추적했습니다. 같은 길이의 숫자 치환에서 실제 저장은 그 정보를 유지하므로 예상 제거를 없애 줄 배치 정보까지 원문 일치를 요구했습니다. 임의 XML 차이를 허용하는 정규화로 통과시킨 것이 아닙니다.

실제 수정본을 Python 일반/-O로 대조해 모두 exit0을 확인했습니다. 각 모드에서 입력901,000·결과1,081,000·dirty0·비대상 header 변경의4개 저장본 변조를 각각 거부했습니다. 부정 대조는 실제 XML/비대상 payload 불일치만 인정하며 인프라 실패를 통과로 처리하지 않습니다. 이 oracle은 aift의 관측된 한 입력/한 SUM 경로이지 범용 병합 수식/모든 식 지원 증거가 아닙니다.

후속 숫자 정책 후보 SHA256은 `8055a584c2cf817b6ecd79bed68318c2768d92c7b1ab00ed9e9873549c7eb6c5`입니다. ReleaseSafe build exit0, 서식/계획 native4/4·exit0, formula-editor/created-table-formula-host/table-creation-worker3파일17/17·exit0(45381.239625ms)을 확인했습니다. 기존 실제48입력 문단의 독립 Decimal 재계산도 통과했습니다.3759와8055 결과는 별도 snapshot이며 기존 전체 native 실행은 여전히8055를 검증하는 실행이 아닙니다.

issue1891_external_bindata_link의 추가 독립 XML 조회에서는 SUM(?3:?7)의 원점 column2/row7 입력 중 row4/row5가 병합된 설명 문구(공용면적 포함/환자 공간 제외)임을 확인했습니다. 나머지67.83+33.72+24.04=125.59는 저장 cache와 일치합니다. 다른 열은 같은 설명 셀의 내부 좌표를 참조하므로 단순한 merged-origin 허용만으로 해결하지 않습니다. 숫자 아닌 셀/빈 셀/새로 잘못 입력된 숫자/AVG의 분모 정책을 구분해야 하며, 해당 파일을 지원 완료로 집계하거나 모든 비숫자를0으로 치환하지 않습니다.

이력 설정을4entries×128MiB로 요청한 최초 시도는 history ABI의 총128MiB 한도를 넘겨 LimitExceeded였습니다. open 오류로 해석하지 않고 stage를 분리해2entries×64MiB의 허용 설정으로 재실행했습니다. 제한을 제거하지 않았습니다. issue1891_external_bindata_link는 최초 원점 임시 후보에서 다음 단계 InvalidFormulaNumber가 드러났으며 이 역시 해결된 파일로 집계하지 않습니다.

## 별도 기존 테스트 오류

기존 formula_command_plan 테스트는 지원된 MAX를 UnsupportedFormulaExpression으로 기대했습니다. 수정 전 원 작업 트리에서도 동일 실패와 성공 반환 Plan 미해제로 발생한 테스트 누수3개를 재현했습니다. MAX 성공/command/최대 함수/명시 deinit과 미지원 MEDIAN 거부로 test-only 기대를 정정했고 원 작업 트리 native3/3·exit0으로 확인했습니다. 이 작은 테스트 실패의 누수를 전체 검사 프로세스의 큰 메모리 사용량 원인으로 연결하지 않습니다. 기존 전체 Debug/ReleaseSafe 실행은 이 수정 전 test snapshot이며 아직 실행 중입니다.

동일 MAX 미지원 가정이 formula_expression의 정의 거부 테스트에도 남아 있었습니다. 원 작업 트리의 단독 실행2선언 중1실패로 먼저 재현한 뒤 MAX parse 성공과 실제 미지원 MEDIAN 거부로 정정했습니다. 수정 후 expression/command-plan/explicit arithmetic 집중 native5/5·exit0을 확인했습니다. 누락·식 불일치·미지원 서식의 기존 반례를 제거하지 않았습니다.

## SUM 비숫자 관측의 경계

BELOW 후보 `/tmp/hwpjs-sum-below-prototype/bin/hwpjs.wasm` SHA256은 `66b1425c889f29fd928d385650ece8aecb359e0b8070e30d0a61b16833e77afc`입니다. ReleaseSafe build5/5 steps·exit0, 직접 selection8/8·exit0을 확인했습니다. 실제 copay 조회는 InvalidFormulaReference 다음 단계 UnsupportedFormulaCellParagraphs로 진행했으며 지원 완료가 아닙니다. 나머지4파일은 이전 후보와 같은 조회 결과였습니다.

copay의 전체5개 BELOW 식을 독립 XML/Decimal로 조사했습니다. 첫 문단 숫자만 합산한 결과184.9/1749831/23860/1749831/23860이 각 원본 cache와 일치했습니다. 두 큰 표의 입력 셀은 첫 문단 금액, 두 번째 문단 비율을 가진 형태입니다. nested의 ABOVE 입력에는 비용/현재가치의 두 문단 설명 셀이 있습니다. 첫 수식 표만 조사한 초기 inventory는 이를 누락했으므로 모든 수식의 가장 가까운 표로 확대했습니다. 이는 실제 관측이며 모든 한글 셀 숫자 해석 규칙의 공식 증명은 아닙니다.

후속 임시 scalar 분류는 전체 셀의 활성 구조/제어 요소를 검사하되 첫 문단 텍스트만 읽습니다. strict 숫자 읽기는 여전히 두 번째 문단이 있으면 UnsupportedFormulaCellParagraphs입니다. 첫 문단12/두 번째34를1234로 합치지 않고12로 분류하며, 첫 문단이 비어 있으면 뒤의 숫자를 끌어오지 않습니다. 뒤 문단 control은 계속 거부합니다. 숫자 입력 guard도 같은 scalar 분류로 이전/초안 숫자 전환을 검사하도록 보완했습니다. 집중 native9/9·exit0을 확인했으나 이 변경의 실제 파일 재검사/전체 공개 회귀는 아직 하지 않았으며 별도 WASM 빌드가 진행 중입니다. 앞선136선언 실행은 이 정책 이전 소스 snapshot입니다.

구조 후보a61595로 기존 조회 실패5파일을 단계별 재검사했습니다. aift 구역2는6029문단/1수식, external BinData 구역0은2864문단/5수식 조회 및 저장 원문 일치였습니다(aift 전체 문서6343문단 관측과 구역2만의6029문단을 합치지 않습니다). 나머지는 열기는 성공하지만 nested_table_escape와 tac-img-02는 UnsupportedFormulaCellParagraphs, copay_cap은 InvalidFormulaReference로 paragraphTextSnapshot과 후속 save가 거부됩니다. 기본 제품6a2512는 aift/external의 UnsupportedMergedFormulaCell, nested의 UnsupportedFormulaCellParagraphs, copay의 InvalidFormulaReference, tac의 InvalidFormulaNumber를 동일 단계에서 재현했습니다. 초기 조사기의 open 단계에 save를 넣어 잘못 표시한 것은 수정 후 재실행했으며 열기 실패로 계수하지 않습니다.

독립 원문 조사에서 copay의 첫 식이 SUM(BELOW)임을 확인했습니다. [공식 한글 계산식 도움말](https://help.hancom.com/hoffice130_assistant/ko-KR/Hwp/table/calculation/calculation.htm)은 BELOW를 현재 셀 아래쪽 범위로 설명합니다. 임시 공통 formula_range에 BELOW 구문과 owner 제외/마지막 행/0행/u32 끝/상충 방향/후행 구문 검사를 추가했습니다. 범위 모듈 직접 ReleaseSafe6/6·exit0을 확인했습니다. root의 최초 선택 필터 실행은 root 선언1개만 실행해 기능 증거로 제외했습니다. 직접 selection 모듈 실행과 새 BELOW 반복/교차 검사, 별도 WASM 빌드는 후속 검증이며 a61595의 관측 결과를 새 후보에 소급하지 않습니다. 수식 관련 native136선언 실행도 a61595 소스 기준으로 아직 진행 중입니다.

구조 입력 보완 후보a61595의 후속 결과: 공개3파일17/17·exit0(55338.59625ms), 구조 거래/투영 거래/입력 guard 집중native5/5·exit0을 확인했습니다. [실제 설명 셀 SUM 저장 검사기](../tools/hwpx-text-sum-save-oracle.py)는 관측8×8표의 다섯 SUM을 가장 가까운 소유 표로 고르고 독립 셀 점유/Decimal 합산을 수행합니다. 원본에서 관측한 두 설명 문구만 제외하고 나머지 숫자를 재계산해 첫 결과127.76 및 나머지4결과 불변을 요구합니다. 기대 XML에는67.83→70 입력과 첫 필드 Command/LastResult/dirty/소유 결과 텍스트만 변경합니다. 전체 구역 XML 및 비대상 ZIP payload·entry 순서/주석/메타데이터/CRC가 일치해야 합니다.

실제 수정본은 Python 일반/-O 모두 통과했습니다. 각 모드에서 결과·수식 Command·dirty·설명 문구·비대상 header payload의5개 변조를 거부했습니다. 실제 전체 XML/비대상 payload 불일치만 부정 대조 성공으로 인정하며 검사기 실행 실패는 성공으로 처리하지 않습니다. 최초 oracle의 전체 descendant 기반 표 선택은 중첩 표의 조상을 중복 후보로 잡아 Source table identity로 실패했고, 독립 부모 관계에서 가장 가까운 표를 선택하도록 수정 후 재실행했습니다. 기대 차이를 삭제하거나 XML 차이를 넓게 허용하지 않았습니다. 이 검사는 실제 한 파일/한 숫자 전환의 지원 근거이며 전체 fixture/모든 집계/브라우저 조판 완료 증거가 아닙니다.

구조 입력 보완 후보 `/tmp/hwpjs-sum-text-structural-prototype/bin/hwpjs.wasm` SHA256은 `a61595a0c3d1510c8c7d0e315b0de54e8c8451551302465e2f59b355e66cd470`입니다. ReleaseSafe build5/5 steps·exit0, 관련 fmt check exit0을 확인했습니다. 참조 숫자 입력 수집/전환 검증을 formula_numeric_input_guard.validateFormulaTransition으로 모았으며 일반 formula_splice와 paragraph_structure_formula_splice가 이를 호출합니다. 구조 경로는 기존 paragraph_structure_projection으로 이전/초안 Sites를 만들고 검증한 뒤 기존 proxy save 검사를 수행하며, 마지막 ownership swap 전 오류는 현재 모델을 게시하지 않습니다.

이 후보에서 이전 실패 테스트인 실제 chart parent formatting/숫자 입력의 양방향 조합이1/1·exit0으로 통과했습니다. 기존 독립 XML/서식·undo/redo·잘못된 숫자 입력 거부 검사를 그대로 유지했습니다. 실제 external BinData 파일은 source 문단2715의67.83을70으로 변경하고 첫 SUM127.76, bad 치환의 InvalidFormulaNumber 및 저장본 불변, undo 원문 전체 바이트/redo 수정본 전체 바이트, 저장본 재열기 후127.76을 확인했습니다. 이 검사는 공개 WASM API/이력 왕복이며 아직 이 수정본의 독립 전체 XML/ZIP oracle이나 실제 브라우저 조작은 아닙니다. 후속3파일 전체 회귀와 구조 거래 할당 실패는 실행 중입니다. 기본 제품/원 작업 트리에는 런타임 변경을 반영하지 않았습니다.

후속 임시 후보 `/tmp/hwpjs-sum-text-prototype/bin/hwpjs.wasm` SHA256은 `4f067b3f6b1cce728debe08ee177e68c2f996e645433eeba1987d7ddb8ea09f1`이며 ReleaseSafe build5/5 steps·exit0을 확인했습니다. SourceReader/재귀 Reader에 scalar 조회를 추가해 SUM만 text/empty를 제외합니다. 숫자가 있는 병합 내부 좌표는 계속 거부하고, 텍스트를 제외하더라도 선택 사각형 겹침 및 projection 예산 검사는 먼저 수행합니다. AVG/PRODUCT/MIN/MAX의 숫자 전용 정책은 유지합니다.

formula_section_prepare의 기존 재귀 평가기가 읽은 숫자 셀을 선택적으로 기록합니다. formula_splice는 이전 값 평가로 실제 입력 목록을 얻고 별도 guard를 적용한 뒤 draft를 평가/게시합니다. 결과 셀은 입력 목록에 추가하지 않으며 numeric 목록의 중복 제거는 계산 주소의 중복 집계 의미를 변경하지 않습니다. 이 연결은 임시 사본에만 있고 기본 제품은 바뀌지 않았습니다. 기존 구조 편집 거래 등 다른 게시 경로의 정책까지 완료했다고 해석하지 않습니다.

연결 후 의존성/주입 reader/기존 산술/입력 수집 native10/10·exit0, 후속 SUM 문자 제외/AVG·PRODUCT 거부/입력 guard/투영 거래 할당 실패 native5/5·exit0을 확인했습니다. 실제 `issue1891_external_bindata_link.hwpx`의 open→paragraphTextSnapshot(0)2864문단→formulaCurrent(0)5필드 조회가 성공했습니다. 값은125.59/111.28/138.03/119.1/116.63이며 조회 후 save 전체 바이트는 원본과 일치했습니다. 이 파일의 실제 입력/이력/수정 저장 전체 XML/재열기/브라우저 검증은 아직 하지 않았습니다.

기존 공개 편집3파일 회귀는17개 중16통과/1실패·exit1(49430.570667ms)이었습니다. 실제48입력 독립 재계산은 통과했지만 chart parent formatting 후 잘못된 숫자 입력이 InvalidFormulaNumber로 거부되지 않았습니다(formula-editor.test.mjs:140). 단독 재현도1실패·exit1로 확인했습니다. flat formula_splice에만 연결한 guard가 서식 후 구조화된 입력 경로에는 적용되지 않은 후보이며, 제품 승격을 하지 않습니다. 검사기의 기대 오류를 완화하지 않고 구조 편집 경로에도 동일 검증을 연결해야 합니다.

임시 formula_numeric_input_guard는 호출자가 제공한 입력 셀 목록에서만 기존 숫자→새 값의 strict 숫자 검증을 수행합니다. 숫자 파서·선택 분기·예산 기본값은 기존 모듈을 재사용하고 draft를 게시하지 않습니다. 전체 셀에 적용하는 최초 연결은 참조하지 않는 숫자 셀의 문구 입력도 제한할 수 있어 제거했습니다. 입력 목록이 빈 경우 같은 문구 변경을 거부하지 않는 반례를 함께 검사했습니다. 실제 수식 참조에서 이 목록을 수집하는 연결은 아직 없으며, 이 guard를 통과하는 것이 구조/권한/수식 검증을 대체하지 않습니다.

해당 최종 guard의 ReleaseSafe 집중2/2·exit0, fmt check exit0을 확인했습니다. 지정 입력의 숫자→문구 거부·유효 숫자 허용·비대상 허용·사이트 identity 불일치 거부·전체 할당 실패와 이전 Sites 불변을 검사했습니다. 중간 빌드의 Zig 초기화 표현식 문법 오류는 수정 후 재실행했으며 통과로 계수하지 않았습니다. 최초 broad 연결의 별도 편집 회귀 실행은 최종 guard 연결/제품 검증으로 해석하지 않습니다. SUM 비숫자 정책은 아직 연결하지 않았습니다.

임시 source의 formula_cell_number는 기존 구조/선택 분기/현재 text site 수집을 한 경로로 유지하면서 number/text/empty 분류 진입점을 별도로 추가했습니다. 기존 strict 숫자 읽기는 그대로 InvalidFormulaNumber를 반환합니다. 분류는 해당 숫자 문법 오류만 text로 구분하며 구조 오류·할당 실패·선택 범위 오류는 삼키지 않습니다. 실제 SUM 집계나 편집 허용 정책에 아직 연결하지 않았고 제품 WASM에도 반영하지 않았습니다.

2026-10-11 후속 ReleaseSafe 집중 검사5/5·exit0과 fmt check exit0을 확인했습니다. 숫자·한글 문구·빈 값·공백·잘못된 숫자 문구 및 분류 전체 할당 실패를 검사했습니다. 제어 요소·빈 두 번째 문단은 strict 읽기와 분류 모두 거부하고, 선택된 default만 읽으며 활성 control 및 잘린 selection 배열도 두 진입점 모두 거부합니다. 이는 셀 분류 기초 검증이지 설명 문구가 있는 실제 파일의 SUM/AVG/PRODUCT 지원 완료 증거가 아닙니다.

추가 반례 후 집중 검사6/6·exit0, fmt check exit0을 확인했습니다. 129바이트 텍스트는 text로 완화하지 않고 LimitExceeded, 범위 밖/비셀 소유자는 InvalidFormulaCellOwner, 범위 밖 text site는 InvalidTextSites로 거부하며 원문 트리는 변하지 않습니다. 기존 formula_splice.prepareAndCommit은 formula_section_prepare 재계산의 실패로 숫자 입력을 검증합니다. 따라서 SUM의 비숫자 무시를 그 평가기에 바로 적용하면 기존 숫자→잘못된 문구 입력의 거부까지 사라질 수 있습니다. 집계 정책과 변경 셀의 숫자 입력 검증을 분리하기 전에는 제품 경로를 완화하지 않습니다.

공식 [한글 시트 함수 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/table/calculation/calculation(function).htm)을 다시 확인했습니다. SUM은 지정 범위의 합, AVG는 평균, PRODUCT는 곱으로 설명되지만 확인한 페이지에는 문자/빈 셀/병합 내부 좌표 처리의 상세 규칙이 없었습니다. 한셀 규칙을 한글에 그대로 적용하지 않습니다.

현재 RHWP tokenizer/parser/evaluator 원문을 직접 경로로 연결한 `/tmp/hwpjs-rhwp-sum-observation.P32MYG/probe.rs`를 rustc로 컴파일·실행했습니다(둘 다 exit0). 범위 ?3:?7에67.83/33.72/None/None/24.04를 주입하면 SUM125.59, AVG41.86333333333334, PRODUCT54984.95150399999였습니다. evaluator SHA256은 `c95076654acb9f350f95d470693a77f4d07b98e9fcfab46e628b495322b4228c`입니다. SUM의 값은 실제 외부 BinData 참조 파일의 저장 결과와 일치하지만 이 검사는 RHWP의 실제 파일 열기/편집/저장이나 한글 원본 프로그램 실행이 아닙니다. None은 검사기가 주입한 값이고 문자열/빈 셀/잘못 입력된 숫자의 분류를 검증한 것이 아닙니다. 이 정책을 그대로 이식하거나 AVG/PRODUCT의 한글 동치를 선언하지 않습니다.
