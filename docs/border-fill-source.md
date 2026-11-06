# 헤더 테두리 원값

## 2026-10-22 선택 채움 원값 연결

전체 HWPX 표 스타일 구/신 비교 `table-cell-fill-source-parity.jsonl/.stderr`는441행·stderr0·exit0으로 종료했습니다(세션53099).439원본 중432동일 열기/7동일 load 거부·498구역·스타일10535·채움3302·지원 단색 계획1577·조회 거부0·원본 불변439입니다. 기존 필드 전체 대조 및 입력/소스/두 WASM/파일목록 종료 불변 단언을 통과했습니다. 이 수치는 compound-edge 채움 분리 **전** 표시 정책이며 style resource의 구역별 조회 횟수입니다. 고유 색상/셀/문서 수나 전체 문서 표시 완료율로 해석하지 않습니다.

단일 노드 조회 최적화 뒤 집중 native7/7·exit0, 별도 후보 `zig-out/verification/table-cell-fill-selected/bin/hwpjs.wasm` 빌드6/6·exit0을 확인했습니다. SHA256은 `f6f739aada2479c73e9b466516807ea437f68e0c7c77b76605b674cd66c0a607`입니다. 새 후보의 단색/선택 Renderer 집중4/4·exit0은 `table-cell-fill-selected-js.log`가 근거입니다. 전체 원본 HWPX 구/신 표 스타일 조회 비교는 `table-cell-fill-source-parity.jsonl`로 별도 실행하며 종료 summary 전에는 전체 성공을 확정하지 않습니다.

수정 후 전체 native probe는558/558·exit0으로 종료했습니다. `zig-out/verification/form-text-layout/audit.HtQpvi/border-fill-native-full-fixed.log`의 최종 요약과 실행 세션12411 종료가 근거입니다. 이 전체 종료 후 선택 brush 조회를 header 전체 순회 대신 정확한 단일 원소 구간으로 제한했습니다. 자식·속성 해석은 동일 collector를 계속 사용하며 이 성능 변경은 별도 집중 검사/후보 빌드가 필요합니다.

후속 공개 소비자·표 단색 paint 및 새50f894b1 후보의 집중 검사는 [셀 표시 정책](table-cell-border-paint.md)을 따릅니다. 넓은 native probe 최초558개 중557개 통과/1개 `NondeterministicMemoryUsage` 실패를 확인했습니다. 실패 위치는 기존 character_style_anchor_fragment의 직접 checkAllAllocationFailures 호출입니다. 공통 allocation_failures.check로 일반 resize 성공 대조와 결정적 실패 주입을 분리한 뒤 전용 `anchor_fragment_allocation_probe.zig` 필터 검사2/2·exit0입니다. 수정 후 전체 probe는 별도 `border-fill-native-full-fixed.log`로 재실행하며 종료 전 전체 통과로 주장하지 않습니다.

native `border_fill_source.Source.fill_report`는 선택한 fill_node 하나만 기존 `fill_brush.inspectBrush`로 해석합니다. 공통 collector의 필드·namespace·자식·예산 규칙을 재사용하며 별도 색상 파서를 만들지 않습니다. 보고서는 Source arena를 소유하므로 헤더 해제 뒤에도 문자열이 유효합니다. 다른 스타일의 잘못된 채움을 함께 해석해 선택한 스타일 조회를 실패시키지 않습니다. 채움 부재는 null이며 기본 흰색/투명도를 합성하지 않습니다.

`nice -n 10 mise exec -- zig test src/border_fill_probe.zig -O ReleaseSafe --test-filter 'border fill source'`는7/7·exit0입니다. 선택 원본 색/alpha·정확한 부모/노드, 헤더 해제 후 문자열·모든 할당 실패·다른 스타일의 잘못된 alpha 격리를 포함합니다. 이 단계는 native 소스 변경이며 기존50e7ded8 WASM·전체 페이지 감사·JS wire/Canvas 표시 지원에 소급하지 않습니다. 새 후보 빌드와 소비자 검증/paint 연결은 후속 작업입니다.

현재 Canvas 지원 정책과 최신 후보·검증은 [원본 셀 테두리 표시](table-cell-border-paint.md)가 소유합니다. 아래 선택적 조회의 최초 후보 기록과 최신 표시 결과를 구분합니다.

## 선택적 WASM·JS·Worker 경계

`hwpx_edit_table_border_sources(section)`/JS `tableBorderSources(section)`를 추가했습니다. 결과는 `{sourceOnly:true,cells,styles}`이며 셀 좌표는 해당 원본 구역 Tree의0기반 node/list ID입니다. 현재 문단 번호나 활성 분기를 추정하지 않습니다. 기존 output_ptr/len/free 버퍼 수명을 재사용하고 JS는 복사·UTF-8/JSON 및 필드·참조 관계 검증 후 독립 객체를 반환합니다. 구 ABI는 HwpxTableBorderSourcesAbiUnavailable로 명시적으로 거부합니다.

wire 검사는 리소스 ID/node 중복, 증가하는 cell node, table/cell/list 선후, 목록 중복, null과 명시0의 구분, style_index→ID 일치, 최대 셀/스타일 수와 원값 필드 모양을 검사합니다. arena/포인터는 게시하지 않습니다. 미지 enum 문자열은 표시 기본값으로 바꾸지 않습니다.

`hwpx-table-border-content.mjs`는 optional export가 있을 때만 구역별 한 번 조회하고 현재 표시 table/list마다 정확히 한 소스 셀인지 확인합니다. 현재 표시되지 않은 원본 셀은 제외합니다. 테이블·목록 Map으로 연결하므로 셀마다 전체 소스 배열을 다시 검색하지 않습니다. 응답마다 tableBorderSources/tableBorderSourceErrors를 새로 만들고 구역 조회/소유권 실패 시 이전 응답을 재사용하지 않습니다. 구 ABI에서는 새 필드를 추가하지 않습니다. Canvas 테두리 정책은 별도 표시 계약을 따릅니다.

별도 ReleaseSafe 후보 `zig-out/verification/table-border-sources/bin/hwpjs.wasm`의 SHA256은 `5950272cc9290bd145f35725b7dc42c1e120a2effce12f596dbced084adc51f1`입니다. 기본 WASM/데모는 교체하지 않았습니다. 명시 후보/구형 GE·LE 후보로 API/Worker/실제 표 격자/미주 장면4파일7/7·exit0·실패/취소/생략0을 확인했습니다. 독립 ZIP/XML의 두 셀/리소스 값, 반복 조회의 독립 객체, 조회 오류 후 재조회, 무편집 byte-exact 저장, 문서 재열기/교체, 닫힌 세션/구 ABI 거부를 포함합니다. 실제 Chromium·편집 명령 전수·한글 조판 동치는 이 결과에 포함하지 않습니다. 새 JS 구문·Zig fmt·변경 파일 공백 검사도 통과했습니다.

## 원본 셀 참조 연결

`table_border_sources.zig`는 한 구역의 원본 tc/tr/tbl 직접 관계와 유일한 subList를 검사해 table_node/cell_node/list_node/border_fill_id/style_index를 반환합니다. 같은 리소스 ID는 요청 내 한 번만 읽고 공유합니다. 부재와 명시0을 구분하며 임의의 표 기본 스타일로 대체하지 않습니다. 최대10만 셀/4096개 서로 다른 스타일로 제한합니다. 없는 ID·잘못된 셀 부모·없거나 중복된 목록은 오류입니다.

테두리·배경 편집이 도입된 현재 조회는 Session의 현재 header 합성과 source section의 셀 참조를 함께 사용합니다. 원본 header만 장기 캐시해 대기 편집값과 어긋나게 만들지 않습니다. 생성 표나 조건부 분기의 활성 선택을 이 원본 조회로 추정하지 않습니다. 편집·원자 배치의 현재 계약은 [셀 테두리·채우기 배치](table-cell-fill-batches.md)가 소유합니다.

조회 보고서는 셀과 공유 스타일을 소유하며 전체 해제/실패 해제를 제공합니다. JSON 직렬화는 Source의 필드 정의를 재사용하되 arena/포인터를 제외합니다. 원본 값은 문자열/null로 게시하며 선택적 WASM/Worker 연결은 위 경계를 따릅니다.

실제9월 node21007의 두 셀→ID4 연결과 무편집 저장 byte-exact, 합성 공유 리소스/참조 부재/서로 다른 목록 ID와 JSON arena 미노출·전체 할당 실패 해제 집중3/3(진입점 포함)이 통과했습니다. 추가 부모/목록/참조 반례와 명시0 검사는 아래 최종 집중 결과로 구분합니다.

최종 ReleaseSafe border_fill_probe의 border 필터9/9·exit0(진입점1+셀 연결3+리소스5)입니다. 부모/목록/참조 반례·명시0과 기존 원값/OOM 검사를 함께 재실행했습니다. 전체 native gate나 WASM 제품 빌드·실제 브라우저 완료를 뜻하지 않습니다.

`src/hwpx/border_fill_source.zig`는 기존 header Tree와 XML 속성/namespace/숫자 파서를 재사용해 한 borderFill ID의 원값을 조회합니다. JS에서 ZIP/XML을 다시 해석하거나 source 원문을 표시 캐시로 교체하지 않습니다. 조회와 표시 지원은 별도 계층입니다.

## 경계·소유권

정확한 head/refList/borderFills 경로만 선택합니다. 중복 컨테이너/선택 ID/직접 자식을 거부하고 ID와 네임스페이스를 검증합니다. 네 변과 diagonal의 type/width/color, slash/backSlash의 type과 자식 존재, threeD/shadow/centerLine, core fillBrush의 node를 구분합니다. 미지 직접 자식은 계수하며 알려진 외형으로 해석하지 않습니다. 외부 namespace의 속성을 원본 필드로 읽지 않습니다.

선언 문자열은각4096바이트 한도로 arena에 복사합니다. 수치·단위를 바꾸거나 enum 기본값을 채우지 않습니다. 원문 TREE가 해제된 뒤에도 문자열은 조회 결과가 소유하며 deinit으로 일괄 해제합니다. 예를 들어 slash 노드는 있지만 type이 없으면 slash_node는 존재하고 slash는 null입니다. diagonal=SOLID만으로 사선 활성화를 판단하지 않습니다. fillBrush 내부의 색·그라데이션·이미지 의미는 아직 이 모듈에서 해석하지 않습니다.

## 검증

ReleaseSafe border_fill_probe 집중6/6·exit0(진입점1+주제5)입니다. root 테스트에도 주제 검사를 등록했습니다. 전체 native gate나 WASM 빌드 결과와는 별개입니다.

실제9월 원본의 header ID4는 네 변NONE/diagonal SOLID/slash·backSlash NONE/fillBrush 부재/미지 직접 자식0으로 관측됐습니다. 별도 JS fixture 회귀의 독립 Python ZIP/XML 값과 일치합니다. 합성 검사는 부재·명시값·미지 enum·수치 단위 보존·엔티티 복호화·소유 수명·foreign lookalike·중복 컨테이너/ID/자식·누락 참조와 할당 실패 전체 해제를 검사합니다. fmt/diff 공백 검사는 통과했습니다.

후속 작업은 native 현재 셀의 borderFillIDRef와 이 리소스의 연결, 선택적 WASM/Worker 조회, 원본 스타일 Canvas 정책입니다. 원본 소스 관측만으로 투명성·그리기 지원·넓은 표 허용을 주장하지 않습니다.

## 대각선 관련 원값의 추가 관측

후속 Native 후보는 기존에 알려진 속성으로 분류하면서 조회 결과에는 빠뜨리던 `Crooked`·`isCounter`와 `breakCellSeparateLine` 값을 함께 전달합니다. `slash_crooked`, `slash_is_counter`, `back_slash_crooked`, `back_slash_is_counter`, `break_cell_separate_line`은 arena가 소유하는 해석된 원문 문자열 또는 null이며 숫자·boolean·대각선 방향을 추정하지 않습니다. JS 경계는 구 Native의 필드 부재를 그대로 허용하고, 새 필드가 있으면 null 또는 길이4096 이하 문자열만 받습니다. 부재·null·빈 문자열·문자열0은 서로 다릅니다. Native 집중8개와 JS 경계12개가 통과했으며 후속 `c14f11aa…e6de02` WASM의 실제 SDK 검사1개도 독립 ZIP/XML과 일치했습니다. 원본 Noori의 header19개 중 실제 구역에서 도달 가능한 것은14개이며, 나머지는 명시한 header ID 순열 파생본으로 구분했습니다. 별도 원값 주입본의 null·빈 문자열·문자열0·비영 값·XML entity도 검사하고 비대상 ZIP 엔트리의 원문 바이트를 보존했습니다. 실제 원본19개 모두가 선택됐다고 확대하지 않습니다. 이 원값 추가는 대각선 편집·그리기 지원을 뜻하지 않습니다.
