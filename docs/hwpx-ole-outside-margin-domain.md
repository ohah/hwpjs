# OLE 바깥 여백 읽기 진단

## Native 계약과 기존 조회의 구분

`src/hwpx/ole_source_values.zig`의 `readOutsideMarginDomain(allocator, tree, node)`는 직접 run/p에 속한 2011 paragraph namespace OLE의 원값만 조회합니다. `ole_outside_margin_domain.zig`가 scalar 보고서를 소유하며 기존 `run_anchor.kind`, `picture_flow_values.readOutsideMargins`, XML Boolean·정수 해석을 재사용합니다. 별도 parser나 편집 권한을 만들지 않습니다.

반환 `values`와 `domains`는 left/right/top/bottom 순서의 고정 네 항목입니다. 값은 nullable i64이며 부재·0·음수·u32 상위 비트를 합치지 않습니다. `lock`과 `size_protect`도 부재/null·false·true를 구분합니다. 도메인 `official_model_unsigned32`는 공식 C++ 참고 모델의 수치 부분집합 표시이며 schema-valid 판정이 아닙니다. 기존 `signedOrUnsigned32`의 -2147483648..4294967295 범위는 유지합니다.

진단은 무관한 unknown textWrap/textFlow/zOrder를 해석하지 않습니다. 기존 full-flow 조회는 wrap→flow→zOrder→margin의 오류 순서를 그대로 유지하므로 bad wrap과 bad margin이 함께 있으면 기존 wrap 오류를 먼저 반환합니다. 새 진단에서는 margin 오류를 반환합니다. 잘못된 owner·node 범위·중복 child·namespace·Boolean·정수와 할당 실패는 거부합니다. 원 Tree/source는 바꾸지 않습니다.

## 규범·관측 경계

KS X6101:2024의 기계가독 부속서 F는 MarginAttributeGroup의 네 값을 required `xs:nonNegativeInteger`, 단위를 HWPUNIT으로 설명합니다. 그 정수형에는 u32 상한이 없습니다. 고정 한컴 모델 [marginAtt.h](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/marginAtt.h)의 UINT32 구현과 규범 상한을 혼합하지 않습니다. 확보한 공식 2024 응답은 14,766,098B/SHA256 `ffb13f8656592a340267dd7d8f200d31b6f7946e6f2b083248603a4152b15d14`이며 순수 XSD 전체 검증 증거는 아닙니다.

2024 namespace와 이 reader가 다루는 2011 namespace는 다릅니다. 구판 공식 조회는 본문을 확보하지 못했으므로 2024 규칙을 2011 원본의 새 거부 조건으로 적용하지 않습니다. schema의 protect 기본값을 raw 부재에 채우지 않습니다. lock·size.protect가 바깥 여백 편집을 허용하거나 금지한다는 정책은 확정하지 않았습니다.

## 검증과 남은 범위

r4 전용 ReleaseSafe 실행은 실제 11개 통과·건너뜀 0입니다. 신규 진단 6개, 기존 flow 2개, Reader 통제 2개, wrapper 1개를 분리합니다. 0/부재/음수/u32 상한·범위 초과·정수 어휘·namespace·중복·Boolean·owner/bounds·unknown flow 분리·기존 오류 순서·읽기 후 원문 불변 및 할당 실패 cleanup을 합성 XML/정수로 검사했습니다. 원 r3는 시험의 예상 오류 비교가 주입 OOM을 전파하지 않아 8통과/1실패였으며, r4는 제품 helper를 바꾸지 않고 OOM 전파와 Reader 명시 등록을 보완했습니다. 두 실행은 별도 보존합니다.

정규 시험은 `src/root.zig`의 명시 import에 연결하며 명령은 [개발·검증 명령](development-commands.md#ole-outside-margin-diagnostic)이 소유합니다. 실제 파일 저장·독립 ZIP/XML 변경 oracle·조판·리사이즈·WASM/JS/Worker 노출·전체 Native 검증의 증거가 아닙니다. setter는 없습니다. 고정 scalar 출력 외에 기존 namespace/ancestor/direct-child 탐색 비용은 남으므로 전체 O(n) 완료를 주장하지 않습니다.

통합 고정 소스의 정규 ReleaseSafe 전체 검사도 종료 0입니다. root 5,032통과·1 skip과 별도 text-splice 9통과를 합쳐 이번 실행은 5,041통과·1 skip이며, cached reference 실행은 이번 통과 수에 더하지 않습니다. skip은 시작·끝 환경변수를 지정하지 않은 mixed-runs 단일 OOM shard입니다. 제품 Safe는 6/6 단계 성공이고, 전체 입력 source 3,464개·로컬 fixture 559개의 전후 해시는 변하지 않았습니다. 새 WASM은 기존 428 export·426 함수의 이름/타입과 0 import를 보존하지만 운영의 d849 엔진과 바이트가 다르며 아직 배포하지 않았습니다. 이 결과가 실제 주석 배치, OLE 편집 권한, 독립 저장 oracle이나 웹 성능을 검증한 것은 아닙니다.
