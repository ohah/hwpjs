# 수식 없는 구역의 빈 계산 목록

## 원인과 책임

참조 HWPX 전체 조회에서 남았던 InvalidFieldLinks3건은 모두 수식이 없는 구역의 `formulaCurrent`였습니다. 원본 XML의 FORMULA 개수는0이며 `80168_regulatory_analysis.hwpx`는 전체 시작297/끝296, `86712_regulatory_analysis.hwpx`는 전체 시작179/끝175, `stacked_tac_band_om_top.hwpx`는 CLICK_HERE 시작1/끝0입니다. 짝이 없는 시작은 모두 CLICK_HERE입니다. 누락 종료를 임의로 생성하거나 원본을 수정하지 않습니다.

공통 수식 준비기 `formula_section_prepare`가 대상 구역에 계산식이 없는데도 전체 필드 범위를 엄격 검증한 것이 빈 수식 조회 실패의 원인입니다. 기존 hasFormula 판정을 재사용해 FORMULA 부재 시 빈 prepared 배열을 반환합니다. 남아 있는 정의가 있으면 잘못된 선택으로 거부합니다. 작업 트리의 결과 override 선택 검사는 별도 미게시 경로이며 이 게시 후보에는 포함하지 않습니다. 실제 FORMULA가 하나라도 있으면 기존 범위/참조 검증을 유지합니다. 누름틀 자체 편집 권한을 완화하거나 전체 필드 문법이 유효하다고 인증하는 변경은 아닙니다.

## 실측

동일 실행 코드 후보의 추적46파일 전체 문단 입력·이력과 거부 분류는 [추적 prefix 검증](hwpx-tracked-prefix-verification.md)이 소유합니다. 빈 수식 조회 성공을 전체 문서 편집 완료로 확대하지 않습니다.

### SSOT 후속

최종6d7a 후보 자체에서도 empty-formula-reference/copay-below/grouped-integer3파일5/5·fail/skip0·exit0(4426.274ms)을 재확인했습니다. 전체 source 일치/표준 WASM section 동치 대조와 함께 확인한 마지막 집중 gate이며 다른 후보의 전체 native 성공을 소급한 결과가 아닙니다.

최종 게시 소스의 ReleaseSafe 제품 빌드5/5·exit0 후보는 `6d7aeba169332eb6d7b3a38926dcd8a8252f1b79a81339a459e810d30b6411dc`입니다.5caf33와 모든 표준 WASM section이 동일하고 custom `.debug_line`만 다른 것을 독립 section 해시 대조로 확인했습니다. 게시 인덱스의 src/build2,499파일도 격리 컴파일 소스와 blob hash가 모두 일치했습니다. 전체 native 재컴파일은exit0·바이너리 `ffb10045d58d3d5c39b1024fd638869acdcee5b4021ce801b567cce5367939fc`이며 동일3,923선언 순차 감사를 `empty-formula-staged-fixed-native-audit.jsonl`에 실행 중입니다. 기능별/공개/참조 gate의 완료와 전체 native의 미완료를 구분한 복구 게시이며 기본 데모 WASM·다른 프로토타입·전체 편집/UI 완료는 포함하지 않습니다.

도형 실패 주입 수리 뒤 전체 실행은858/3923완료 후 index858 `created table staged allocation failures retain empty current state and source`에서 관측 physical footprint1,087,767,680바이트로1024MiB 한도를 넘겨exit1·incomplete로 끝났습니다. 앞선858개는 fail/log/leak0이지만 전체 native gate는 여전히 미완료입니다. 이전655/840개와 합산하지 않으며, 표 생성 테스트의 자원 원인 분리·수리와 새 전체 검증이 남습니다.

도형 배치 실패 주입 수리 후 전체 native 재컴파일도exit0입니다. 새 바이너리 SHA256 `4ddda72fb323586fc0478a5dc9fbc894adb9571507a8f052db164ed3057e1265`의 동일3,923선언을 index0부터 batch-size1/관측1024MiB 한도로 다시 실행 중이며 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-drawing-fixed-native-audit.jsonl`입니다. 이전840완료 결과와 합산하지 않습니다.

core test step가 별도로 연결하는 `tests/hwp5/style-preservation/text.test.zig`의 동일 text splice 필터도 격리 source/ReleaseSafe에서9/9·exit0으로 확인했습니다. 보존 anchor·빈 셀·중첩 표 소유권·서식 혼합·실제 파일 반복 입력/배치 거부·무효 명령/무변경·전체 할당 실패와 문단 격리를 포함합니다. 이9개를 root inventory3,923에 포함된 것으로 중복 계산하거나 아직 미완료인 전체 `zig build test` gate를 통과로 바꾸지 않습니다.

선 수리 뒤 재실행도840/3923완료 후 도형 텍스트 배치의 실패 주입에서 관측 footprint1,137,657,008바이트로1024MiB 기준을 넘겨exit1·incomplete로 끝났습니다. 해당 자원 대조와 main 독립 검증은 [도형 배치 자원 기록](native-drawing-snapshot-resource.md)이 소유합니다. 새 수리 뒤 전체 재검증은 아직 남으며 이 문서의 이전 실행 중 표기를 종료 상태로 갱신합니다.

선 테스트 수리 후 전체 native 재컴파일은exit0이며 새 바이너리 SHA256은 `5a369ed38dde0d2db751cb0a14b71a05f486a67685343909c23119a4f165d0c7`입니다. 표준 runner 전체3,923선언을 다시 index0부터 batch-size1/관측1024MiB 한도로 검사하는 실행은 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-line-fixed-native-audit.jsonl`에 진행 중입니다. 이전655완료와 새 실행 결과를 합산해 전체 통과로 계산하지 않습니다.

수식 기능 후보에 이미 게시한 선 테스트 allocator 수리를 더한 제품 빌드5/5·exit0의 WASM은 `5caf33a6e133da14621537288036076a36525c732a5716ef4b1a6d0cf5a1c944`입니다.51194a 후보와20개 WASM section을 대조해 모든 비custom section이 완전히 같고, 차이는 custom `.debug_line`1개뿐임을 확인했습니다. 이 비교는 테스트 소스 위치 변경이 제품 실행 section을 바꾸지 않았다는 근거이며 새 편집 기능/브라우저 성공을 주장하지 않습니다. 선 수리 후 전체 native 바이너리 재컴파일은 별도 실행 중입니다.

후속 전체 native 실행은655/3923완료 뒤 index655 실제 장식 선 스냅샷의 관측 footprint1,109,902,488바이트로1024MiB 한도를 넘어exit1·incomplete로 끝났습니다. 앞선655개 fail/log/leak0을 전수 통과로 읽지 않습니다. 해당 테스트 소유 범위의 수리·main 독립 검증/게시 기록은 [장식 선 자원 검증](native-line-snapshot-resource.md)이 소유합니다. 따라서 이 문서의 이전 실행 중 기록은 종료 상태로 갱신하며 새 전체 컴파일/전수 실행이 남습니다.

같은51194a 후보의 등록 HWP5 editor18파일도312/312·fail/skip0·exit0(3907.664ms)으로 완료했습니다. build.zig의 editor_api_tests 초기 목록+addArg를 추출해 중복/개수18을 검증했고, 환경변수/격리 기본 WASM·Git metadata/work tree를 명시했습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-ssot-hwp5-public-suite.log`입니다. 공통 수식 범위 변경의 HWP5 공개 회귀 증거이며 전체 HWP5 참조 편집·실제 브라우저·조판 완료로 확대하지 않습니다.

격리 source의 전체 ReleaseSafe native 바이너리 컴파일도exit0으로 완료했고 SHA256은 `577efca9ed230f687f6669c0cdc977a89e3cb82d6449d506578b4aecfb8b231b`입니다. 표준 Zig runner inventory3,923선언을 batch-size1·관측 physical footprint1024MiB 한도로 검사하는 실행은 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-ssot-native-audit.jsonl`에 진행 중입니다. 이 한도는 OS 하드 상한이 아니며 한도 초과/중단은 미완료입니다. 집중 native와 전수 native, 분할 실행과 단일 장기 프로세스 gate를 구분합니다.

후속 전체 참조 감사도exit0·stderr0바이트로 완료했습니다.975경로 중HWPX436개 모두 자식 완료, 미완료/원본 저장 불일치/저장 오류/조회 오류0, 성공 조회1002회입니다. 암호화1파일의 EncryptedDocument 거부는 남으며 지원 성공으로 계산하지 않습니다. HWP5513개/HWP326개는 이 감사에서 제외합니다. 양쪽 모두51194a 후보를 둔 조회/원문 저장 검사이며 변경 전과 조회 동치·전체 편집/Canvas 증거는 아닙니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-ssot-reference-query.jsonl`입니다. 앞선 c5c358 집중3문서 결과와 중복 합산하지 않습니다.

51194a 후보의 전체 등록 공개23파일도54/54·fail/skip0·exit0(109090.953917ms)으로 완료했습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-ssot-public-suite.log`입니다. 기본 고정 경로는 격리 tree에서만 같은 후보로 맞췄고 실제 작업 트리 기본 WASM은 유지했습니다. 별도 참조3파일 회귀는54개에 합산하지 않습니다. 전체 참조 감사와 전체 native 바이너리 컴파일은 이 시점 실행 중이며 완료로 계수하지 않습니다.

존재 판정은 `formula_source_query.hasFormula`가 기존 isFormula를 재사용해 소유합니다. 저장기의 기존 공개 이름은 이 함수를 alias하고 준비기는 조회 모듈을 직접 호출하므로 준비기가 저장기를 역참조하지 않습니다. 이 분리 뒤 격리 ReleaseSafe 제품5/5·exit0 후보는 `51194a2994fc3b559d92a76868f60e84453b4516d24e0d122e225112bcdeffcb`입니다.

native 집중은 ReleaseSafe/ReleaseFast 각각 root 포함2/2·exit0이며 모드별 중복 합산하지 않습니다. 실제3문서의 독립 XML FORMULA0/미종료 개수1·4·1 확인, 반복 조회/문단 불변, history undo/redo 없음, 무편집 저장/재열기 원문 bytes와 원본 파일 불변은 `tests/hwpx/empty-formula-reference.test.mjs`가 검사합니다. 해당 파일+copay+grouped 정수3파일5/5·fail/skip0·exit0(4476.611542ms)입니다. 실제 참조가 없으면 실패하며 기본 등록 묶음과는 별도입니다. 이 후속 후보의 전체 참조 감사는 `empty-formula-ssot-reference-query.jsonl`에 실행 중이며 아직 최종 통과로 계수하지 않습니다.

격리 main+숫자 표시+BELOW+flat 원문 보존+빈 수식 처리 후보 SHA256 `c5c3586a08303e2955c4ffb2e624bb0e75005246a9030054eb297b08dbdbec52`는 ReleaseSafe 제품5/5·exit0입니다. 문서별512MiB RSS 관측/30초 제한의 자식에서 실제3파일을 모두 두 차례 열고 문단/수식 조회·저장을 완료했습니다. 수식 응답은 모두 빈 배열 hash `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`이며 무편집 저장은 각 원본 hash/bytes와 같습니다. 자식은 정상 종료했고 표본 peak는150,274,048/140,558,336/0바이트입니다.0은 표본 전 종료이지 메모리 미사용 증거가 아닙니다.

`formula_empty_query_tests.zig`의 native 집중은 root 포함2/2·exit0입니다. 닫히지 않은 CLICK_HERE/HYPERLINK는 빈 수식 결과, 닫히지 않은 FORMULA는 InvalidFieldLinks를 요구하며 모든 할당 실패 지점을 순회하고 원본 불변과 잘못된 정의 선택 거부를 확인합니다. 최초 검사에서는 expectError가 OutOfMemory를 다른 테스트 오류로 바꿔 실패했습니다. 실패 주입 callback이 예상 연결 오류만 소비하고 OutOfMemory를 전파하도록 고친 뒤 재실행했습니다. 최초 실패를 제품 오류 또는 통과로 계산하지 않습니다.

이 후보의 전체 등록 공개 회귀/전체 참조 재실행·전체 native·필드 내부 편집·Canvas는 아직 별도입니다. 이전93bc53 후보의 전체436파일 보존/54공개 성공을 새 후보에 소급하지 않습니다. 기본 제품 WASM은 유지합니다.
