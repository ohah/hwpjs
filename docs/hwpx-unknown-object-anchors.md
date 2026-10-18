# unknownObj 원문 보존 앵커

후속 [실제 브라우저 검증](hwpx-unknown-object-browser.md)은 개체 Delete 거부·빈 undo·입력·메뉴 이력·다운로드·재업로드와 세션 종료 증거를 소유합니다.

같은 후보의975개 참조 문서 전체 reader JSON 회귀는 [후보 reader 대조](unknown-reader-parity-current.md)를 따릅니다. 같은 거부5개는 지원 성공으로 세지 않습니다.

## 계약과 출처

`run_anchor.zig`가 정확한2011 paragraph namespace·문단 직접 run 아래의 `unknownObj`만 `unknown_object=21`로 분류합니다. 기존 `dutmal=20`을 포함한 종류 번호는 유지합니다. 별도 whitelist/편집 캐시는 만들지 않고 기존 보호 앵커의 위치·원문 저장·삭제 거부 경로를 재사용합니다. 표시1단위와 기존 확장 컨트롤 원본8단위의 축도 공통 계층이 소유합니다. 외부 namespace, ctrl/t 내부 또는 문단 직접 배치는 이 분류를 얻지 못합니다.

[한컴 공개 RunType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/RunType.cpp)은 이 이름을 등록하고, [UnknownObjectType](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/UnknownObjectType.cpp)은 drawing 기반 속성과 nativectrlid를 읽고 씁니다. 고정 리비전의 Apache-2.0 소스를 확인했으며 코드를 복사하거나 의존성을 추가하지 않았습니다. 이름이 unknown이라고 무조건 손상 문서로 보거나 내부를 일반 텍스트로 해석하지 않습니다.

지원하는 것은 개체 바깥 텍스트 편집과 개체 subtree 보존입니다. 개체 자체의 native control 의미·속성 편집·그리기·원래 한글 조판을 구현했다는 뜻이 아닙니다. 개체 삭제/덮어쓰기는 계속 ProtectedInlineControl로 거부합니다. 전체 문단의 일반 canEdit도 false로 유지합니다.

## 실제 원본과 전후 재현

`reference/rhwp/samples/issue6035/cgmp_evaluation_table.hwpx`의 section0·native 문단932(Worker931)은 한 run에 tbl2개·unknownObj4개·빈 t를 갖습니다. 네 ID는1473398994/1473398996/1473398998/1473399000이고 nativectrlid는 모두610496364입니다. 독립 Python이 이 구조와 원본 SHA256 `0f03119d6ac3e19f74fc9fcec5315ac6ed436bab5abffd0804e9cf3350dd747a`를 고정합니다.

`/tmp/hwpjs-unknown-anchor-probe.1MV5w4`는58010454 기반 제품 소스에서 앵커 enum/분류 두 줄을 변경한 분리 실험입니다. 기존2589a92e 후보에서 같은 API 검사는 anchorText의 UnsupportedParagraphControl로 실패했습니다(`unknown-object-api-baseline.log`). 새 ReleaseSafe WASM `eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f`에서는 여섯 보호 앵커가 보존되고 바깥 Unicode prefix 입력·저장·undo/redo·재열기·재저장이 통과했습니다. 해당 저장 SHA256은 `8a305dfaa748d117892f1e60e77e37c614002d29c538f2050c91a76abe2ffdcd`입니다.

독립 `hwpx-unknown-anchor-oracle.py`는 기존 전체 XML/비대상 ZIP payload oracle을 재사용합니다. normal/-O 각각 정상 결과와 재직렬화 양성2개를 허용하고 native control 변경·개체 삭제·순서 교환·opaque 자식 변경·표 변경·다른 payload 변경6개를 정확한 XML/비대상 payload 오류로 거부합니다. 잘못된 prefix 기대값도 별도 거부합니다. self-test가 원본 ZipInfo를 재사용해 offset을 바꾸던 최초 검증 도구의 CRC 오류는 copy.copy로 고쳤으며 제품 ZIP 결함으로 분류하지 않습니다.

새 native 두 테스트(root 포함3/3)는 ReleaseSafe/Debug 모두 통과했습니다(`unknown-native-safe-fixed-query.log`, `unknown-native-debug.log`). 정확한 소속·기존 enum 번호·원본/표시 축·이모지·삭제 거부·원문 payload·실패 원자성 및 모든 할당 실패를 검사했습니다. 처음 실패 주입용 할당자로 거부 판정까지 고정 오류를 기대한 테스트 절차는 수정 전 실패로 남깁니다.

API·실제 Worker/WASM+Canvas 대역 두 파일은2/2·fail/skip/cancel0·exit0입니다(`unknown-worker-canvas-correct-route.log`,26554.496375ms). Worker의 여섯 앵커 삭제 요청 거부·원본 저장 유지, Canvas 입력→기존 splice 위임→독립 비교→undo/redo→실제 재열기를 확인했습니다. 필드용 query-edit-range를 앵커 권한으로 잘못 해석한 최초1/2 실행은 수정된2/2와 합산하지 않습니다. 앵커 권한은 기존 row.anchorEditable/네이티브 거래 경로가 소유하며 필드 조회 API를 확대하지 않았습니다. Canvas·글꼴 측정은 대역이며 실제 Chromium과 unknownObj 픽셀 렌더링의 증거가 아닙니다.

원래432 HWPX 조사 중 거부67좌표를 동일 원본 해시로 재조회한 `unknown-reference-recheck.jsonl/.stderr`는 prefix4/수동 계산 결과35/거부28·exit0·stderr0입니다. 이전 prefix3/결과35/거부29 중 위 한 좌표만 anchored 경로로 이동했습니다. 나머지 미닫힘 필드28곳은 여전히 별도입니다. 조회 성공을 모든 좌표 실제 편집이나 전체 fixture 지원 완료로 확대하지 않습니다.

최초 API 준비에서64MiB history 옵션은 ABI 한도를 넘어 LimitExceeded였고16MiB로 고친 뒤 실제 검사를 실행했습니다. 최초 회귀 실행의3개 실패는 기존 anchor-editor 테스트가 명시 후보 환경변수를 무시하고 없는 기본 경로를 읽은 ENOENT입니다. 작업 트리에 있던 세 경로 수정만 채택한 `unknown-anchor-regressions-explicit.log`는5파일13/13·fail/skip/cancel0·exit0(60270.892542ms)입니다. 기존 pageNum·자동 번호·주석·MEMO·제목·빈 run 보존을 포함합니다. 앞의2개와 범위가 다르므로 합산하지 않습니다. 전체 native gate와 기본 WASM/외부 데모 승격은 별도이며, 기본 산출물은 교체하지 않았습니다.

재현은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/unknown-object-anchor.test.mjs tests/hwpx/unknown-object-anchor-canvas.test.mjs`입니다. 두 파일은 HWPX gate에 등록합니다. native 집중 검사는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX unknown object anchor'`이며 Debug도 같습니다.
