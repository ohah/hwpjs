# 현재 필드 범위 조회

## 계약과 책임

`field_span_snapshot.read`는 `field_bindings.collectReadable`가 검증한 현재 모델의 필드 범위를 소유 배열로 반환합니다. 기존 거래용 `collect`의 허가와 분리하며 레코드/제어문자 문법을 재구현하지 않습니다. 각 행의 `source_node`, 마커의 `field_id`, 문단 내 `ordinal`, `begin/end` 문단·UTF-16 unit 좌표를 노출하며 범위 조회 자체는 편집 권한이나 번호/쪽 결과의 재계산을 허가하지 않습니다. source_node가 가리키는 헤더 ID는 기존 관측 별칭에서 마커 ID와 다를 수 있습니다. 저장 전 모델의 source_node와 재직렬화 후 source_node가 같다고 가정하지 않습니다.

Session은 구역 경계를 검사하고, WASM `hwp5_edit_field_spans(section)`은 기존 output 버퍼/오류 계약으로 JSON을 반환합니다. JS `editor.fieldSpans(section)`은 기존 closed/정수 검증 후 선택적 ABI를 요구합니다. ABI 부재는 `Hwp5FieldSpansAbiUnavailable`이며 빈 배열로 바꾸지 않습니다. 조회는 원본·편집값·undo/redo를 변경하지 않습니다. decoder의 형식·좌표·중복 source_node 검사는 `js/hwp5-field-spans.mjs`가 소유합니다.

## 분리 후보 검증

최초 후보 SHA256 `64c2484149b62e18f37fb2d3d65165f723c161f5a75cd73b211704cf92424701`는 ReleaseSafe5/5 빌드이며 `/tmp/hwpjs-field-spans-publication.nxMP4B/.zig-cache/o/be8e5257c2499a24dfad482b29eb95dc/hwpjs.wasm`에 보존했습니다. native 테스트/root/정규 등록 후 재빌드한 게시 후보는 SHA256 `4991a2f23a4fb21de87fc395e8cc4bc07e93db9a8cc43dc26dc7c4b29018b162`, 같은 폴더의 `.zig-cache/o/87aeeb6d291c1f3ff1821f895165083e/hwpjs.wasm`이며 `field-spans-publication-build.log`의 ReleaseSafe5/5입니다. 두 후보 모두 이전 개체 번호 후보360abdbb의331개 export를 이름/종류 변경 없이 유지하고 조회 함수1개가 추가돼332개입니다. 이 비교는 전체 signature/동작 동치 검사가 아닙니다.

`field-spans-focused.log`의 wire/editor/독립 oracle/선택적 ABI8/8·fail/cancel/skip0·exit0은 실제 책갈피·혼합 하이퍼링크·서로 다른 소유 필드·7구역 개체 번호 문서의 현재 범위를 검사합니다.7구역 원본에는 전체 필드21개, 그중 상호참조18개가 있습니다. 첫 검사에서 두 집계를 혼동해18개로 예상한 오류를 수정했으며 독립 전체 범위 대조는 유지했습니다. 한글/이모지 앞 삽입·내부 삽입·undo/redo·저장/재열기·원본 불변과 구형 ABI 부재의 기존 편집/redo 보존도 검사합니다.

`field-spans-native-safe.log`와 `field-spans-native-debug.log`는 각각 root와 실제 snapshot 테스트2/2·exit0입니다. 실제 책갈피 조회의 전체 부분 할당 실패·잘못된 구역·무변경 저장을 검사합니다. 최초 root1/1은 새 snapshot 테스트가 발견되지 않은 실행이므로 기능 통과로 세지 않고, root 등록 후 위2/2를 다시 확인했습니다.

게시4991a2f2 후보의 `field-spans-publication-focused.log`도 같은8/8·fail/cancel/skip0·exit0입니다. 작업 트리 구간 진단 재실행은 `worktree-hwp5-window-publication-diagnostic.log`의4/4·fail/cancel/skip0·exit0입니다. 게시 후보의 `field-spans-publication-reader-parity.jsonl`도 참조975개 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26·exit0으로 종료했습니다. 최초 후보의 결과를 소급 사용하지 않습니다.

동일한 작업 트리의 미게시 구간 UI에 이전360abdbb를 주입하면2/4 실패(`Hwp5FieldSpansAbiUnavailable`)이고 이 조회 후보를 주입하면4/4·fail/cancel/skip0입니다. 전자의 로그는 `/tmp/hwpjs-object-number-retention.xiewpX/worktree-hwp5-window-diagnostic.log`, 후자는 이 후보 폴더의 동명 로그입니다. 구간 Worker·Canvas 결과는 작업 트리 진단이며 미게시 UI 변경 전체를 채택하거나 main/실제 Chromium 완료로 승인하는 근거가 아닙니다.

`field-spans-reader-parity.jsonl`의975개 참조는 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26·exit0입니다. 같은 거부는 지원 성공이 아닙니다. 신규4개 JS 파일을 정규 편집 묶음에 등록하고 native snapshot 테스트도 root에 등록했습니다. 전체 native gate·새 후보 정규 회귀·실제 브라우저·미게시 구간 UI 통합·기본 WASM/외부 데모 교체는 별도입니다. 이전 후보에서 완료한 검사를 새 후보의 전체 완료로 합산하지 않습니다.

## 알려진 필드의 구조 조회와 편집 권한

최초 조회 후보는 거래용 필드 종류 제한을 재사용해 실제53,448문단 원본의 `%sig` 마커를 거부했습니다. 이 원본은 문단8980/unit133에 `%sig` 시작 마커, 대응 헤더에는 `%unk`와 `$RevisionSign;1;`, 종료는 같은 문단/unit141의 canonical ID를 가집니다. 구조상 결과 범위는141→141의 빈 범위입니다. 기존 `body/control_identity.resolve`가 이미 이 관계를 정의하므로 읽기 경로가 이를 재사용합니다. 임의 `%unk` wildcard나 명령 접두사 추정을 추가하지 않았습니다.

읽기 경로만 `field_start.supports`의 알려진 field control ID 전체를 받으며, 기존 거래용 수집과 source policy는 바꾸지 않습니다. 읽기용 header/marker 관계도 공통 identity 판정·기존 필드 끝 identity·논리 목록 소유권 검사를 유지합니다. 독립 oracle은 문단별 전체 레코드 재순회 대신 직접 자식 index를 한 번 만들며 동일한 헤더/종료 단언을 유지합니다. 추가 `%unk`/`%sig`는 해당 실제 검사에서만 명시합니다.

`readable-alias/bin/hwpjs.wasm` SHA256 `9b7969358f501a5eea1a267d1858a5c57bfb725dfa2e6d57ea23d369a074302c`의 실제17필드 구조/원문/기존 편집 거부 검사를 포함한 집중9/9이 통과했습니다. 별도 `field-spans-readable-alias-mutation.log`의2/2는 같은 길이 `$RevisionSign;2;` 변조가 독립 oracle과 native 조회에서 거부되고 원문/이력이 유지됨을 검사합니다. 전체 알려진 필드 종류·거래 제한·부분 할당 실패와 기존 alias 반례의 native 집중 검사는 ReleaseSafe/Debug 각각4/4입니다. 새로운 테스트/등록을 반영한 `readable-final` 빌드와 그 후보의 전체 정규 검사·읽기 전수 검증은 별도입니다.

이 대형 문서의5만 번째 문단 편집 양성 검사는 아직 완료하지 못했습니다. 구조 조회에 성공하더라도 원본 `%unk`의 의미/편집 보존 허가는 여전히 별도 source policy 거부입니다. 읽기 조회 성공을 해당 문서 편집 완료로 바꾸지 않습니다.

최종 등록 후보 `readable-final/bin/hwpjs.wasm` SHA256 `b17b942cce1a3f3860141b1dfb999311f2a4bce8dbac0eb313be772c9a58ae41`는 ReleaseSafe5/5이며 기존331개 export 누락/종류 변경 없이 조회1개만 추가합니다. `field-spans-readable-final-reader-parity.jsonl`은975개 중 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26·exit0입니다. 정규5개 JS 파일을 포함한 `field-spans-readable-final-editor-audit.log`는406/406·fail/cancel/skip0·exit0, 빌드7/7단계로 종료했습니다(647,280.17ms). 이전396개 결과와 별개로 같은 readable 후보에서 확인했으며 전체 native/브라우저/기본 산출물 배포 완료를 뜻하지 않습니다.

## 재현 명령

후보 소스에서 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwp5/field-spans-wire.test.mjs tests/hwp5/field-spans-editor.test.mjs tests/hwp5/field-spans-oracle.test.mjs tests/hwp5/field-spans-abi.test.mjs`로 실행합니다. native 집중 검사는 `zig test src/root.zig -O ReleaseSafe --test-filter 'field span snapshot'`이며 Debug도 같은 필터입니다. 조회 누락을 허용하는 fallback이나 테스트 skip으로 구간 의존성을 통과시키지 않습니다.
