# 글자 모양·문단 모양 대화상자

현재 공용 글자 모양 창은 크기·굵게·기울임, 문단 모양 창은 여섯 정렬 값을 지원합니다. 단위 검사와 Noori HWP5/HWPX 대표 운영 경로의 적용·undo·저장·재열기 검증 범위를 구분합니다. 기존 API 지원, 이 부분 대화상자 구현, 전체 글자·문단 모양 완성은 서로 다른 상태입니다.

이 문서는 대화상자의 표시·초안·적용 경계를 설명합니다. 공개 API 목록은 [Headless API 범위](headless-api-coverage.md), 형식별 원본 보호와 전체 완료 기준은 [편집기 완료 조건](fixture-editor-completion.md)을 따릅니다.

## 현재 제공되는 기능

다음은 기존 API와 현재 창의 범위를 구분한 목록입니다. 크기·굵게·기울임과 정렬만 현재 창에서 적용하며, 나머지 API의 존재가 창 연결을 뜻하지는 않습니다. 원본 선택, capability, 문서 형식에 따라 거부될 수 있습니다.

| 항목 | 기존 API와 도구 | 대화상자와 구분할 점 |
| --- | --- | --- |
| 글자 크기·굵게·기울임 | `SET_CHARACTER_PROPERTIES_COMMAND` | 같은 선택의 세 속성을 한 명령으로 적용할 수 있습니다. 크기는 1/100pt 단위입니다. |
| 밑줄 | `SET_CHARACTER_UNDERLINE_COMMAND` | 별도 명령입니다. Boolean 조회값만으로 정확한 위치나 선 모양을 추정하지 않습니다. |
| 취소선 사용 | `SET_CHARACTER_STRIKE_COMMAND` | Boolean on/off입니다. 선 모양과 색 전체를 편집하는 명령은 아닙니다. |
| 문단 정렬 | `SET_PARAGRAPH_ALIGNMENT_COMMAND` | 기존 typed 정렬 명령입니다. 전체 문단 속성을 한 번에 바꾸는 API는 아닙니다. |
| 글자색 | `SET_CHARACTER_TEXT_COLOR_COMMAND` | 소스의 typed 조회·명령은 있으며 현재 창에는 연결하지 않았습니다. `#RRGGBB`와 원본 바인딩·권한 검증 및 Native 색 정책을 따릅니다. |
| 문단 여백·줄 간격 | 개별 Native/facade 기반 | 원본 단위와 대상 제약이 있습니다. 대화상자의 통합 적용 완료를 뜻하지 않습니다. |

문자 서식은 검증된 비어 있지 않은 원본 선택을 대상으로 합니다. 캐럿에서 다음 입력의 서식을 바꾸는 기능으로 해석하지 않습니다. 문단 정렬의 캐럿 대상은 기존 문단 선택 검사를 따릅니다. readonly, 오래된 선택, 불명확한 원본 소속을 UI에서 우회하지 않습니다.

저장소 소스에 있는 추가 명령을 현재 공개 번들에 포함된 것으로 가정하지 않습니다. 특히 글자색의 소스 지원과 공개 번들 반영 범위는 [원본 색상 정책](source-color-policy.md)을 함께 확인합니다.

## 현재 첫 대화상자

첫 글자 모양 창은 크기·굵게·기울임의 변경분만 기존 명령 한 번으로 적용하는 범위입니다. 첫 문단 모양 창은 정렬을 기존 명령 한 번으로 적용하는 범위입니다. 기본·확장 탭과 나머지 항목의 지원 이유를 표시하더라도, 미연결 항목을 적용됐다고 안내하지 않습니다.

글꼴·음영·일부 효과의 개별 Native/facade 경로는 현재 공용 창과 별개입니다. 이 첫 범위로 전체 글자·문단 모양의 목표를 대체하지 않습니다. 글꼴, 언어별 설정, 정확한 밑줄 위치·모양·색, 음영·효과, 여백·간격, 테두리·배경 등은 각각 조회·쓰기·원자 적용 계약이 필요합니다.

창을 열 때 선택과 상태를 함께 캡처합니다. 초안을 자동으로 다른 선택에 옮기지 않습니다. 기본 정책은 확인 시 고정한 대상에 적용하는 captured-target입니다. 새 복합 적용안의 `selectionVersion`은 선택 사항입니다. 값을 제공한 경우에만 해당 capability를 확인하고 실행 직전 선택 검사를 요구하는 방향입니다. 값을 생략한 기존 경로까지 strict 검사로 바꾸거나, 모든 대기열 경합이 차단됐다고 설명하지 않습니다.

## 값, 혼합값, 초안

공식 [CharShape](https://developer.hancom.com/en-us/webhwp/devguide/hwpctrl/properties/charshape)와 [ParaShape](https://developer.hancom.com/webhwp/devguide/hwpctrl/properties/parashape)는 선택 범위의 속성을 조회하며, 부분적으로만 다른 속성은 반환 항목에서 제외하고 설정 대상에 있는 항목만 반영하는 방식을 설명합니다. [GetDefault](https://developer.hancom.com/webhwp/devguide/action/methods/getdefault)는 현재 상태에 맞는 액션 인수를 얻는 API입니다.

우리 UI는 알려진 값, 혼합값, 알 수 없는 값, 사용할 수 없는 값을 구분해야 합니다. 사용자가 바꾸지 않은 초안은 별도 상태입니다. 빈칸이나 unknown을 false·0·기본 글꼴로 바꾸어 보내지 않습니다. 미수정 속성은 요청에서 제외하고, 명시적 해제나 0은 해당 필드의 검증을 거쳐 실제 변경으로 처리합니다.

빈 참고 문서에서 관측한 글자 크기나 줄 간격은 모든 문서의 기본값이 아닙니다. 읽을 수 없는 원본 필드에 임의 기본값을 채워 쓰지 않습니다. 단위 변환도 글자 크기와 문단 여백을 같은 규칙으로 묶지 않고 기존 Native 계약을 확인합니다.

## 남은 계약

| 구분 | 필요한 작업 | 완료로 보면 안 되는 근거 |
| --- | --- | --- |
| 원자 적용 | 여러 글자·문단 속성의 검증과 변경을 한 Native 계획, 한 commit, 한 undo로 연결 | 여러 setter의 순차 호출, `editor.update()` 수집, 실패 후 자동 undo |
| 조회 | 필드별 값·혼합·unknown·지원 이유, 단위·enum, 원본 존재와 writable을 같은 대상에서 관측 | Boolean에서 밑줄 위치 추정, UI 초안이나 캐시를 문서의 정답으로 사용 |
| 선택 검사 | `selectionVersion`을 제공한 요청에서 capability에 따라 문서·선택·소속을 실행 직전에 확인하는 fence | 기본 captured-target이나 기존 명령도 strict 검사한다고 주장 |
| 쓰기 | 언어별 metrics, 모든 선 모양, 글자·문단 테두리/배경, 줄 격자 등의 대상별 writer와 보존 검증 | parser, 기존 shape ID, Canvas 보기 옵션, 일부 outline/shade setter의 존재 |

복합 적용을 지원하지 않는 엔진에서는 이를 명시적으로 거부해야 합니다. 기존 단일 명령으로 몰래 분해해 전체 성공처럼 보이면 안 됩니다. 포맷 적용 capability와 이력 정책 버전은 서로 독립입니다.

`editor.update()`는 명령을 모아 순서대로 실행합니다. 뒤 명령이 실패해도 앞에서 반영된 변경은 남을 수 있습니다. 같은 옛 target은 첫 변경 뒤 오래된 대상이 될 수도 있습니다. 따라서 전체 대화상자의 원자 적용을 대신하지 않습니다.

<!-- dialog-box-model-20261026-f711ad56 -->
## 공통 창의 box-sizing과 찾기 입력 경계

2026-10-26, 소스 수정 `f711ad56`의 독립 검증입니다. 찾기 창이 `.hwp-demo` 밖의 sibling으로 생성되면 shell의 후손 전용 `border-box` 규칙이 적용되지 않았습니다. 실제 Chromium에서 input의 computed `box-sizing: content-box`와 `width:100%` 바깥으로 더해진 패딩·테두리를 확인했고, 520px 폭에서는 다음 찾기 버튼을 2px 침범했습니다. 공통 `.hwp-dialog-layer` 자체·후손·후손 가상 요소에만 `border-box`를 적용하며 전역 reset은 추가하지 않습니다.

찾기 input의 border와 `outline-offset:2px`는 떨어진 윤곽으로 보였습니다. CSS 선언이 outline 두 개를 그린다는 뜻은 아닙니다. 입력 포커스의 테두리를 표시하고 `:focus-visible`의 2px outline을 offset0으로 유지합니다. 실제 Chromium에서 마우스로 누른 text input도 `:focus-visible`이므로 이를 일괄 숨기지 않습니다. 버튼·다른 서식 컨트롤의 기존 키보드 포커스 표시는 유지합니다.

실제 TypeScript view를 타입 제거만 거쳐 독립 sibling DOM으로 실행했습니다. 320/520/522px × CSS zoom100/125/150% × 찾기/바꾸기 18조건에서 표시된 input/action button 겹침은 원본12조건에서 후보0조건으로 줄었고, 후보의 필드 경계와 dialog 수평 overflow 검사도 통과했습니다. 동일 판정식은 원본1통과·3실패, 후보4통과·0실패입니다. 근거는 `zig-out/verification/find-input-overlap-independent/`의 `GEOMETRY-final.json`, `originalfails.log`, `fixedpasses.log`, `FINAL-RECEIPT.json`입니다.

이 독립 18조건은 CSS view scale 검증이며 브라우저 자체 페이지 줌이나 Native 검증을 대신하지 않습니다. 후속 실제 앱 G3에서는 320/520px의 찾기·바꾸기와 예제·글자·문단·통계 창 12조건에서 겹침·수평 overflow·대상 하단 버튼·닫기 포커스 경계를 확인했습니다(`file-open-modal-css-integration/20261026T160928/RESULTS.json`). G4에서는 찾기·바꾸기 4조건과 320px의 나머지 창 4조건만 다시 확인했습니다(`find-pending-g4-harness/20261026T161925/RESULTS.json`). 공통 border-box의 외곽폭·스크롤 변화에 대한 이 대상 범위의 회귀 증거이며, 완전한 조판·모든 형식·모든 프레임워크 검증은 아닙니다.

공개 G4는 CI `40285971134`의 exact `9e208626` build/deploy 성공과 HTTPS28파일 SHA·bytes 일치, 찾기→Escape/닫기→재열기 2흐름을 확인했습니다(`format-dialog-production-candidate/generation4/live-9e208626/FINAL-RECEIPT.json`). 변경 요청0·HTTP/브라우저 오류0·private origin 유출0·브라우저 inactive도 이 범위에서 확인했습니다. 공개에서 18조건·12조건·8조건 전부를 다시 실행했다는 뜻은 아니며, 특정 reload timeout의 페이지 비활성 원인 분리와 검색 수명은 [헤드리스 텍스트 도구](headless-text-tools.md)를 따릅니다.

## 취소, 오류, 포커스

접수 전 취소·닫기·Escape는 서식 명령을 보내지 않는 계약입니다. 확인을 접수한 뒤 창을 닫는 것은 Native 변경 취소가 아닙니다. pending 중 중복 적용을 막고 결과를 받을 수명은 유지해야 합니다.

실패하면 원래 오류와 초안을 보존합니다. 이미 반영됐지만 재관측이 필요한 결과는 편집을 다시 보내지 않습니다. 닫은 뒤에는 같은 문서의 최신 유효한 선택일 때만 호스트 포커스를 돌려줍니다. 이전 선택을 강제로 복원하거나 새 문서의 포커스를 빼앗지 않습니다.

Tab, 조합 입력, Enter/Escape, 창 크기 변경, readonly·혼합 선택, 적용 후 undo/redo, 독립 CFB/XML 저장과 재열기는 각각 확인할 게이트입니다. 기존 dialog 관측이나 다른 기능의 테스트 통과를 새 대화상자의 완료 근거로 합산하지 않습니다.
