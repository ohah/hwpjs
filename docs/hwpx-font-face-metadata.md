# HWPX 글꼴 메타데이터

## 계약과 책임

기존 `fontFaces()`는 변경하지 않습니다. 선택적 `fontFaceMetadata()`는 `hwpx_edit_font_face_metadata` ABI의 `{version:1,fonts:[...]}`에서 배열을 반환합니다. 구형 WASM은 `HwpxFontFaceMetadataAbiUnavailable`로 보고하고 기존 조회·저장은 유지합니다. Worker는 메타데이터 오류를 다른 글꼴 조회와 분리합니다.

행은 `{format:"hwpx",language,id,font,substitute,typeInfo}`입니다. font와 substitute는 `{face,type,isEmbedded,binaryItemIDRef}`이며 각 속성은 원문 문자열 또는 null입니다. substitute 요소가 없으면 null입니다. typeInfo도 요소가 없으면 null이며 존재하면 familyType/weight/proportion/contrast/strokeVariation/armStyle/letterform/midline/xHeight의 원문 문자열 또는 null을 갖습니다. 빈 문자열·명시적 0·부재·미지 값·숫자의 선행 0을 보존합니다. HWP5의 presence bit나 serif 바이트를 합성하지 않습니다.

헤더 namespace의 직접 자식만 읽고 중복 substitute/typeInfo는 거부합니다. `font_face_values.zig`가 언어·ID 검증을, `font_face_snapshot.zig`가 정렬·중복 검사를 공유합니다. `font_creation.zig`는 현재 편집 글꼴을 적용한 헤더를 투영합니다. 결과는 호출자 소유이며 부분 할당 실패에도 해제합니다. 공통 packet/문자열 검사는 `font-metadata-wire.mjs`, 언어·순서는 `font-face-identity.mjs`, 형식별 검증은 별도 decoder가 소유합니다.

## 표시 범위

기본 이름 뒤에 substitute.type이 `TTF`이고 isEmbedded가 명시적으로 `0` 또는 `false`인 외부 글꼴만 CSS 후보로 추가합니다. HFT/REP/미지 종류, 내장 글꼴, 내장 여부 부재·미지 값은 자동 적용하지 않습니다. escaping과 중복 제거는 공통 표시 경로를 사용합니다. 내장 글꼴을 로드했다고 가장하거나 typeInfo로 대체 우선순위를 만들지 않습니다. 글꼴 설치·실제 글리프 선택·폭·baseline·페이지 동치는 이 API의 보장이 아닙니다. [HWP5 계약](hwp5-font-face-metadata.md)과 원시 형식을 구분합니다.

## 검증 기록

2026-10-17 분리 ReleaseSafe 후보 SHA256 `4538251539d89471e12bc635d4897eba06d250fdb21a499dce899ccdc3db9fc8`을 독립 Python ZIP/XML oracle과 대조했습니다. RHWP samples ZIP 서명 후보 436개 중 435개·19,729리소스가 일치했고 무변경 저장도 바이트 단위로 같았습니다. 대체 정보가 있는 성공 파일은 168개입니다. 나머지 `HWP5-password-123456.hwpx`는 독립 XML oracle의 syntax error로 거부됐으며 성공으로 계산하지 않습니다. 기준 후보 `2d8ae483c4f017ca71a0f7b44788a90e428fba7e42b0ba179d4e2a2179791e4c`와 open 결과 차이는 0개였습니다.

전수 도구의 coverageComplete는 미확인 파일 때문에 false입니다. 종료 0은 비교 완료 집합의 불일치·baseline 차이가 없다는 뜻이며 모든 파일 지원이 아닙니다. 실제 API/Worker 검사는 원문 값, 기존 이름 응답, 무변경 저장, 새 글꼴, undo/redo를 대조합니다. native 집중 검사는 할당 실패·namespace·빈 값·미지 값·중복 자식을 포함합니다. 전체 native와 브라우저 조판은 별도 gate입니다.
