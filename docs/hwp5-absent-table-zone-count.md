# HWP5 표의 zone count 전체 부재

## 계약과 책임

`body/table.zig`의 기본 `Table.parse`는 버전5.0.1.0 이상에서 zone count를 요구하는 엄격 정책을 유지합니다. `parseWithZoneCountPolicy(..., .observed_absent)`만 완전한 기본 표 필드 뒤의 정확한 EOF를 부재로 인정합니다. 이때 zones는null이며 명시 count0의 빈 배열과 다릅니다. 부분 count 한 바이트나 선언된 zone의 일부만 있는 입력은 UnexpectedEnd로 거부합니다. 이전 버전의 해석은 변경하지 않습니다.

`edit/paragraph_owner.zig`는 원본 레코드를 다시 쓰지 않는 소유권 검사에서 이 정책을 명시합니다. CFB 보정은 별도의 사용자 선택이며 자동으로 켜지지 않습니다. 누락 필드를 합성하거나 표 크기·속성·구역 원문을 정규화하지 않습니다.

## 실제 파일과 검증

참조 `253E164F57A1BC6934-empty.hwp`의 표 레코드2개는22바이트이며 count 필드 전체가 없습니다. `tests/hwp5/absent-table-zone-count.test.mjs`는 명시적 CFB 보정 후 빈 셀 네 곳의 한글/이모지 입력·독립 전체 Section/비대상 스트림·틀린 문자열 음성 대조·표 레코드 raw 보존·undo/redo·재열기를 검사합니다. 부분 count/zone 파생 입력의 거부와 원본 불변도 검사합니다. 참조 파일은 기존 `reference/rhwp` 체크아웃이 필요하며 파일 부재를 성공으로 집계하지 않습니다.

native 회귀는 `src/table_zone_count_probe.zig`가 소유하며 정규 root에 연결합니다. 이 검증 소스 d5b129b067566b1cce264aee165981883bb923c7의 ReleaseSafe 전체 native는7/7steps·4150pass·1skip·exit0입니다. `/tmp/hwpjs-native-integration.HBhqlB/integration-native-retry1.result.json`은 nativeSuccess:true와 관측 오류0을 기록하고 최종 log가 합계를 소유합니다. 앞선 SIGTERM 실행을 통과로 계산하지 않습니다. 이후 게시용 main 사본의 전체 src를 이 고정 tree와 비교해 차이0을 확인했습니다. 후속 DocInfo 보존 정책이나 현재 작업 트리 전체에 소급하지 않습니다.

기존663cc534 WASM을 명시한 공개 회귀17/17과 실제 복합 HWPX 셀/꼬리말 브라우저 왕복도 통과했지만, 이 문서는 표 누락 필드의 지원 계약만 소유합니다. 모든 문서 편집·원본 조판 동치·기본 데모 WASM 승격을 뜻하지 않습니다.

게시용 `/tmp/hwpjs-table-zone-publish.I81Var`의 새 ReleaseSafe 빌드는5/5·exit0이며 산출물 SHA-256은 `30434b54557eb6b8a4de2a00f55d7710a68738b6725e366d852d8cb082154f2a`입니다. 이 후보의 공개 빈 셀·HWP5 숫자 입력·HWPX 수식 배치 API·쪽 영역 선언 API 네 파일15/15·skip0·exit0과 집중 native 부분 필드 거부1/1을 확인했습니다. 첫 명령에서 수식 API 테스트를 HWP5 경로로 잘못 지정해 해당 파일이 실행되지 않은11개 결과는 최종 근거로 쓰지 않고, 네 파일 존재를 확인한 뒤 올바른 HWPX 경로로 재실행했습니다. 기본 데모 WASM을 덮어쓰지 않았습니다.

실제 빈 셀 입력·원시 표 레코드 보존의 집중 native도 게시용 사본에서1/1·exit0으로 재확인했습니다. 부분 필드 거부 집중1/1과 별개이며, 앞선 고정 소스 전체 native 근거를 대체하지 않습니다.

## 기본 데모 승격 전 읽기 대조

기존 기본 bacf2ef3와 새30434b54를 명시한 reader parity는 추적 fixture 디렉터리93파일에서 전체 JSON 일치91·동일 거부2·exit0입니다. `/tmp/hwpjs-table-zone-publish.I81Var/demo-reader-parity.jsonl`이 입력/산출물 hash와 파일별 근거를 소유합니다. 동일 거부는 지원 성공으로 집계하지 않고 이 디렉터리 밖 데모/참조 파일이나 편집/UI의 전수 검증으로 확대하지 않습니다.

기존 기본 WASM은 같은 검증 폴더의 `default-before-bacf2ef3.wasm`으로 보관하고 원본과 SHA-256 전체 일치를 확인했습니다. 이 기록 시점에는 기본 파일 자체도 bacf2ef3 그대로입니다. 실제 복합 HWPX 브라우저 왕복의 새30434b54 결과는 [복합 셀 검증](hwpx-complex-cell-browser-roundtrip.md)이 소유하며, 전체 Worker 편집 감사가 끝나기 전에는 교체하지 않습니다.

## 기본 데모 반영 완료

후속 Worker 전수는 앵커146·필드7·수식 결과13의 편집/이력/저장 재열기 검사를 통과했습니다. 최초 두 파일 동시 실행은7pass/1fail·exit1이며 실패는 headerfooter의 오래된 모든 쪽 반복 기대입니다. 선언 host 페이지를 기준으로 수정한 뒤 page-worker-corpus 파일 전체를7/7·skip0·exit0으로 다시 실행했습니다. 전수 Worker 편집 성공과 수정 후 페이지 파일 성공은 별도 실행 결과이며 단일8/8 실행으로 표현하지 않습니다. 로그는 같은 검증 폴더의 `demo-worker-check.log`와 `demo-page-worker-after-fix.log`입니다.

2026-10-20 위 검사 종료 후 기본 `zig-out/bin/hwpjs.wasm`을30434b54로 원자적 교체했습니다. 기존 bacf2ef3 복구 사본은 유지했습니다. 기존8080 서버를 재시작하지 않고 로컬 HTTP와 외부10000 HTTPS에서 각각200·gzip·해제 후16,587,350바이트·전체 SHA-256 일치를 확인했습니다. 현재 기본 주소는 `https://macstudio.tailed42f2.ts.net:10000/web/preview/index.html`이며 새로고침해야 페이지 수명 단위 컴파일 캐시가 새 WASM을 사용합니다. 별도10001 고정 후보 서버는 변경하지 않았습니다.

이제 앞선 기본 데모 미반영 문구는 당시 기록입니다. 새 DocInfo 보존 모드는30434b54에 포함되지 않으며 별도 전체 native 검증 중입니다. 이번 반영을 모든 픽스쳐/편집 명령/원본 조판의 완료로 해석하지 않습니다. 데모 JS는 현재 작업 트리 소스이며 모든 로컬 UI 변경을 게시했다는 의미도 아닙니다.

## 데모 픽스쳐 선택

`empty-table-cells-reference.hwp`를 명시 허용 목록에 추가했습니다. 표시 이름은 ‘HWP5 빈 표 셀 — CFB 보정 동의 필요 (참조)’이며 원본253E164F57A1BC6934-empty.hwp의 hash는 `d9910c479b1398d6556482f4027249b7fded881c2bd11c6618c24a9c90da6f80`입니다. 새 허용 목록을 읽도록 기본8080 서버만 재시작하고 로컬/외부10000의 GET200·원본378,368바이트/hash 일치·HEAD200/본문0을 확인했습니다. 임의 경로 공개나 자동 CFB 보정은 추가하지 않았습니다.

목록/응답/컨트롤/사전 계획 회귀9/9·skip0이 통과했습니다. 실제10000 URL에서 신뢰된 픽스쳐 열기 클릭은 오류 없이 HWP5.0.4.0·6문단을 반환했습니다. hwpjs-fixture-profile-33ok9q의 클릭→두 RAF313.1ms·Worker92.1ms는 서버와 같은 Mac의 브라우저 값이며 사용자 WAN 속도로 해석하지 않습니다. 화면은 활성화 전 텍스트 논리 미리보기/MissingHwp5PageSources였으며, 이 검사는 실제 빈 셀 입력이나 원본 페이지 동치를 추가로 증명하지 않습니다. 소유 브라우저 inactive를 확인했습니다.

## 명령

```sh
HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/absent-table-zone-count.test.mjs
zig test src/table_zone_count_probe.zig -O ReleaseSafe --test-filter "observed absent zone count"
zig test src/table_zone_count_probe.zig -O ReleaseSafe --test-filter "actual empty cell"
```

표 일반 계약은 [HWP5 표](hwp5-tables-contracts.md)가 소유합니다.
