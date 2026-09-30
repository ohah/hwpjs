# HWP5 기존 글자 모양 적용 실험

[모듈 인덱스](hwp5-modules.md) · [텍스트 편집·저장 제한](hwp5-plain-text-edit-experiment.md)

## 계약과 제한

실험용 opaque `Session.apply(.{ .set_character_format = ... })`는 `section`, `paragraph`, `start_unit`, `end_unit`, `char_shape_id`를 받습니다. 현재 모델의 UTF-16 위치 `[start_unit, end_unit)`에 DocInfo에 실제 존재하는 0-based CharShape ID를 적용합니다. 명세 4.3.3의 시작 위치·ID 쌍을 저장하며 새 글꼴·굵기·크기 리소스는 만들지 않습니다. ID가 존재한다는 검사는 해당 리소스의 모든 렌더링 의미를 지원한다는 뜻은 아닙니다.

최상위 일반 텍스트 문단만 지원합니다. 문단 끝 PARA_BREAK는 선택할 수 없으며, 서로게이트 쌍 중간의 선택·서식·범위 경계, 역순/초과 위치, 없는 ID와 불투명 구조는 거부합니다. 빈 선택은 입력할 글자의 향후 서식을 설정하지 않는 no-op입니다. 선택 전체가 이미 요청 ID이면 원래 서식 경계를 정규화하지 않고 no-op으로 남깁니다. 첫 no-op 저장은 전체 원본 바이트와 같습니다. 변경 시 인접한 같은 ID 경계는 병합하고 선택 밖의 코드 단위 서식을 보존합니다. 끝 표식 및 글자 수는 바꾸지 않습니다.

텍스트 길이가 그대로이므로 범위 tag의 위치·종류·데이터·순서와 빈 범위도 그대로 유지합니다. 텍스트 삽입/삭제의 명시적 범위 이동 정책과 다릅니다. 서식 변경 후 텍스트 편집은 기존 splice의 범위 정책을 계속 따릅니다. 모든 소유 버퍼를 준비한 뒤 모델을 갱신하며 오류/할당 실패는 기존 모델을 유지합니다.

서식 변경도 글자 폭·줄 배치에 영향을 줄 수 있어 줄 캐시를 제거하고 `layout_requires_reflow=true`로 저장합니다. 기본 save의 거부와 미리보기·caret·한컴 GUI·HWPX·공개 JS/WASM API 제한은 위 텍스트 편집 문서의 공통 저장 계약을 따릅니다. 서식 되돌리기는 원래 줄 캐시를 복원하거나 전체 파일 byte-exact 복귀를 보장하지 않습니다.

## 책임과 SSOT

- `plain_text_content.zig`: 토큰 바이트 조립·일반 UTF-16 내용·scalar 경계 검증. 두 편집 모듈의 공통 계층이며 텍스트/서식 명령을 소유하지 않습니다.
- `character_runs.zig`: 현재 서식 경계 검증 및 span 교체·분할·병합. splice의 상속 서식과 서식 명령의 지정 ID를 같은 구현으로 처리합니다.
- `character_format.zig`: ID/선택 검증·no-op 판정·범위 보존·원자적 모델 반영. 원본 적격성은 `plain_text_source.zig`, 출력은 기존 `text_section_writer.zig`를 재사용합니다.
- `style_preservation.zig`: 세션·자원 수·명령 전달과 기존 저장 경계. 원본과 편집값을 중복 mutable 캐시로 관리하지 않습니다.
- `character-format-audit.mjs`: 기존 파일 probe/CFB.js/Node zlib/Rust oracle을 재사용하되 코드 단위별 독립 서식 배열로 기대 Section을 구성합니다. 텍스트 splice oracle과 분리합니다.

## 검증 기록

2026-10-01 Debug·ReleaseSafe·ReleaseFast 실측: 실제 HWP 5개에서 처음·중간·마지막 문단의 전체/부분/빈 선택을 검사하고, 혼합 서식 6단위 문단의 모든 28개 시작/끝 조합에 ID 0·1·2를 적용했습니다. 연속 재서식·병합·저장 후 재열기·서식 후 emoji 삽입·재서식, 범위의 빈 항목 보존, 별도 루트 소유권 반례를 합쳐 각 모드에서 서식 audit 152건이 통과했습니다. 일부 건은 실제 파일에서 파생한 합성 입력이며, 152개 서로 다른 실제 문서를 검증한 것이 아닙니다.

잘못된 ID/선택/구역/문단, 조판 opt-in 누락, surrogate 양 끝, 중첩 문단, 미해석 tag·헤더 꼬리·필드·개수/텍스트/서식 손상은 20건의 정상 오류 거부로 검증했습니다. 변경 무시·다른 문단 변경 출력 반례 2건을 oracle이 검출했습니다. 전체 Section과 비선택 스트림 바이트, Rust JSON에서 선택 문단 밖의 값과 선택 문단 텍스트를 대조했습니다.

집중 Zig 검사는 기존 4개에 같은 세션의 혼합 명령·실패 원자성 및 모든 open/apply/save 할당 실패 검사를 추가해 6개가 통과했습니다. 공유 경계 모듈로 변경한 뒤 기존 텍스트 audit의 실제 편집 75건·경계 56건·합성 21건·거부 20건·oracle 반례 3건도 통과했습니다. 이는 일반 편집기/전체 corpus/한컴 표시 동등성의 증명이 아닙니다.

제품 소스의 별도 임시 복사본에 요청 CharShape ID 대신 `ID ^ 1`을 적용하는 결함을 넣었습니다. ReleaseSafe probe 컴파일은 성공했고 새 서식 audit의 전체 Section 기대값 assertion에서 실제 잘못된 출력이 검출됐습니다. 제품 소스에는 결함을 적용하지 않았습니다. 전체 ReleaseSafe Zig 테스트는 7/7 단계·2,687/2,687 테스트·종료 코드 0으로 통과했습니다. 기존 코어 2,681개와 집중 검사 6개의 합이며 별도 스타일 검사 수를 중복 합산하지 않습니다. 미리보기·문서 도구 Node 회귀 17개도 통과했습니다.

ReleaseSafe 기존 스타일 audit은 집중 검사 4개·실파일 편집 12건이 통과했고, ReleaseSafe 제품 WASM 빌드와 변경 Zig/JS의 형식·구문 검사도 통과했습니다. 결과는 이 실험용 native 세션의 계약에 한정합니다.
