# HWP5 단순 문단 텍스트 편집 실험

## mainacacc886 기반 비접촉 범위 후보 (2026-10-16)

정규 root에 새 probe를 직접 등록한 집중 바이너리 `388a01fe7720911399c5604e2d428c2c7afc9a391ad81da137a3a505aff77f47`도 root 포함4/4·fail/skip/log/leak0·exit0입니다. standalone3선언/모드별 결과와 합산하지 않으며 게시 상태는 Git 이력으로 확인합니다.

정규 HWP5/CFB37파일은401/401·fail/cancel/skip0·exit0(528689.797458ms)입니다. source SHA-256 `8cfeb62de4d69154f490ae66755fdb16973305a1df9a2cb30b5dccd169b14a14`와 후보 WASM 해시의 전후 불변을 확인했으며 전체 로그는 분리 폴더의 `disjoint-ranges-registered-37.log`입니다. 집중14결과와 합산하지 않습니다. 전체 native·모든 필드/편집 명령·물리 IME·한컴 조판 완료나 기본 WASM 승격은 별도입니다.

후속 실제 브라우저에서 이전 포인터 관측의 원인을 구분했습니다. `.editor-command-bar`는 `overflow-y:auto`, clientHeight285/scrollHeight929의 별도 스크롤 영역입니다. 같은1280×633 viewport에서 버튼을 scrollintoview하면 toolbar scrollTop164, 버튼 y298..334는 toolbar y174..458.84375 안에 있고 중심 hit target도 `enable-edit`였습니다. `exam_social.hwp`에서도 같은 viewport를 유지한 채 해당 영역을 스크롤해 편집 시작과 저장 동의 checkbox를 실제 마우스로 조작했습니다(scrollTop451). 따라서 아래 최초 관측은 도구 모음 스크롤포트 밖의 버튼 좌표였으며, Canvas 레이아웃 결함으로 확정하지 않습니다. CSS를 임의로 바꾸지 않았고 이 후속 전용 브라우저/서버도 종료했습니다.

실제 Chromium의 전용 `hwpjs-disjoint-20261016` 세션에서 후보 HTTP WASM hash를 위 후보와 대조하고 원본 `exam_social.hwp`를 열었습니다. 검색 두 번째 결과의 실제 Canvas textarea에서 ArrowLeft 후 `keyboard inserttext`로 `캔버스😀`를 입력했습니다. 범위 동의는 꺼진 채이며 source section0/paragraph30/UTF16위치9의 입력입니다. 브라우저 다운로드 `browser-disjoint-edited.hwp`는 독립 전체 Section/비대상 stream/CFB metadata와 새 editor 재열기를 통과했고, range는 `[15,16]`에서 `[20,21]`로 이동했습니다. 저장 SHA-256은 `791ea8d322e2576122f6d15f9df8460d694c244e97f0555433b1e89b9a9a632f`입니다.

실제 undo 뒤 End 경계에서 `오류` 입력은 `UnsupportedRangeSemantics`로 거부됐습니다. 거부 뒤 다운로드는 원본 전체 bytes와 같고, 실제 redo 뒤 다운로드는 최초 편집본 전체 bytes와 같았습니다. uncaught page error는 없었습니다. 실제 브라우저 이벤트/Worker/WASM/다운로드 한 경로의 검증이며 물리 OS IME·모든 선택/명령·한컴 조판 검증은 아닙니다. 소유 브라우저와 loopback9028 서버를 종료하고 세션/포트 목록에서 부재를 확인했습니다. 다른 세션/디바이스는 종료하지 않았습니다.

최초 브라우저 검증은 초기1280×633 viewport, scrollY217에서 편집 시작 버튼 y409의 중심이 sticky Canvas(y406.84375)에 덮인 상태를 관측했습니다. 저장 동의 checkbox도 같은 상태여서 편집 준비는 키보드 focus/Enter로, 저장 동의/다운로드는1440×1100으로 조정한 뒤 실제 클릭으로 진행했습니다. 당시 도구 모음 자체의 스크롤을 별도로 조정하지 않았으며 위 후속 관측으로 원인을 구분했습니다. 전체 UI/모든 viewport 검증으로 확대하지 않습니다.

같은 native3선언의 Debug/ReleaseFast 직접 실행도 각각3/3·exit0입니다. 모드별 반복 실행을 독립9개 검사로 합산하지 않습니다. 전체 실패 주입은 공통 명시적 checked allocator를 유지합니다.

분리 폴더 `/tmp/hwpjs-disjoint-ranges-publication.KuvSjs`는 main에 원문 범위 매핑과 plain_text 연결 두 파일만 적용합니다. 후보 WASM SHA-256은 `774c0bcd3061399a3ca69ef23f8f3d331313bbc99626d56675eeb71dc40564a0`이며 기본 데모는 교체하지 않았습니다. 아래의 과거 후보/검증 기록과 산출물을 혼용하지 않습니다.

명세 표63은 시작/끝/태그와 중첩 가능성을 정의하지만 경계 삽입 affinity는 확정하지 않습니다. 기본 정책은 모든 현재 범위마다 `edit.end < range.start` 또는 `edit.start > range.end`인 경우만 허용하고 접촉·교차·둘러싸기는 거부합니다. 기존 위치 매핑을 공유하며 빈 마커·태그 원값·범위 순서를 보존합니다. 현재 소유 범위 배열은 빈 배열도 원본보다 우선합니다. 명시적 half-open은 기존 계약을 유지합니다. 구조 분할에 같은 허용을 확장하지 않으며 원본 범위가 있으면 계속 거부합니다.

native probe는 6개 좌표의 유효 범위/거래441조합·전체 할당 실패·빈 마커·후반 거부 정리·현재/원본 우선순위·길이 한도·서로게이트 분할을 검사합니다. ReleaseSafe 선택 바이너리 `c73c72b0a98dc4bb7b446d3c5287c504487b6581d1f9db55bfdca1327c0a1a34`는3/3·fail/skip/log/leak0·exit0입니다. 테스트 개수를 좌표 조합 수와 혼동하지 않습니다.

공개 회귀4파일14테스트는14/14·fail/cancel/skip0·exit0(32407.881542ms)입니다. 실제8파일256범위 문단은 독립 원본 inventory의 고정 개수와 대조하며37곳은 기본 prefix 허용,219곳은 기본 거부 후 명시적 정책을 검사합니다. 반복 입력은 현재 좌표와 범위 우선순위, 저장 전체 Section/비대상 stream·변조 기대값 거부·재열기·undo/redo·입력 파일 불변을 확인합니다. 7파일은 명시적 CFB 정규화 저장본이 기준이며 온새미로104곳은 정규화 없이 원본 저장 동치도 단언합니다.

별도의5파일144개 엄격한 suffix 위치는 삽입·삭제·전체 독립 Section·비대상 stream·거부 기대값·재열기·단계별 이력을 검사합니다. prefix와 suffix 위치를 고유 문단 수로 합산하지 않습니다. 파생 빈 마커1표본은 기본 입력 후 마커 보존, 현재 경계 접촉 거부와 redo 유지, 구조 분할 거부를 검사합니다. 이 파생 표본을 실제 원본 지원 개수에 더하지 않습니다. 수정 전 후보314fd38f는 같은 빈 마커 공개 검사에서 `UnsupportedRangeSemantics`로 실패해 새 입력 경로의 차이를 확인했습니다. 정규 API와 단일 브라우저 경로는 위 후속 결과를 따르며 전체 native·모든 Worker/브라우저 명령·물리 IME·한컴 조판 검증은 아직 완료되지 않았습니다.


이 문서는 native 명령·보존·저장 계약을 소유합니다. 아래 초기 구현 기록의 공개 API 부재는 당시 범위이며, 현재 제한적 JS/WASM 연결은 별도 [실험용 편집 API](hwp5-editor-api.md), 웹 입력은 [Canvas 직접 입력](canvas-direct-input.md)을 따릅니다. 일반 편집기·재조판 구현은 여전히 아닙니다.

[모듈 인덱스](hwp5-modules.md) · [이전 스타일 참조 실험](hwp5-style-preservation-experiment.md)

## 지원 범위와 API

기존 실험용 opaque `Session`에 `apply(.{ .splice_text = ... })`와 `copyText`를 추가했습니다. splice에는 구역·문단 index, `start_unit`·`end_unit`, 삽입할 `utf8`가 들어갑니다. 위치는 현재 모델의 UTF-16 단위이며 `[start_unit, end_unit)`를 교체합니다. 두 위치가 같으면 삽입, 빈 UTF-8이면 삭제입니다. 마지막 PARA_BREAK(13)는 변경할 수 없습니다. `copyText`는 끝 표식을 포함한 UTF-16LE 바이트의 소유 복사본을 반환합니다. 호출자가 전달한 allocator로 해제합니다. JS/WASM 연결은 위 별도 API 문서의 실험 범위이며 일반 편집기 지원은 아닙니다.

최상위 또는 [검증된 중첩 목록 문단](hwp5-nested-text-edit.md)의 일반 Unicode 텍스트와 마지막 PARA_BREAK를 편집합니다. [기존 제어 보존](hwp5-control-text-edit.md)의 제한적 splice도 연결했습니다. 탭·알려진 anchor·같은 문단 하이퍼링크의 기존 표식 보존과 일반 필드/개체 편집은 구분합니다. 제어 생성/삭제·줄바꿈과 문단 추가/삭제는 아직 지원하지 않습니다. 삽입 UTF-8과 원본 텍스트 토큰의 UTF-16을 엄격하게 검사하고 서로게이트 쌍 사이의 편집·서식·범위 경계는 거부합니다. 제어 부가 데이터는 Unicode로 해석하지 않습니다. 문자 정규화나 BOM 제거는 하지 않습니다. 원본에 없는 문단 모양·리소스를 생성하지 않습니다.

## 책임과 SSOT

2026-10-01 [기존 글자 모양 적용](hwp5-character-format-edit.md) 연결 후 텍스트 바이트·scalar 경계 검증은 `plain_text_content.zig`, 서식 경계 검증·교체는 `character_runs.zig`를 단일 출처로 공유합니다. `plain_text.zig`는 splice와 범위 이동·원자적 반영만 담당합니다. 이후 검증 기록은 해당 글자 모양 문서에서 관리합니다.

후속 계산식 표시 준비는 같은 서식 이동을 공유하며 범위 이동도 `text_ranges.zig`로 분리했습니다. 일반 splice와 파생 수식 표시가 같은 명시적 half-open 매핑을 호출합니다. 계산식의 거래/표시 검증은 [별도 계약](hwp5-formula-command.md)이 소유하며 공개 계산식 편집 지원으로 해석하지 않습니다.

- `plain_text_source.zig`: 기존 framing·Tree·직접 자식 수집·Metadata를 재사용해 문단의 편집 가능성과 원본 개수·리소스를 검증합니다. 구역 보존 정책과 중첩 목록 소유 관계는 [중첩 편집 계약](hwp5-nested-text-edit.md)의 전용 모듈에 위임합니다. 대상 문단의 미해석 헤더 꼬리, 변경추적 병합, 알려지지 않은 직접 자식도 거부합니다.
- `plain_text.zig`: 텍스트·글자 모양·범위의 갱신값을 전부 준비한 뒤 소유 모델에 한 번에 반영합니다. 실패 시 기존 값이 유지됩니다. 원본 위치는 기존 문단 source binding으로만 식별합니다.
- `src/model/document.zig`: 토큰·글자 모양과 선택적으로 materialize한 `range_tags`를 소유합니다. null은 읽기 전용 projection에서 미투영 상태이고, 빈 소유 slice는 명시적으로 투영한 빈 범위 목록입니다. 같은 필드의 mutable 원본 캐시를 두지 않습니다.
- `text_section_writer.zig`: materialize한 문단을 모델에서 직렬화하고 나머지 원본 레코드는 그대로 유지합니다. `record_writer.zig`는 가변 길이 레코드의 framing, `paragraph_header.zig`는 글자 수·세 개 정보 수의 필드 위치를 소유합니다. 고정 길이 헤더 필드 수정은 원래 framing까지 보존합니다.
- 기존 Session은 파일·DocInfo·Section 소유권과 자원 수, raw DEFLATE·새 CFB 생성을 담당합니다. I/O는 테스트용 probe에만 있습니다. 입력 fixture를 덮어쓰지 않습니다.

읽기 전용 projection은 `range_tags=null`을 유지합니다. 텍스트 편집이 materialize한 문단에서는 더 이상 원본 줄 캐시를 유효한 모델로 취급하지 않습니다. 편집 후 텍스트만 원래대로 돌려도 서식·범위·캐시 상태까지 같다는 보장이 없어 전체 원본 파일 반환을 약속하지 않습니다. 반면 첫 무변경 명령과 기존 스타일 전용 변경→되돌리기는 전체 원본 파일을 반환합니다. 반복 저장은 결정적입니다.

## 서식·범위·조판 정책

글자 모양은 삽입 위치의 원래 서식을 상속합니다. 삭제되지 않은 코드 단위는 자신의 서식을 유지하고, 삭제된 span의 시작점으로 경계를 모읍니다. 중복 시작 위치는 어느 서식을 적용할지 모호하므로 변경을 거부합니다. 글자 수와 글자 모양 수를 함께 갱신하고 글자 수 상위 비트, 문단 모양·스타일·Instance ID·분할 flags는 보존합니다.

범위 tag의 끝점 포함 및 경계 삽입 affinity는 명세만으로 확정하지 못했습니다. 기본 `range_policy=.reject`는 원본에 범위가 있는 문단을 거부합니다. 명시적으로 `.half_open`을 지정한 실험만 반열린 범위·오른쪽 affinity를 적용합니다. 삭제 안의 경계는 시작점으로 모으고, 뒤의 경계는 길이 차이만큼 이동합니다. 빈 범위는 제거하며 나머지 tag 종류·데이터와 중첩 순서는 보존합니다. 이는 한컴 동작과의 일치 증명이 아니라 호출자가 선택한 정책입니다.

변경 문단의 PARA_LINE_SEG를 제거하고 헤더 줄 정보 수를 0으로 설정합니다. 다른 문단의 줄 캐시, PrvText·PrvImage, DocInfo caret 등 파생 데이터는 갱신하지 않으며 전체 문서 조판도 재계산하지 않습니다. 기본 `save`는 변경이 있으면 `LayoutReflowRequired`로 거부합니다. 테스트만 `allow_stale_layout=true`로 출력하고 `layout_requires_reflow=true`를 유지합니다. 임의 미지원 스트림의 payload 보존은 그 스트림의 내부 참조나 미리보기 의미가 편집 후에도 유효하다는 뜻이 아닙니다. 한컴에서의 재조판·저장, HWPX 편집 및 교차 포맷 저장은 미검증입니다.

## 픽스쳐 및 적대적 검증

아래는 중첩 연결 전의 초기 검증 기록입니다. 당시의 중첩 거부 표본을 현재 지원 경계로 읽지 않습니다. 이후 중첩 소유·실파일·E2E 검증은 [중첩 편집 계약](hwp5-nested-text-edit.md)이 소유합니다.

실행 명령은 [개발·검증 명령](development-commands.md)이 소유합니다. `text.test.zig`는 반복 편집·되돌리기·조판 거부, 잘못된 명령의 원자성과 무변경 byte-exact 저장, 모든 open/apply/save 할당 실패와 편집 실패 후 값 유지·정리를 검사합니다.

원시 기대값은 현재 `text-record-oracle.mjs`가 CFB.js·Node zlib로 읽습니다. 글자 모양은 제품의 경계 이동 알고리즘 대신 코드 단위별 서식 배열을 구성한 독립 기대값과 비교합니다. Section 전체와 비선택 스트림 payload를 전수 비교하고 `text-oracle.mjs`는 Rust `toJson`에서 최상위 선택 문단 밖의 JSON이 동일한지 확인합니다. 확장 record 크기의 증가·감소, 비압축 입력, 범위 중첩/빈 범위, 상위 비트·확장 짧은 헤더, 미지원 별도 스트림의 바이트 보존은 실제 픽스쳐에서 파생한 합성 사례로 구분합니다.

실제 `charshape.hwp`, `parashape.hwp`, `linespacing.hwp`, `facename.hwp`, `underline-styles.hwp` 5개에서 각 3문단을 골라 시작·중간·끝 삽입, 삭제, 내용 전체 삭제 75건을 대조합니다. 혼합 서식 6단위 문단은 모든 시작/끝 조합에 빈 텍스트 또는 한글·보조 평면 문자를 넣는 56건으로 위치 편향을 검사합니다. 각 선택 문단의 첫 무변경 저장은 전체 파일 바이트 동일성을 검사합니다. 표의 중첩 문단은 별도 실제 거부 표본입니다.

미해석 root/child, 헤더 꼬리, 낡은 글자·줄 개수, 누락 텍스트, 잘못된 Unicode·글자 모양, 중복 서식 경계, 제어 문자, 문단 끝 삭제, 중첩 문단, 잘못된 구역·문단, 범위 정책 미선택, 조판 opt-in 누락의 거부를 검사합니다. 오라클 자체에는 변경 무시·다른 문단 변경·서식 손상의 실제 출력 반례를 넣습니다. 전체 문서의 무손실 편집이나 임의 corpus의 호환성을 이 표본 결과로 일반화하지 않습니다.

2026-09-30 최초 실측: Debug·ReleaseSafe·ReleaseFast에서 실파일 audit과 집중 검사를 실행했습니다. 당시 표본은 실제 편집 75건, 위치 경계 56건, 실제 파일에서 파생한 합성 편집 11건(비압축·확장 크기 증가/감소·범위 4건·상위 비트/짧은 확장 헤더·별도 미지원 스트림·Unicode·두 구역), 거부 20건, 오라클 반례 3건입니다. 거부에는 다른 구역의 미해석 root와 알려진 CTRL_HEADER 안의 불투명 필드를 포함합니다. 집중 세션 검사는 혼합 명령·두 문단 편집·독립 세션·반복 저장·출력 한도를 포함해 4개입니다. 오라클은 출력 전체 Section과 다른 스트림을 검사했으며 한컴 GUI 대조는 하지 않았습니다.

제품 소스의 임시 복사본 네 개에 글자 수 +1, 서식 경계 미이동, Section 미해석 tag 거부 제거, 원본 LineSeg 유지의 결함을 각각 주입했습니다. 각각 ReleaseSafe probe 컴파일에 성공한 뒤 실제 픽스쳐 audit에서 assertion 실패로 검출됐습니다. 실제 제품 소스에는 결함을 적용하지 않았으며 컴파일 실패를 검출 성공으로 세지 않았습니다. 이전 스타일 audit도 4개 실제 파일·12곳의 편집과 확장 짧은 헤더 회귀를 포함해 통과했습니다. 기존 미리보기·문서 도구의 Node 회귀 17/17과 format 검사가 통과했습니다.

최종 `zig build test --summary all`은 7/7 단계, 2,685/2,685 테스트 통과(기존 코어 2,681개 + 텍스트 세션 4개, 종료 코드 0, 코어 실행 21분)했습니다. ReleaseSafe WASM 빌드도 통과했습니다. 스타일 세션 4개는 별도 audit 결과이며 이 전체 수에 중복 합산하지 않습니다.

### 별도 루트 뒤 문단 소유권 회귀

2026-09-30 추가 적대적 검증에서 실제 `charshape.hwp`의 마지막 문단 뒤에 별도 PAGE_DEF 루트와 PARA_TEXT 자식을 붙인 비정상 구조를 사용했습니다. 수정 전 저장기는 루트 tag가 문단 헤더가 아니면 이전 문단 소유권을 유지해 `WITNESS`를 편집 문단의 텍스트로 덮어썼습니다. 이는 일반 문서에서 발생했다는 근거가 아니라, 보존해야 할 비대상 입력을 잘못 변경한 재현입니다.

저장기는 현재 문단과 같은 깊이 또는 더 얕은 레코드를 만나면 tag와 무관하게 해당 문단 소유권을 종료합니다. 명세 4.1의 Level 계층 경계에 따르며, 다른 루트의 자식을 문단 직접 자식으로 취급하지 않습니다. 알려진 tag의 비정상 의미 배치를 정상 문서라고 인증하는 변경은 아닙니다.

실파일 audit에 별도 루트 아래 텍스트·글자 모양·줄 정보·범위·PAGE_DEF 다섯 tag와 앞쪽/마지막 문단 편집 조합 10건을 추가했습니다. 각 비대상 레코드의 비표준 짧은 확장 framing을 포함한 raw 바이트, 전체 Section 독립 기대값과 비선택 스트림을 대조합니다. 수정 전 ReleaseSafe 실행 파일은 새 회귀에서 실제 assertion 실패로 검출됐고, 수정 후 Debug·ReleaseSafe·ReleaseFast의 실제 편집 75건·경계 56건·합성 21건·거부 20건·오라클 반례 3건과 집중 검사 4개가 통과했습니다. ReleaseSafe 스타일 회귀 4개·실파일 편집 12건, 미리보기·문서 도구 Node 회귀 17개, ReleaseSafe WASM 빌드도 통과했습니다.

수정 후 전체 `zig build test -Doptimize=ReleaseSafe --summary all`도 7/7 단계·2,685/2,685 테스트·종료 코드 0으로 통과했습니다. 코어 실행은 약 2분·최대 32 GiB였으며, 성공 요약과 함께 출력된 러너의 `failed command:` 문구를 테스트 실패로 집계하지 않았습니다.
