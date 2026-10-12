# HWPX 차트 편집의 이중 표현

## 현재 상태

로컬 후보 구현은 차트 소유 포인트·숫자 편집·ZIP/OLE 동시 저장·Session checkpoint/history·WASM/JS·Worker·속성 폼까지 연결돼 있습니다. 기본 제품 WASM 승격과 runtime 코드 커밋은 아직 하지 않았습니다. 최신 후보와 실측은 아래 검증 기록을 따릅니다. 28개 참조 차트 숫자 포인트289개 각각의 편집·저장·재열기·undo/redo와 독립 두 사본 검사가 통과했지만, 이는 모든 문서/차트 구조 편집·Canvas 클릭·렌더링 완료가 아닙니다.

남은 항목은 값이 채워진 owner의 확대 할당 실패 결과, 최신 소스 전체 native/public 검증, 문자열·시리즈 구조 편집, 사본 직렬화가 다르거나 리소스가 공유된 문서 처리, 실제 브라우저 저장 파일 독립 대조, Canvas 선택·차트 렌더링입니다. 아래 초기 단계의 “후속/미연결” 표현은 해당 단계 실행 당시의 기록이며 현재 상태를 덮어쓰지 않습니다.

## 구현·검증 이력

차트 주변 텍스트·문단 편집은 [조건부 개체 주변 입력](hwpx-switch-anchor-edit.md)이 소유합니다. 개체의 내부 데이터 편집은 별도 계약이며 현재 구현 완료가 아닙니다. 기존 `chart_cache`/`chart_formula`는 진단 개수와 텍스트 길이를 관측하고, 값 행렬을 소유하는 편집 모델이나 Canvas 차트 renderer를 제공하지 않습니다.

참조 RHWP 리비전 `e8800c8def63449808a4092798442652ed460552`의 `document_core/commands/object_ops/chart.rs`는 ZIP 차트 XML과 OLE의 `OOXMLChartContents`를 별도로 읽고 논리 차트 일치를 확인합니다. 변경 계획을 양쪽에 적용하고 재읽기 목표 일치를 확인한 뒤, 중첩 CFB 재포장을 먼저 성공시켜 두 결과를 반영합니다. no-op/dry-run/거부는 쓰지 않고 실제 변경 시 페이지 캐시를 무효화합니다. Studio `core/chart-data-target.ts`는 전체 컨테이너 경로와 단일 매칭을 사용하며 애매한 주소를 거부합니다. 이는 해당 소스의 관측이며 우리 구현이나 모든 RHWP 문서의 완료 주장으로 옮기지 않습니다.

`python3 tools/hwpx-chart-representation-survey.py reference/rhwp/samples/chart`는 설치된 독립 `olefile 0.47`로 실제 ZIP/OPF의 chart/OLE 연결과 길이 봉투·`OOXMLChartContents`를 읽었습니다. 28파일·28쌍 모두 XML 바이트가 같았고 파일 입력 불변도 검사했습니다. 첫 표본은 ZIP XML·중첩 XML 각각 5,274바이트, SHA256 `1930ab4fbfe2f1513c93fbc3306049afade003f553b908da29b02d46d5ac37dc`, OLE 길이 선언·CFB 실제 길이 각각 276,480바이트입니다. 값 의미·내부 표/그림 표현·외부 한글 렌더링 또는 전체 참조의 모든 차트에 대한 증명은 아닙니다. 도구는 원본을 수정하지 않고 production 의존성에 연결하지 않습니다.

## 구현 순서와 단일 소유권

정식 `History.Command.chart_numeric_point`는 source wrapper와 point 주소 및 숫자 어휘를 기존 Session mutator로 전달합니다. text start/deleted는0만 허용합니다. 실제 Session 회귀를 정식 History apply/undo/redo, invalid numeric·no-op·배치 후반 invalid numeric 후 rollback과 기존 redo 보존으로 확장했고 집중 1/1 통과(exit0)했습니다. 앞의 수동 checkpoint 교환 결과와 구분합니다. 현재 명령은 native 내부 계약이며 아직 WASM ABI·JS/Worker/UI에는 노출하지 않았습니다. 전체 Session/History OOM·snapshot clone/budget과 후보 재빌드 회귀는 후속입니다.

숫자 현재값은 `chart_resource_values.zig`의 physical chart/OLE pair별 소유 points가 관리합니다. 원본 XML은 Session의 immutable ZIP에서 저장 시에만 재구성하며, 원본 decoded points를 현재값의 mutable cache로 유지하지 않습니다. 같은 pair를 참조하는 wrapper는 같은 현재 owner를 쓰고, 한쪽 path만 겹치는 다중 사본은 현재 `AmbiguousChartPair`로 거부합니다. 다중 사본 전체 갱신은 남아 있습니다. clone/byteSize/deinit는 이 소유 계층이 담당합니다.

`Session.setChartNumericPoint`는 pair/source·숫자 입력을 검사하고 현재 owner를 clone해 수정한 뒤 proxy의 전체 save가 성공할 때만 swap합니다. 기존 text/header/shape 변경과 차트 XML/OLE replacement는 같은 ZIP writer 호출에 조합합니다. checkpoint도 차트 owner를 clone/size/swap/deinit에 포함했습니다. `chart_resource_save.zig`는 transient 원본과 현재값의 diff를 만들며 current 텍스트를 두 번째 저장 캐시로 복제하지 않습니다. 첫 실제 Session 집중 검사 1/1 통과(exit0)는 선행 본문 입력 보존·차트 현재값·저장/재열기·no-op/잘못된 수치 뒤 ZIP 보존·checkpoint 양방향 교환 ZIP 복원·원본 Session.source 불변을 확인했습니다. 이는 수동 checkpoint 교환이며 정식 History 명령·WASM/Worker/UI 및 전체 실패 지점 검증은 아직 후속입니다. 관측 편차의 Session 저장 옵션도 아직 기본 strict만 지원합니다.

`chart_pair_target.zig`는 실제 source section·wrapper에서 chartIDRef와 binaryItemIDRef를 읽고 기존 package/structure 및 OPF ID resolver로 정확한 경로 쌍을 소유합니다. section ordinal/item/source bytes와 SHA 바인딩을 확인하고 여러 case는 모호함으로 거부합니다. 실제 표본에서 OPF `isEmbeded=0`을 재현해, 기존 OLE payload의 정확한 안전한 BinData ZIP 사본 선택을 `ole_payloads.packagedEntry`로 추출해 공유했습니다. Pair의 `declared_external`은 그대로 true이며 외부 URL/파일을 읽거나 선언을 내장으로 고치지 않습니다. 패키지 사본이 없는 외부 대상은 거부합니다. UI에서 외부 원본이 아니라 패키지 사본만 수정한다는 표시·정책 연결은 아직 남아 있습니다.

실패 주입에서 새 resolver의 `Invalid free`도 재현했습니다. borrowed Document의 archive.decode 결과는 archive allocator 소유인데 scoped 실패 allocator로 해제한 오류였습니다. 해당 버퍼를 archive allocator로 정리하도록 수정했습니다. source 변조와 잘못된 Document 연결도 거부합니다. 이 resolver의 실제 집중 검사는 1/1 통과(exit0)이며 이 검사에서 borrowed archive의 decode는 원래 할당자를 사용한다는 점을 전수 실패 범위와 구분합니다. Document 열기까지 실패 할당자로 소유하는 end-to-end 검사는 후속입니다.

원자 후보의 전수 할당 실패 검사도 추가했습니다. 작은 합성 HWPX에 실제 공통 CFB writer로 만든 OOXMLChartContents/형제 stream OLE를 넣고, package/protection·XML 값/변경·CFB 재포장·ZIP 조립·전체 entry 재검사 경로의 모든 실패 인덱스를 공통 검사기로 순회합니다. callback의 성공/실패 모두 입력 전체 바이트가 baseline과 같은지 확인하며 실패 집합을 제한하지 않습니다. `zig test src/chart_tree_regression_test.zig -O ReleaseSafe --test-filter 'chart ZIP candidate'`는 합성과 실제 첫 문서의 2/2 통과, exit0, real9.41초, 최대RSS499531776바이트입니다. 합성 문서를 원본 픽스쳐 수에 더하지 않으며 아직 Session/history publish 검사가 아닙니다.

후속 독립 normal/-O 조사도 각각 exit0이며 28개 전체 ZIP 후보를 확인했습니다. Python ZIP CRC·inventory·comment와 entry의 이름/시각/압축 방식/flags/creator·extract version/attributes/extra/comment, 두 target 목표 바이트·나머지 payload를 대조했습니다. 숫자 XML289변경·OLE28·ZIP28, 값/역할586을 확인하고 변경을 빠뜨린 원본 ZIP을 결과로 내놓는 반례까지 합계140 부정 대조를 실행했습니다. 모든 원본 OLE는 strict 통과이고 정규화0입니다. 원본 input SHA/inventory도 유지됐습니다. 이는 caller가 해결한 고정 chart1/ole1 쌍의 메모리 ZIP 후보 증거이며 arbitrary pair 선택·편집 Session/history·WASM/UI publish나 차트 렌더링 완료가 아닙니다.

`chart_zip_candidate.zig`는 caller가 이미 해결한 정확한 chart/OLE 경로 쌍과 명시적 숫자 변경을 받아 패키지·암호 정책과 두 사본을 검사합니다. XML/OLE 후보가 모두 준비된 뒤 기존 ZIP replace writer를 한 번 호출하고 전체 entry를 재열어 두 대상의 목표 바이트와 비대상 payload를 확인합니다. 반환되는 새 바이트는 caller 소유이며 원본/Session을 수정하지 않습니다. 경로 선택·모호한 여러 사본 해결은 이 writer의 책임이 아니고 아직 상위 resolver/Session API가 없습니다. 첫 실제 차트의 집중 `chart ZIP candidate` 검사는 1/1 통과(exit0)이며 두 사본 반영·no-op 원본 바이트·누락 OLE·출력 한도 거부·입력 불변을 포함합니다. 아직 ZIP 후보의 독립 전수·전체 실패 지점·편집 세션 이력/UI 검증은 후속입니다.

차트 OLE 재포장 후보도 native corpus emitter와 독립 `olefile 0.47`로 전수 대조했습니다. normal/-O 명령 각각 exit0이며 28 OLE 후보의 envelope 길이·CFB 버전·전체 storage/stream inventory·비대상 stream bytes·이름/종류/CLSID/state/시각 메타데이터, target `OOXMLChartContents`와 XML 후보의 바이트 동일성을 확인했습니다. 28개 실제 OLE 원본은 모두 strict 통과했고 정규화 사본은 0개였습니다. 따라서 이 corpus 결과를 관측 편차 경로의 실제 파일 검증으로 계산하지 않습니다. 값·series 주소·변경 XML·OLE target 예상값의 부정 대조는 합계112조건입니다. 독립 도구의 첫 실패는 `olefile`의 state 속성을 `userflags`로 잘못 지정한 도구 오류였으며 실제 `dwUserFlags` 필드를 확인해 교정하고 전체를 다시 실행했습니다. 아직 외부 ZIP 문서에 후보들을 publish하지 않습니다.

`chart_ole_candidate.zig`는 byte-aligned ZIP XML/중첩 XML 사본만 대상으로 새 OLE 메모리 후보를 생성합니다. 기본 strict 실패를 우회하지 않으며 `allow_observed_deviations=true`를 caller가 명시할 때만 기존 HWPX의 InvalidRoot/InvalidFat 복사본 정규화를 사용하고 원본 오류·편차 보고를 결과에 남깁니다. 다른 원본 사본은 `ChartRepresentationMismatch`로 거부하며 논리적으로 같은 다른 직렬화 표현의 대응은 아직 미지원입니다. 새 CFB를 strict 재열어 버전·활성 엔트리·이름별 메타데이터·target 및 비대상 stream bytes를 확인합니다. root의 mini-stream은 재생성되는 집합이므로 독립 stream bytes와 혼동하지 않습니다. no-op은 원본 envelope/CFB 바이트를 그대로 반환합니다. ZIP 문서 publish·이력은 아직 없습니다.

실제 첫 차트 OLE 집중 검사는 처음 `ChartOleEntryMismatch`로 실패했습니다. 새 자체 검사 코드가 표시 경로 `Root Entry/`를 루트 상대 `findExact` 주소로 잘못 사용한 것이며, 파서 실패가 아닙니다. CFB `File.rootRelativePath`로 변환 책임을 한 곳에 두고 root 메타데이터와 kind2 stream 내용의 보존 경계를 구분했습니다. 수정 후 `zig test src/chart_tree_regression_test.zig -O ReleaseSafe --test-filter 'actual chart OLE candidate'`는 1/1 통과(exit0)입니다. explicit 진단·기본 strict 거부·no-op 바이트 동치·사본 불일치 거부·입력 불변을 포함합니다. 독립 OLE 재포장 실파일 전수와 전체 할당 실패는 후속입니다.

중첩 사본 재생성의 기반은 새 공통 `src/ole/stream_replace.zig`입니다. 기존 HWP5 OLE 재생성 구현을 이 계층으로 옮기고 HWP5 진입점은 re-export로 유지하여 CFB/envelope 알고리즘을 HWPX에 복제하지 않습니다. 계약과 7/7 집중 회귀는 [OLE 내부 스트림 교체](hwp5-ole-stream-replacement.md)가 소유합니다. HWPX chart 사본의 명시적 정규화·원본 오류 진단·두 결과의 원자 publish는 아직 연결하지 않았습니다.

`chart_numeric_point_write.zig`는 숫자 cache/literal 포인트의 명시적 변경 목록에서 새 XML 후보를 만듭니다. 아직 세션이나 ZIP/OLE 저장에 반영하지 않습니다. source 바인딩·중복/범위·십진 유한 값·출력 한도를 검사하고 기존 XML source writer를 재사용합니다. `xml_leaf_text_changes.zig`가 target leaf의 콘텐츠 이벤트만 변경해 사이의 comment/PI는 유지하며, UTF-8 변경만 허용하고 다른 인코딩을 추측해 쓰지 않습니다. 후보를 다시 파싱해 모든 포인트와 명시적 목표값이 같은지 확인한 뒤 반환합니다. no-op은 원문 바이트를 그대로 보존합니다. 집중 32/32 통과(exit0)는 comment/PI·CDATA·원문 불변·전수 할당 실패·잘못된 수치 8조건·중복/범위/한도 거부를 포함합니다. 실제 포인트 변경의 독립 전체 XML 대조·두 사본 원자 저장·세션 이력/Worker/Canvas는 후속입니다.

`chart_point_roles.zig`는 같은 원본 트리에 각 소유 포인트의 가장 가까운 series와 직접 역할(`tx/cat/val/xVal/yVal/bubbleSize`) 및 plot 부모를 연결합니다. series 밖 title 포인트는 미분류로 보존하고, 계열의 직접 역할이 아닌 중첩 유사 요소를 계열 값으로 추측하지 않습니다. 이 관계는 원본 주소이며 축 계산·시리즈 행렬 조립·OOXML 호환 분기 선택을 수행하지 않습니다. 집중 회귀는 31/31 통과(exit0), 소유 모델·역할 검사는 root 테스트 목록에도 연결했습니다. 독립 Python normal/-O 대조는 28차트·586포인트·586역할 연결과 잘못된 값/series 주소 56조건을 검증하여 각각 exit0입니다. 이전 전체 native 스냅샷에는 이번 추가를 소급하지 않습니다.

`chart_point_values.zig`는 기존 캐시 Scanner 진단을 통과한 직접 pt/v의 소유 문자열과 cache/level/point/value 원본 노드, idx 및 종류를 수집합니다. XML 콘텐츠 디코딩·Xstring 디코딩·unsigned 어휘 판정은 기존 공통 계층을 재사용합니다. 포인트를 정렬하거나 빈 인덱스를 채우지 않고 `4.30`·`-0` 표기를 유지합니다. 원본 노드와 연결할 때 `validateSource`는 원문 SHA256과 chart kind를 확인해 다른 트리에 값 인덱스를 적용하지 않습니다. 문자열은 소유하지만 노드 조회에는 원본 트리가 필요합니다. 수집 수와 Scanner 포인트 수가 다르면 거부하며 구조 진단도 자동 복구하지 않습니다. 소유 수집·문자열 디코딩·원본 바인딩의 OOM/변조 반례를 추가했습니다. 아직 시리즈/축/라벨 관계·편집 API·저장 writer는 없습니다.

값 수집기에 캐시 종류 분류를 복제하지 않도록 `chart_cache_kind.zig`를 추가하고 기존 `chart_cache.Scanner`가 이 공통 expanded-name 분류기를 사용하도록 변경했습니다. 숫자/문자열 캐시·리터럴·다단계 캐시의 이름과 namespace 판정은 이 모듈 한 곳이 소유합니다. 트리·캐시·수식 집중 회귀 `zig test src/chart_tree_regression_test.zig -O ReleaseSafe --test-filter 'chart'`는 28/28 통과, exit0입니다. 기존 부재/중복/범위 밖 인덱스·다단계·Xstring·할당 실패 회귀를 포함하며, 소유 포인트 값 모델은 아직 구현 중입니다. 이 source 변경도 실행 중인 이전 스냅샷 검증 결과에 소급하지 않습니다.

공통 `xml_part_tree.PartKind`에 chart root를 추가하고 `chart_tree.zig`는 `chartSpace` namespace/ordinal 정책만 위임하도록 만들었습니다. XML 토큰·namespace·원문/span 저장은 기존 구현을 재사용합니다. 합성 전수 할당 실패·잘못된 root/namespace·바이트/node 한도·ordinal 반례는 집중 검사에서 통과했습니다. 실제 28 chart XML의 원문 불변 검사도 추가했으며, 초기 테스트가 `sourceOf(root)`에 XML 선언까지 포함된다고 잘못 기대한 실패를 확인했습니다. element span은 선언을 제외하고 Tree.source가 전체 선언을 보존하므로, 전체 source 바이트 동일성과 root의 해당 원본 범위를 구분해 검사하도록 정정했습니다. 이 트리 기반 계층 자체는 값 모델·변경 저장·WASM/Canvas 지원 완료가 아닙니다.

- ZIP 경로와 OPF/OLE 연결은 기존 패키지·참조 계층을 재사용하고 차트 편집 모델에 독립 경로 해석기를 만들지 않습니다.
- 공통 패키지 사본 선택기 적용 후 `zig test src/chart_tree_regression_test.zig -O ReleaseSafe --test-filter 'actual chart pair' --test-filter 'HWPX OLE'`는 10/10 통과, exit0입니다. 기존 외부 선언/정확 ZIP 사본·원격 경로/위조 binding·내장 mismatch·strict/정규화·모든 할당 실패 회귀를 함께 확인했습니다. 새 기능을 실행 중인 이전 native/public snapshot 결과에 합산하지 않습니다.
- 실제 원본의 strict 통과만으로 편차 분기가 검증됐다고 하지 않도록 첫 표본의 메모리 파생본에 root 생성시각1을 넣었습니다. 기본 strict `InvalidRoot` 거부·명시적 사본 정규화의 원본 오류/시각1 진단·재포장 성공, 추가 root 이름 변조의 `UnsupportedObservedDeviation` 거부를 검사한 후 같은 OLE 집중 명령 1/1 통과(exit0)입니다. 파생본은 추가 원본 픽스쳐가 아니며 실제 파일의 정규화 개수를 바꾸지 않습니다.
- 소유 포인트 모델과 source 바인딩 추가 후 위 chart 집중 명령은 30/30 통과, exit0입니다. 숫자 어휘·역순 idx·XML/CDATA/Xstring·전수 할당 실패·중복/누락/중첩 값 거부·원문 변조 바인딩 거부를 포함합니다. 모델의 실제 corpus 값 전체 대조와 저장 검증은 후속입니다.
- XML 후보 변경의 후속 독립 normal/-O 대조도 각각 exit0입니다. 28차트의 숫자 cache/literal 포인트 289개를 명시적 목표 어휘로 변경한 후보에 대해, Python이 원본 전체 XML에서 해당 v의 값만 변경한 예상 트리와 비교했습니다. 586포인트·586역할 연결, 값·series 주소·변경 XML의 잘못된 예상 84조건도 검사했습니다. 문자열 포인트·수식·서식/확장 요소는 전체 XML 비교 범위에 남습니다. 원본 ZIP/OLE 파일은 변경하지 않으며 이 후보는 이중 표현 세션 저장·이력·렌더링 검증이 아닙니다.
- 실제 값 대조는 `python3 tools/hwpx-chart-point-values-oracle.py /absolute/zig`와 `python3 -O`로 실행하여 각각 exit0입니다. 도구가 `src/chart_point_corpus_test.zig`의 현재 소스로 native 값을 산출하고 Python ElementTree의 독립 원본 노드·idx·Xstring 값과 비교합니다. 28파일·28차트·586포인트 전체가 일치했고 잘못된 값 28조건은 거부됐습니다. 검사 전후 inventory·파일 SHA256 불변도 확인합니다. 검증기/native 종료 오류·누락 inventory를 통과로 축소하지 않습니다. 현재 모델의 값/소유 노드 대조이며 이전 전체 cache inventory 93차트·2296포인트와 합산하거나 편집·저장·시리즈 의미·렌더링 완료로 계수하지 않습니다.
- `zig test src/chart_tree_regression_test.zig -O ReleaseSafe --test-filter 'owned chart tree'`의 최종 집중 결과는 2/2 통과, exit0입니다. 실제 28파일·28 XML도 포함하지만 진행 중인 이전 전체 native snapshot이나 `e4a1` 공개 후보 결과에 이번 트리 확장을 소급하지 않습니다.
- 소유 시리즈/라벨/값 모델에서 원본 숫자 어휘·희소 인덱스·부재와 기본값을 구분합니다. 관측 report를 현재 편집값의 대체 캐시로 쓰지 않습니다.
- 두 표현의 연결·일치와 변경 계획을 확인한 뒤 기존 CFB/ZIP writer로 새 컨테이너를 만듭니다. 한쪽 성공·후반 실패를 세션에 부분 반영하지 않습니다.
- 두 새 표현을 재파싱하고 목표값·비대상 스트림/ZIP 보존을 독립 oracle로 검사합니다. no-op·실패·undo/redo·모든 할당 실패도 검증합니다.
- Worker의 현재 차트값과 Canvas 표시/선택은 같은 모델 revision을 소비합니다. 변경 뒤 원본 OLE 그림이나 과거 SVG를 새 값의 렌더링으로 사용하지 않습니다.

차트 XML 하나만 수정하는 구현으로 전체 차트 편집을 완료 처리하지 않습니다. 값 편집·구조 편집·차트 유형별 렌더링 및 실제 한글 저장/변환 동치는 모두 남은 목표입니다.

## Session/History 할당 실패 실측

강화된 독립 도구가 고정된 이후 숫자 포인트289개 전수 재실행도 1/1 exit0(54,384.720792ms)입니다. 모든 포인트에 ZIP entry 메타데이터/CRC/comment·OLE version/storage/stream inventory 및 entry 이름/종류/CLSID/state/시각 비교가 적용됐습니다. 같은 도구의 파일별 첫 포인트·이력 on/off·반례 검사는 28/28 exit0(23,321.166875ms)입니다. 모두 `1da28e21…` 후보 결과이며 전체 문서 편집이나 기본 제품 승격 증거가 아닙니다.

참조28파일에서 모든 숫자 포인트289개를 개별 수정하는 공개 검사도 1/1 exit0(56,194.286542ms)입니다. 지수 어휘 `1.234e+2`와 음수0 어휘 `-0.00`을 번갈아 적용하며 각 저장 ZIP/중첩 XML을 독립 normal/-O 검사하고 비대상 point 유지·undo 원문·redo 변경본·재열기 원어휘를 확인합니다. 이 실행 중 독립 도구에 ZIP 메타데이터와 OLE 버전/전체 storage inventory/entry 메타데이터 검사를 추가했으므로, 강화된 메타데이터 검사가 최초부터289개 모두에 적용됐다고 주장하지 않습니다. 도구 수정 이후 동일 전수 명령을 다시 실행 중이며 최종 결과는 아직 없습니다.

후속 실제 Chromium `hwpjs-chart-dom`에서 동일 후보로 새 페이지를 열고 실제 app/Worker를 검증했습니다. DOM enable/속성 패널 toggle 후 값 `6.70`과 form.requestSubmit을 통해 Worker 적용·현재값 재조회를 확인했습니다. DOM undo로 `4.3`, redo로 `6.70` 복원을 기다려 확인했고 URL은 유지됐으며 browser errors는 비어 있었습니다. 입력칸 scrollIntoView/focus/select 후 CDP keyboard inserttext `8.90`은 실제 입력값 `8.90`을 만들고 form.requestSubmit 후 현재값 재조회에서도 유지됐습니다. 이는 실제 DOM/Worker와 키보드 입력 증거이나 물리 버튼 클릭·Enter 제출·브라우저 저장 ZIP 독립 검사 완료는 아닙니다. 후속 Enter 시도는 eval의 동일 const 이름 재선언 오류로 선택 준비가 실패했으므로 통과로 계산하지 않습니다. 브라우저와 서버 PID84790을 종료했습니다.

후속 브라우저 조사에서 입력칸이 hidden 속성 패널 아래 있어 rect0·focus 불가였음을 확인했습니다. DOM toggle로 패널을 연 뒤 rect가 생겼지만 CLI fill 뒤 목표값 유지/적용은 아직 확인하지 못했습니다. 후속 관측에서는 기록 객체와 대상 DOM이 사라져 탐색/자동화 상태가 안정적이지 않았습니다. 숨김 패널 원인은 확인했으나 전체 입력 현상의 루트 원인을 확정하지 않으며 제품 수정이나 브라우저 통과로 계수하지 않습니다. 소유 `hwpjs-chart-trace` 브라우저와 서버 PID44473을 종료했습니다. 별도로 app pagehide에 차트 controls.close를 연결했고 단위1/1·JS 문법 검사는 통과했습니다.

실제 Chromium `hwpjs-chart-ui`에서 최신 후보로 첫 차트 load/편집 enable/숫자 원값 `4.3` 표시까지 확인했습니다. `agent-browser fill` 뒤 입력값이 빈 문자열로 관측되며 제출 시 Worker `InvalidChartNumericValue`, 이후 재조회 원값 `4.3`을 확인했습니다. 직접 DOM value 대입은 `6.70`을 유지했으므로 모델값 손실이나 저장 성공으로 해석하지 않습니다. 실제 입력 이벤트/단축키 충돌과 자동화 동작의 루트 원인은 아직 미확정이며 브라우저 UI gate는 실패/미완료입니다. 소유 브라우저와 포트10014 테스트 서버(PID24421)는 종료했습니다.

대상 조회 ABI `hwpx_edit_chart_nodes`와 JS `chartNodes(section)`는 같은 native switch 적격성 판정으로 source wrapper 인덱스를 반환합니다. 최신 `chart-nodes` 후보 SHA256 `1da28e2168ba3737deb4ec07390fef105514850391a531dfcb6b4dd272a15b5a` ReleaseSafe6/6 exit0, 공개 editor28/Worker1 합계29/29 exit0(17,071.234709ms)이며 Python 독립 wrapper inventory와 native 대상 목록도 비교합니다.

`chart-controls.mjs`는 문서 내 대상과 숫자 포인트 선택·입력 폼을 소유하고 적용 후/undo/redo에 현재값을 다시 조회합니다. Worker 조회 응답은 requestId·section·wrapper를 반환하며 오래된 응답은 UI에서 무시합니다. UI 초안은 model 값을 덮어쓰지 않습니다. DOM 대역 단위 검사1/1과 최신 Worker 검사1/1 exit0입니다. 실제 브라우저 동작·Canvas 객체 클릭 연결·차트 렌더링은 아직 검증/구현 완료가 아닙니다. 기본 제품 WASM은 이 후보로 승격하지 않았습니다.

공개 적대적 회귀를 추가한 최신 실행은 editor28 + Worker1 =29/29, fail/cancel/skip/todo0, exit0, 16,691.155958ms입니다. 잘못된 section/wrapper/point 인덱스, 빈 값·Infinity·오버플로·공백/태그 혼입·1MiB 초과·문자 point 수정 거부와 실패 후 저장 불변을 확인합니다. 각 이력 세션에서 두 번째 값 `6.70`을 적용한 뒤 단계별 undo/redo와 기존 첫 변경 복원을 확인했습니다.

native 전체 할당 실패 순회도 최초 `314.159` 변경 후 이미 채워진 owner에서 `6.70`을 적용하고 undo하는 경로를 추가했습니다. 두 번째 변경 실패 시 리소스1개와 이전 `314.159` 값 유지 여부를 검사합니다. 이 확대 실행은 아직 진행 중이며, 아래 25,968회 통과는 확대 전 최초 변경만 포함한 결과입니다.

같은 `56a33ca9…` 후보에서 공개 API 검사를 명시적 참조 chart 폴더 28파일 전체로 확대했습니다. 최신 실행은 28/28 통과, fail/cancel/skip/todo0, exit0, 15,649.35975ms입니다. 각 파일에서 이력 off/on 두 경로와 독립 normal/-O 양성·잘못된 예상값 음성을 실행합니다. 한 파일의 첫 숫자 포인트 편집이며 모든 포인트/시리즈 구조 편집 전수로 확대 해석하지 않습니다.

Worker는 `chart-points` 조회와 `chart-numeric-point` 명령을 공개 editor API로 전달합니다. HWPX·열린 이력 세션을 요구하고 변경 후 기존 display 재생성과 현재값 응답을 반환합니다. `tests/hwpx/chart-current-worker.test.mjs` 첫 실제 파일 검사 1/1 exit0은 변경값·NaN 거부 뒤 저장 불변·undo/redo 저장과 조회값 복원을 확인합니다. 현재 조회 명령은 source wrapper 인덱스를 명시적으로 받으며 자동 선택/Canvas 편집 폼·차트 렌더링은 연결되지 않았습니다.

현재값 조회는 `chart_current_snapshot.zig`가 pair와 소유 point 복사본을 반환합니다. 이미 편집된 물리 리소스는 canonical owner를 우선하고, 조회만으로 리소스를 등록하지 않습니다. 공개 ABI는 `hwpx_edit_chart_points`·`hwpx_edit_set_chart_numeric_point`, JS는 `chartPoints`·`setChartNumericPoint`입니다. 숫자 입력 한도는 1MiB이며 문자열 어휘를 유지합니다.

ReleaseSafe 후보 `zig-out/verification/chart-query/bin/hwpjs.wasm` SHA256 `56a33ca9ae5402eeee451c26423d261a26a484186c21274096013e97529e20f2`는 6/6 빌드 단계 exit0입니다. `tests/hwpx/chart-current-editor.test.mjs`는 실제 첫 차트에서 이력 on/off·조회 불변·이전 응답 소유권·숫자 편집·NaN 거부·저장/재열기와 이력 on undo/redo를 검사해 1/1 exit0입니다. `hwpx-chart-session-oracle.py` normal/-O 각각 전체 XML 의미와 두 사본 바이트·비대상 ZIP/OLE stream을 독립 검사하고 잘못된 예상값 거부도 확인합니다. 이 검사는 28파일 전수·전체 ZIP 메타데이터·Worker/Canvas UI 완료 증거가 아닙니다. native 현재값 복사 회귀도 1/1 exit0입니다.

`zig test src/chart_tree_regression_test.zig -O ReleaseSafe --test-filter 'chart Session History owns'`는 exit0, 1/1 통과했습니다. 실제 차트 파일의 Session.open부터 최초 숫자 편집·저장·undo/저장·redo/저장까지 성공 경로를 포함한 25,968회 할당 실패 순회를 실행했습니다. 원본 입력 불변, 최초 편집 실패 시 빈 리소스 상태, undo 원본 바이트와 redo 변경 바이트 동일성을 검사합니다. 실측 real586.76초, 최대 RSS1,494,040,576바이트입니다. 이미 차트 리소스가 채워진 상태에서 두 번째 변경의 checkpoint capture 실패, 공개 WASM API와 Worker/Canvas UI는 이 검사의 범위 밖입니다.

WASM의 이력 비활성 dispatch도 `chart_numeric_point`를 native Session setter로 전달하도록 연결했습니다. 최신 소스 ReleaseSafe 후보 빌드는 `zig-out/verification/chart-session`에 별도로 생성하며, 빌드 완료나 기본 제품 승격을 이 실측으로 주장하지 않습니다.
