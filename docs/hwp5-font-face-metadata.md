# HWP5 글꼴 메타데이터 전달

## API와 소유권

기존 `fontFaces()`의 language/id/name 응답은 변경하지 않습니다. 선택적 `fontFaceMetadata()`는 별도 `hwp5_edit_font_face_metadata` ABI를 사용합니다. wire는 `{version:1, fonts:[...]}`이며 JS는 fonts 배열을 반환합니다. 구형 WASM은 `Hwp5FontFaceMetadataAbiUnavailable`로 보고하고 기존 글꼴 조회·편집은 유지합니다.

각 행은 language/id/attributes/substitute/typeInfo/defaultName을 갖습니다. substitute는 부재이면 null, 존재하면 `{kind,name}`입니다. name/defaultName의 빈 문자열과 null은 다르며, 부재·손상 UTF-16 구분은 원래 attributes presence bit와 함께 읽습니다. typeInfo는 정확히10개의0~255 정수 또는 null입니다. 알 수 없는 속성 비트·대체 종류는 원값을 보존합니다. 유형 바이트를 JSON 문자열로 쓰지 않습니다.

`font_face_snapshot.zig`의 공통 순회가 기존 이름 조회와 새 메타데이터 조회의 언어별 ID 분할을 소유합니다. 원시 FaceName 파서를 다시 구현하지 않습니다. 각각의 스냅샷은 호출자 소유 문자열을 가지며 부분 할당 실패에도 정리합니다. Session은 원본+현재 글꼴 편집값으로 만든 DocInfo를 같은 경로로 읽으므로 추가 글꼴과 undo/redo도 현재 상태를 반영합니다. 조회로 원본이나 편집 모델을 변경하지 않습니다.

JS decoder는 `font-face-identity.mjs`의 언어 목록·언어별 ID 검사와 `font-metadata-wire.mjs`의 packet/문자열 검사를 공유합니다. 형식별 JSON 필드와 presence 검사는 각 wire decoder가 소유합니다.

## Worker와 표시 정책

`character-font-content.mjs`는 선택적 조회를 수행하고 결과/오류를 별도로 전달합니다. 조회 실패가 글꼴 이름·서식 편집 지원으로 전파되지 않습니다. `character-font-display.mjs`는 같은 language/id의 기본 이름 다음에 명시된 TTF 대체 종류1의 유효한 이름만 CSS 후보로 추가합니다. 중복·빈 값·손상 이름은 추가하지 않으며 미지 종류와 HFT는 자동 적용하지 않습니다. 두 이름 모두 기존 CSS escaping을 적용합니다.

defaultName과10개 유형 정보는 전달만 하며 임의의 대체 우선순위를 만들지 않습니다. CSS 후보 목록은 글꼴 설치·글리프 존재·한글과 같은 font matching을 보증하지 않습니다. 현재 실제 글꼴/글리프 선택은 브라우저가 소유하며 해당 결과를 확정한 별도 상태 API는 없습니다. HWPX의 별도 형식은 [HWPX 메타데이터](hwpx-font-face-metadata.md)가 소유합니다. 글꼴 폭·baseline·전체 페이지 동치는 후속 검증입니다.

## 실제 검증

ReleaseSafe 분리 후보 `/tmp/hwpjs-font-metadata.WKpyZL/isolated/bin/hwpjs.wasm`의 최종 SHA256은 `2d8ae483c4f017ca71a0f7b44788a90e428fba7e42b0ba179d4e2a2179791e4c`입니다. 실제 API 검사에서 유형 바이트가 JSON 문자열이 되는 결함을 먼저 재현했고 숫자 배열로 수정했습니다. native 테스트에도 그 직렬화 반례를 추가했습니다.

레거시 facename/noori/shapecontainer-2/table-bug4파일의 메타데이터·기존 API 키·무변경 저장·조회 사본 분리·새 글꼴 추가·undo/redo·닫힌 세션 거부를 검사했습니다. 첫 문자에 있는 제어 토큰을 자르던 테스트는 실제 일반 문자 위치를 독립적으로 찾아 선택하도록 수정했으며 제품의 제어 토큰 보호를 완화하지 않았습니다. 실제 Worker 조회도 독립 DocInfo 원문과 일치했습니다. wire/표시·기존 행간·PDF·글꼴 회귀는24/24(skip0) 통과했습니다.

구형 후보의 실제 ABI 부재·기존 이름 조회/저장 유지도 추가 검사했습니다. 이 검사는 `HWPJS_BASELINE_WASM`이 없으면 명시적으로 skip합니다. 마지막 분리 소스의6파일은 baseline을 지정해24/24·skip0 통과했습니다. 앞의 작업 트리24개와 중복되므로48개로 합산하지 않습니다. native 집중 검사는 Debug/ReleaseSafe 각각5/5(실제 대상4개+root 진입 검사1개) 통과했습니다. `zig build test -Doptimize=ReleaseSafe` 전체와 진단 스택 수집만 끈 별도4031개 실행은 완료 전에 중단했습니다. 후자는 기존 `created table field label allocation failure sweep restores complete saved state`에서 실행 중이었고 샘플링에서 open/prepare/stage 등 실제 실행을 확인했습니다. 두 실행을 전체 native 통과로 계산하지 않습니다.

RHWP의 독립 조사 성공510경로를 새 공개 API로 대조했습니다.437경로·19,827리소스에서 모든 메타데이터가 일치하고 무변경 저장 바이트도 같았습니다. 대체 정보가 있는178경로 중162경로가 이 성공 집합에 들어갑니다. 나머지73경로는 open 단계에서 RepairedSourceUnsupported69/UnexpectedEnd1/SectionCountMismatch3으로 거부됐습니다. 수정 전 WASM과 경로·오류값이 모두 같은73개임을 확인했습니다. 이73개 및 그 안의 대체 정보16경로를 통과로 계산하지 않습니다. 임시 전수 스크립트·결과는 `/tmp/hwpjs-font-metadata.WKpyZL/corpus*`에 있습니다.

같은 조사를 재실행하는 `tools/hwp5-font-metadata-audit.mjs`도 보존했습니다. 확장자가 아닌 CFB 서명으로 후보를 구분하고, 암호/다른 형식/독립 oracle 오류/native open 거부/값 불일치를 따로 보고합니다. `coverageComplete:false`는 미확인 후보가 남았다는 뜻입니다. 종료0은 검증된 집합의 값 불일치·baseline 차이가 없다는 뜻이지 모든 파일 성공이 아닙니다.

`agent-browser`로 분리 소스와 저장소의 Liberation Sans를 로드한 실제 Chromium Canvas를 검사했습니다. 통제된 라틴 문자열의 직접 대체 글꼴 폭117.28125px/직접 원래 글꼴131.25px/누락 글꼴의 monospace192.65625px를 구별했습니다. 원래 글꼴이 없을 때 후보 목록은117.28125px, 원래 글꼴이 있을 때131.25px, HFT 대체 제외 때192.65625px로 일치했습니다. 이는 통제된 글꼴 선택의 긍정·부정 대조이지 실제 한글 문서의 조판 동치가 아닙니다. 브라우저 오류는 없었고 사용한 전용 세션과 서버를 종료했습니다.
