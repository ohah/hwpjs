# HWPX 보호 개체 앵커 위치 기반

## 현재 계약

`run_anchor.zig`는 직접 `p/run`의 표·그림·수식·사각형·선·묶음과 단일 각주/미주 자식 `ctrl`을 구조적 앵커 후보로 구분합니다. 정확한 namespace와 직접 소유를 확인하며 fieldBegin/fieldEnd·번호·단 설정을 임의 개체로 바꾸지 않습니다. 개체 내부 원값·참조 유효성·렌더링 검사는 기존 개체 모듈의 책임입니다. 이 분류는 편집 허용 판정이 아닙니다.

`anchor_text_positions.zig`는 기존 현재 텍스트·탭 projection에 원문 순서의 앵커를 합칩니다. 텍스트 길이는 기존 segment의 UTF-16 길이를 재사용하고 다시 계산하지 않습니다. 앵커는 한 보호 단위를 차지하며 index는 원문 Tree 요소 인덱스입니다. 중첩 문단 텍스트는 바깥 문단에 합치지 않고 직접 run 소유가 아닌 텍스트 사이트를 거부합니다. 반환 배열은 호출자가 해제합니다.

공유 `validateRange`는 탭과 앵커 삭제 겹침을 ProtectedInlineControl로 거부합니다. 공유 거래는 앵커를 U+FFFC 한 단위로만 비교하고 해당 원문 요소를 수정하지 않습니다. 뒤쪽 텍스트의 splice 인덱스는 앵커 보호 단위를 포함합니다. 문단 시작/끝에 삽입 사이트가 없는 경계는 별도 물질화·소유 계약이 필요합니다.

기존 일반 문단·필드의 offset 계약은 그대로 유지합니다. 별도 native `Session.anchorText/spliceAnchored`, WASM `hwpx_edit_anchor_text/hwpx_edit_splice_anchored`, JS `anchorText/spliceAnchored`가 보호 단위 포함 경계를 제공합니다. 기존 canEdit는 일반 문단 적격성만 반환하며 anchored 적격성·텍스트 조회는 anchorText의 성공으로 확인합니다. 반환 UTF-8 출력은 기존 output 수명 경계를 사용하고 JS가 복사 후 해제합니다. 선두 U+FEFF도 문자열 내용으로 유지합니다.

`anchor_paragraph_edit.zig`는 기존 구조 정책의 opt-in 앵커 허용과 위치 조립·공유 거래를 연결합니다. 계산 필드가 있는 구역은 기존 formula 거래의 같은 초안·재계산·swap 경로를 사용합니다. 앵커 분류를 reason 없는 무제한 ctrl 허용으로 바꾸지 않으며 숨은 wrapper 문자·혼합 필드·외부 namespace는 거부합니다.

Worker는 일반 편집 불가 문단에서 native anchorText를 조회해 U+FFFC가 포함된 파생 표시와 anchored 명령을 연결합니다. native가 offset의 SSOT이며 JS는 XML이나 원문 길이를 추정하지 않습니다. 표시 200000 단위 한도에서 잘리면 편집을 비활성화하고 일반 필드 경로도 유지합니다. U+FFFC는 보호 위치 표식이지 실제 개체 렌더링이 아닙니다.

## 검증 기록

Debug·ReleaseSafe·ReleaseFast 위치 집중 검사 각각 4/4에서 원문 순서·현재 텍스트 수정 뒤 앵커 위치 이동·이모지 단위·주석 내부 문단 제외·앵커 삭제 거부·뒤쪽 텍스트만 수정·실제 각주/미주 문단의 두 참조와 모든 projection 할당 실패를 확인했습니다. 개체 안 직접 hp:t가 바깥 문단 ordinal을 받는 반례는 SourceBindingMismatch로 거부합니다. 기존 ReleaseSafe 필드 회귀 23/23·일반 문단 회귀 10/10도 통과했습니다.

anchored 거래 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 3/3으로 모든 할당 실패 시 현재 텍스트·원문 보존과 wrapper 숨은 문자/필드 혼합/외부 namespace 거부를 확인했습니다. 기존 formula 거래 할당 실패 2/2도 통과했습니다. 제품 HWPX audit 21/21·빌드 7/7에서 실제 주석 두 참조 앞뒤 편집·삭제 거부·원본 ZIP 복원·재열기와 독립 Python 일반/최적화 전체 XML 및 나머지 ZIP payload 대조를 확인했습니다. Worker 실제 경로의 보호 표식·명령·거부 검사도 포함합니다.

전수 조사 도구 `hwpx-anchor-corpus-audit.mjs`는 일반 canEdit=false 문단에 별도 anchored 명령을 시도합니다. 첫 맨 앞 삽입 검사에서는 45개 파일(암호화 1개 별도)·161후보 중 23개 성공, InvalidTextPosition 86개, UnsupportedParagraphControl 52개였습니다. 선두 보호 앵커 뒤 실제 텍스트 경계에서 수행한 후속 검사는 109개 편집·저장·재열기·원본 ZIP 복원 성공, UnsupportedParagraphControl 52개로 종료했습니다. 이는 미지원 경계를 숨기거나 모든 위치 입력을 지원한다는 뜻이 아닙니다. 이 전수 도구는 제품 재열기 비교이며 독립 전체 XML 대조의 대체가 아닙니다. 최신 전체 ReleaseSafe native 회귀 2785/2785·빌드 7/7이 통과했습니다. 이 통과는 남은 위치 물질화·개체 조판 완료의 증명은 아닙니다.

실제 외부 Chromium에서 주석 참조 문단을 포인터로 클릭해 `앵커😀` 입력, End/Backspace로 앵커 삭제 시 ProtectedInlineControl 거부와 원래 입력 복원, 거부 후 뒤쪽 `뒤😀` 입력을 확인했습니다. 첫 캡처의 U+FFFC가 현재 시스템 글꼴에서 보이지 않는 문제를 발견해 공통 displayRunText에서 `◇`로 표시하도록 수정했습니다. 렌더러와 hit-test 측정은 같은 함수를 사용하며 원문·native 보호 단위는 변경하지 않습니다. 새 캡처 `/private/tmp/hwpjs-hwpx-anchor-visible-e2e.png`에서 두 표식을 직접 확인했습니다. 공개 Canvas/HWPX 집중 회귀 11/11과 최신 제품 HWPX audit 22/22·빌드 7/7도 통과했습니다. agent-browser inserttext 검증이며 실제 OS IME 증명은 아닙니다.

개체 앞뒤 삽입 사이트 없는 경계의 물질화, 개체 삽입/삭제·주석 생성·원본 표/쪽 조판과 RHWP UI 완성은 미완료입니다. 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.
