# HWPX 보호 개체 앵커 위치 기반

## 현재 계약

`run_anchor.zig`는 직접 `p/run`의 표·그림·수식·사각형·선·묶음과 단일 각주/미주 또는 허용 모양 자동 번호 자식 `ctrl`을 구조적 앵커 후보로 구분합니다. 정확한 namespace와 직접 소유를 확인하며 fieldBegin/fieldEnd·pageNum/newNum·단 설정을 임의 개체로 바꾸지 않습니다. 개체 내부 원값·참조 유효성·렌더링 검사는 기존 개체 모듈의 책임입니다. 이 분류는 편집 허용 판정이 아닙니다.

`anchor_text_positions.zig`는 기존 현재 텍스트·탭 projection에 원문 순서의 앵커를 합칩니다. 텍스트 길이는 기존 segment의 UTF-16 길이를 재사용하고 다시 계산하지 않습니다. 앵커는 한 보호 단위를 차지하며 index는 원문 Tree 요소 인덱스입니다. 중첩 문단 텍스트는 바깥 문단에 합치지 않고 직접 run 소유가 아닌 텍스트 사이트를 거부합니다. 반환 배열은 호출자가 해제합니다.

공유 `validateRange`는 탭과 앵커 삭제 겹침을 ProtectedInlineControl로 거부합니다. 공유 거래는 앵커를 U+FFFC 한 단위로만 비교하고 해당 원문 요소를 수정하지 않습니다. 뒤쪽 텍스트의 splice 인덱스는 앵커 보호 단위를 포함합니다. `run_text_boundaries.zig`는 직접 run의 보호 앵커 앞뒤 빈 입력 경계를 열거합니다. 세션은 명시적 수집 옵션으로 이를 등록하고 실제 입력 시에만 같은 run 안에 hp:t를 생성합니다. 기존 실제 텍스트 사이트의 삽입 우선순위를 유지하며 인접 개체의 공유 경계는 중복 생성하지 않습니다. 일반 주석 prefix 자동 번호는 기존 0단위 계약을 위해 제외합니다.

기존 일반 문단·필드의 offset 계약은 그대로 유지합니다. 별도 native `Session.anchorText/spliceAnchored`, WASM `hwpx_edit_anchor_text/hwpx_edit_splice_anchored`, JS `anchorText/spliceAnchored`가 보호 단위 포함 경계를 제공합니다. 기존 canEdit는 일반 문단 적격성만 반환하며 anchored 적격성·텍스트 조회는 anchorText의 성공으로 확인합니다. 반환 UTF-8 출력은 기존 output 수명 경계를 사용하고 JS가 복사 후 해제합니다. 선두 U+FEFF도 문자열 내용으로 유지합니다.

`anchor_paragraph_edit.zig`는 기존 구조 정책의 opt-in 앵커 허용과 위치 조립·공유 거래를 연결합니다. 계산 필드가 있는 구역은 기존 formula 거래의 같은 초안·재계산·swap 경로를 사용합니다. 앵커 분류를 reason 없는 무제한 ctrl 허용으로 바꾸지 않으며 숨은 wrapper 문자·혼합 필드·외부 namespace는 거부합니다.

Worker는 일반 편집 불가 문단에서 native anchorText를 조회해 U+FFFC가 포함된 파생 표시와 anchored 명령을 연결합니다. native가 offset의 SSOT이며 JS는 XML이나 원문 길이를 추정하지 않습니다. 표시 200000 단위 한도에서 잘리면 편집을 비활성화하고 일반 필드 경로도 유지합니다. U+FFFC는 보호 위치 표식이지 실제 개체 렌더링이 아닙니다.

## 검증 기록

개체 경계 물질화 최종 회귀: 전체 ReleaseSafe native 2791/2791·빌드 7/7이 종료 코드 0으로 완료됐습니다. 최신 제품 HWPX 26/26·빌드 7/7, HWP5 편집 69/69·빌드 7/7도 통과했습니다. 아래 이번 단계 중간 기록의 '실행 중' 및 '아직 남아 있음'은 이 최종 결과와 실제 브라우저·oracle 손상 검증 결과로 대체합니다. 문서 587개 현재 해시·로컬 링크 3038개 대상·문서 도구 2/2·포맷·diff 검사도 통과했습니다. anchored 거부 20개를 현재 공개 API로 재조회해 chart 계산 필드 13개와 별도 라벨 targets를 반환하는 hyperlink/교차 필드 7개로 확인했습니다. Worker는 일반→앵커→필드 경로를 분리합니다. 전체 파서·문단 구조 편집·원본 조판·RHWP 수준 UI의 완료는 아닙니다.

실제 외부 Chromium Canvas에서 shapeline 첫 문단을 포인터로 선택해 개체 앞 `앞😀` 입력을 확인했습니다. Delete는 ProtectedInlineControl로 거부하고 기존 입력·두 앵커를 복원했으며, 후행 입력과 Home/방향키로 UTF-16 위치 4를 확인한 뒤 두 개체 사이 `중간😀` 입력도 적용됐습니다. textarea/상태 출력과 `/private/tmp/hwpjs-object-boundary-e2e.png` 캡처를 직접 확인했습니다. agent-browser 자동화 입력이며 실제 OS IME·원본 개체 렌더링·쪽 조판 검증은 아닙니다. 이 스킬은 실제 포인터·키보드 경로와 캡처 검증에 사용했습니다.

추가 적대적 검증: 실제 shapeline 저장 ZIP의 선 개체 id를 변조한 복사본을 독립 Python 일반/최적화 비교기가 모든 세 입력 위치에서 complete XML mismatch로 거부했습니다. 새 native 경계 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 3/3입니다. `hwpx-anchor-corpus-audit.mjs --leading-boundary`는 선두 앵커 뒤로 위치를 이동하지 않고 문단 위치 0에서 입력을 시도하며 기존 조사 모드와 구분해 출력합니다. 45개 파일 중 암호화 1개 별도, anchored 후보 157개 중 137개가 선두 삽입·저장·재열기·원본 ZIP 복원에 성공했고 20개는 UnsupportedParagraphControl로 거부했습니다. InvalidTextPosition 거부는 0개입니다. 이 조사는 모든 위치나 독립 전체 XML 대조를 대신하지 않습니다. 최신 전체 ReleaseSafe native 회귀는 실행 중입니다.

2026-10-02 제품 ReleaseSafe 빌드 5/5와 공개 API 집중 회귀 5/5가 통과했습니다. 새 `object-boundary-editor.test.mjs`는 실제 shapeline 첫 문단의 개체 앞·사이·뒤 입력, 보호 개체 삭제 거부 후 무변경 ZIP, 저장·재열기·재저장·원본 ZIP 정확한 복원을 검사합니다. Python 일반/최적화의 독립 전체 XML 트리와 다른 ZIP payload 비교도 각 경계에서 통과했습니다. 후행 경계는 기존 빈 hp:t를 재사용한다는 것을 원문과 저장 트리에서 확인하고 oracle 기대값을 수정했습니다. 기존 ReleaseSafe 주석 4/4·일반 문단 11/11·필드 23/23도 통과했습니다. 새 공개 검사는 정규 hwpx-text-audit에 포함했습니다. 전체 회귀·oracle 손상 반례·실제 브라우저 검증은 아직 남아 있습니다.

2026-10-02 경계 물질화 구현 중: `run_text_boundaries.zig`는 보호 개체의 직접 run 내 앞뒤 원문 오프셋을 열거하고 인접 개체의 공유 경계를 중복 생성하지 않습니다. 세션의 명시적 수집 옵션은 빈 사이트를 등록하며 실제 입력할 때만 기존 source writer로 같은 run 안에 `<hp:t>`를 생성합니다. 기존 실제 텍스트 사이트의 삽입 우선순위를 유지하고, 일반 주석 prefix의 자동 번호는 기존 0단위 계약을 위해 제외합니다. 초기 반례에서 run 소유 빈 사이트를 hp:t의 inline 자식으로 오인해 UnsupportedInlineControl로 거부하는 검증 오류를 재현하고 수정했습니다. 새 ReleaseSafe 집중 검사 3/3은 개체 앞·사이·뒤 입력, 이모지 UTF-16 위치, 삭제 보호, XML escaping, 원본 XML 정확한 복원과 모든 할당 실패의 거래 보존을 확인했습니다. 실제 파일 공개 API·독립 전체 XML/ZIP 비교·브라우저 및 전체 회귀는 아직 이 변경의 완료 근거가 아닙니다. 아래 과거 전체 회귀 결과와 구분합니다.

자동 번호 추가의 최종 검증: 전체 ReleaseSafe native 2786/2786·빌드 7/7, 최신 HWPX 제품 23/23·빌드 7/7, HWP5 편집 회귀 69/69·빌드 7/7이 종료 코드 0으로 완료됐습니다. 아래 중간 기록의 '실행 중' 항목은 이 결과로 대체합니다. 문서 링크 3030개 대상 누락 0과 도구 반례 2/2, 포맷·diff 검사도 통과했습니다. 독립 XML/ZIP 비교와 세 손상 변이·실제 외부 브라우저 Canvas 입력은 아래 범위에 한정하며 전체 파서·RHWP 수준 UI·원본 쪽 조판 완료를 뜻하지 않습니다.

자동 번호 보호 앵커: `retained_auto_number.zig`는 직접 `autoNum`의 형식 부재 또는 단일 leaf `autoNumFormat`을 원문 보존 대상으로 허용하고 속성 의미는 기존 번호 필드 파서에 둡니다. `element_whitespace_gaps.zig`가 주석 번호와 ctrl 앵커의 숨은 source gap 검사 규칙을 공유합니다. 기존 일반 주석 prefix는 format 필수·0단위 계약을 유지합니다. Debug·ReleaseSafe·ReleaseFast anchored 집중 검사 각각 4/4와 기존 ReleaseSafe 주석 편집 검사 4/4가 통과했습니다. 번호 삭제 거부·이모지 위치·후행 편집·번호 XML 보존과 숨은 문자/CDATA/주석/PI/문자 참조/중복 format/미지 자식 거부를 포함합니다. 실제 table-caption의 8개 캡션 앞뒤 삽입·번호 삭제 거부·재열기·복원과 독립 Python 일반/최적화 전체 XML 및 다른 ZIP payload 비교가 통과했고 최신 공개 API/Worker 집중 검사 7/7과 제품 빌드 5/5도 통과했습니다. 전수 anchored 조사는 45개 파일·암호화 1개·161후보 중 137개 성공, UnsupportedParagraphControl 24개로 종료했습니다. 외부 Chromium 포인터 선택·앞😀/뒤😀 입력·번호 위치 5 Delete 거부·입력 복원을 확인하고 `/private/tmp/hwpjs-number-anchor-e2e.png`를 직접 관찰했습니다. agent-browser 입력이며 OS IME·번호 생성·조판 증명은 아닙니다. 일괄 제품 검사 중 새 복원 oracle의 Python stdin 종료 대기가 관측되어 해당 테스트를 한 줄 입력 및 30초 제한으로 변경했습니다. 수정 후 제품 일괄·전체 native 회귀·문서 해시 검증은 실행 중이므로 아래 기존 실측에 합산하지 않습니다. pageNum·newNum의 표시/메타데이터 의미는 이 변경으로 지원하지 않습니다.

Debug·ReleaseSafe·ReleaseFast 위치 집중 검사 각각 4/4에서 원문 순서·현재 텍스트 수정 뒤 앵커 위치 이동·이모지 단위·주석 내부 문단 제외·앵커 삭제 거부·뒤쪽 텍스트만 수정·실제 각주/미주 문단의 두 참조와 모든 projection 할당 실패를 확인했습니다. 개체 안 직접 hp:t가 바깥 문단 ordinal을 받는 반례는 SourceBindingMismatch로 거부합니다. 기존 ReleaseSafe 필드 회귀 23/23·일반 문단 회귀 10/10도 통과했습니다.

anchored 거래 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 3/3으로 모든 할당 실패 시 현재 텍스트·원문 보존과 wrapper 숨은 문자/필드 혼합/외부 namespace 거부를 확인했습니다. 기존 formula 거래 할당 실패 2/2도 통과했습니다. 제품 HWPX audit 21/21·빌드 7/7에서 실제 주석 두 참조 앞뒤 편집·삭제 거부·원본 ZIP 복원·재열기와 독립 Python 일반/최적화 전체 XML 및 나머지 ZIP payload 대조를 확인했습니다. Worker 실제 경로의 보호 표식·명령·거부 검사도 포함합니다.

전수 조사 도구 `hwpx-anchor-corpus-audit.mjs`는 일반 canEdit=false 문단에 별도 anchored 명령을 시도합니다. 첫 맨 앞 삽입 검사에서는 45개 파일(암호화 1개 별도)·161후보 중 23개 성공, InvalidTextPosition 86개, UnsupportedParagraphControl 52개였습니다. 선두 보호 앵커 뒤 실제 텍스트 경계에서 수행한 후속 검사는 109개 편집·저장·재열기·원본 ZIP 복원 성공, UnsupportedParagraphControl 52개로 종료했습니다. 이는 미지원 경계를 숨기거나 모든 위치 입력을 지원한다는 뜻이 아닙니다. 이 전수 도구는 제품 재열기 비교이며 독립 전체 XML 대조의 대체가 아닙니다. 최신 전체 ReleaseSafe native 회귀 2785/2785·빌드 7/7이 통과했습니다. 이 통과는 남은 위치 물질화·개체 조판 완료의 증명은 아닙니다.

실제 외부 Chromium에서 주석 참조 문단을 포인터로 클릭해 `앵커😀` 입력, End/Backspace로 앵커 삭제 시 ProtectedInlineControl 거부와 원래 입력 복원, 거부 후 뒤쪽 `뒤😀` 입력을 확인했습니다. 첫 캡처의 U+FFFC가 현재 시스템 글꼴에서 보이지 않는 문제를 발견해 공통 displayRunText에서 `◇`로 표시하도록 수정했습니다. 렌더러와 hit-test 측정은 같은 함수를 사용하며 원문·native 보호 단위는 변경하지 않습니다. 새 캡처 `/private/tmp/hwpjs-hwpx-anchor-visible-e2e.png`에서 두 표식을 직접 확인했습니다. 공개 Canvas/HWPX 집중 회귀 11/11과 최신 제품 HWPX audit 22/22·빌드 7/7도 통과했습니다. agent-browser inserttext 검증이며 실제 OS IME 증명은 아닙니다.

직접 보호 앵커의 빈 경계 입력은 위 범위로 구현·검증했습니다. 모든 미지원 컨트롤의 입력 경계, 개체 삽입/삭제·주석 생성·원본 표/쪽 조판과 RHWP UI 완성은 미완료입니다. 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

자동 번호 추가 후 남은 anchored 거부 24개를 직접 조사했습니다. chart 13개는 계산 필드 결과로 일반 anchored 거래가 아니라 기존 수식 입력 편집·재계산 경로가 소유합니다. hyperlink 4개와 문단 교차 필드 3개는 anchored 거부이며 기존 제한적 필드 라벨 편집과 구분합니다. 나머지 4개는 header/footer 소유 문단 1개와 pageNum을 가진 noori/page/table-bug 각 1개입니다. 이 24개를 모두 파서 오류 또는 모든 종류의 편집 불가로 해석하지 않습니다. pageNum은 본문 자동 번호와 달리 쪽 번호 배치 설정이므로 별도 0단위 메타데이터 계약을 검토해야 합니다. 독립 비교기 반례는 번호값·텍스트·mimetype payload의 세 변이를 실제 ZIP에 넣어 Python 일반·최적화 모드 모두에서 거부되는지 확인했습니다.
