# Renderer 성능 진단과 격리 최적화 현황

이 문서의 current05는 2026-10-31 조사에 사용한 기존 배포본을 가리킵니다. 해당 배포본의 Main/Worker CPU 진단과 renderer 후속 후보의 상태를 구분해 기록합니다. Native 모델·history owner-window·public full 응답·authority 계약은 [history owner-window SSOT](hwp5-history-owner-window.md)가 소유하며 여기서 다시 정의하지 않습니다. 진단 표본, 정합성 시험, micro 대조, 실제 브라우저 ABBA는 서로 대체하거나 합산하지 않습니다.

이 문서는 현재 조사 상태이며 최적화 완료 선언이 아닙니다. 아래 font·trace·flow 후보의 공개 운영 반영·배포는 없으며 기존 운영은 유지합니다.

## current05 단일 CPU 진단

exact 진단 입력은 SDK packet `e2cb0d959b5661a0303a500e987e647b0cfb2b0a4b1318c9faf60b02a81b7b3d`, app packet `891cef48e27e61bfe95c99796a8dbb7eebd677d9d6518a5768debc338aae5722`, source manifest `fc3f4f21f79e29ed5980a76cb1db30019f721d7d6924977e433f084f82d8674d`입니다. 원1bca의 recipe만 재사용했고 그 수치·함수주소 분류는 승계하지 않았습니다.

Noori p15에서 trusted 입력40→Meta+Z40(repeat39,Ctrl=false)→r을 전용 브라우저1개로 진단했습니다. host 단일 시계의 입력전송 시작→최종 읽기는1281.762ms, undo 시작→최종943.378ms, r 시작→최종903.588ms였습니다. 이들은 겹치는 구간이며 합계로 전체 대기시간을 만들지 않습니다. 반복 ABBA나 후보 전후 효과 측정도 아닙니다.

| realm | profile wall | 표본 covered | non-idle self | idle self | 표본 수 |
|---|---:|---:|---:|---:|---:|
| Main | 1332.138ms | 1327.149ms | 1228.843ms | 98.306ms | 172 |
| 실제 Worker | 1349.463ms | 1346.514ms | 10.287ms | 1336.227ms | 99 |

Profiler 간격은10000µs(100Hz)로 요청했지만 실제 sample delta는 균일하지 않습니다. 시작/정지 왕복을 포함한 profile wall과 host wall·self 표본은 다릅니다. r 구간 근사 정렬의 시작 왕복 불확실성은 Main±24.08ms/Worker±9.39ms입니다. 두 realm은 중첩 실행하므로 Main+Worker를 더해 wall에서 빼지 않습니다.

Worker의 유일 non-idle 표본은 원문상 WebAssembly.Module.exports 검사였고 Native undo 프레임으로 분류하지 않았습니다. Native undo·reference·window·ranges 호출은 코드에 있지만 이번 표본에 해당 함수주소/wasm frame이 없어 직접 시간·호출 수를 분해하지 못했습니다. 짧은 실행은 sample 사이에 빠질 수 있으므로 Worker 대부분 idle을 Native 비용0이나 호출 부재로 해석하지 않습니다.

진단은 tracing/screenshot/save 없이 진행했고 intrinsic을 바꾸지 않았습니다. 최종 text/caret DOM marker·busy=false·paintPending=false와 소유 browser inactive/pidnull/잔류0을 확인한 범위이며 실제 pixel 표시 완료·저장 정합성은 별도입니다.

## 함수 귀속과 unknown 재분류

원 direct self에서 문단 재사용 lookup102.299ms, FlowKey signature55.953ms, store19.016ms가 관측됐습니다. font resolver Map28.215ms와 browser font setter35.127ms도 별도 귀속입니다. 이는 그 표본의 함수 self이지 호출수·전체 선형성·제거 가능한 시간 또는 최적화 예상 이득이 아닙니다.

후속 unknown source review는 **원 unknown581.547ms만** 현재 bundle의 UTF-16 column·lexical function·caller에 맞춰 배타적으로 재분류했습니다. 동일 profile의 추가 해석이며 새 browser/profile은 없습니다.6개 source provider·85개 주소를 대조한 범위입니다.

| 기존 unknown의 재분류 | 배타적 self |
|---|---:|
| 표·페이지·행·그림 geometry 조판 | 159.002ms |
| 도구모음·서식 활성조건·trace DOM | 115.676ms |
| 입력·ACK·선택·caret 동기화 | 85.950ms |
| 글꼴·문자 스타일·측정 | 72.747ms |
| Canvas paint·선택영역·채움 준비 | 37.280ms |
| preview·draft·reflow 투영 | 35.711ms |
| JS history·Native 출처 검증 | 33.398ms |
| 출처 미확정 rAF | 14.961ms |
| 진단 observer 읽기 | 10.396ms |
| 공개 owned 관측 생성 | 6.668ms |
| FlowKey 보조 | 5.274ms |
| lookup stamp 보조 | 4.484ms |

위 표를 원 unknown581.547ms에 다시 더하지 않습니다. 기존 direct 분류나 nearest-known-ancestor/inclusive 합계에도 중복 합산하지 않습니다. program126.995ms와 GC82.403ms는 원 direct 표의 별도 항목이고 미확정 rAF도 확정 귀속으로 바꾸지 않습니다.

Canvas37.280ms 중 fillText를 포함하는 helper14.986ms 전체를 내장 fillText 시간이라고 하지 않습니다. 글꼴72.747ms 중 내장 measureText self는8.342ms입니다. UI의 createElement15.005ms·append14.913ms는 demo setTrace DOM 재생성이지 진단 observer가 아닙니다. 입력 쪽 structuredClone14.163ms는 pending intent의 beforeSelection 복사이며 전체 Native DTO/bridge 복사로 귀속하지 않습니다. 따라서 이 표본만으로 남은 원인을 전체 bridge clone 하나로 좁히지 않습니다.

## 후보별 상태

### Font-family string memo r1

격리 delta는 character-font-display/text-style2파일입니다. 해당 r1 manifest는 순수 Node14 및 명시3파일 lint/fmt exit0을 기록하고 browserExecuted=false/sdkBuilt=false/performanceClaim=false로 봉인됐습니다. 정합성·품질 통과는 실제 font/style hot path의 시간 단축을 입증하지 않습니다.

후속 실제 current05 A와 font memo B를 비교한 ABBA8이 완료됐습니다. p15 burst4·30Hz4이며 각 모드에서 A2/B2, 자동 재시도0입니다. 원 r1 manifest의 browserExecuted=false/sdkBuilt=false는 그 source 세대 기록으로 보존하며 후속 QA 결과와 구분합니다.

| 실제 font QA | A의 r→최종 DOM marker 평균 | B의 평균 | 판정 |
|---|---:|---:|---|
| burst, 각2표본 | 905.35ms | 864.65ms | 약4.5% 짧은 관측값이나 범위가 겹쳐 개선 미확정 |
| 30Hz, 각2표본 | 83.95ms | 80.65ms | A113.4/54.5ms·B54.4/106.9ms로 큰 편차 |

8사례 모두 strict 최종 text·실제 focus/caret0:15:3·current authority·paintPending=false·ariaBusy=false, trusted 입력40·Meta+Z40·repeat39·untrusted0, console 오류0 및 inactive/pidnull/소유잔류0을 확인했습니다. 이는 실행된 조건의 기능 정합성입니다. UI history는 undo가능/redo불가가 같았지만 driver가 whole capabilities JSON을 비교하지 않았으므로 전체 caps 동치라고 주장하지 않습니다. DOM current-frame marker는 glyph 실제 pixel 완료가 아니며 pixels 근거0입니다. Native admission/commit 전용 marker도 직접 관측하지 않았습니다. 추가 저장·독립 oracle는 없습니다.

CPU profiler0·양쪽 같은 low-timeline 계측 조건의 관측입니다. 각 실행의 HOST-BEFORE/AFTER에 별도 호스트 작업의 높은 CPU 부하와 경합 메타데이터를 보존했습니다. 이 부하를 단일 원인으로 확정하거나 결과를 임의 보정하지 않습니다. 작은 표본·겹치는 범위·편차·고부하 때문에 **속도 개선 미확정, 승격 보류**입니다. 정합성 통과를 speed gain으로 바꾸지 않습니다.

B 소스2파일·실제 HTTP bundle SHA·세션 resource URL과 Worker1f2e/WASMd849·manifest 전후 일치를 연결한 private QA 범위입니다. font 후보 운영 배포0을 유지합니다. 기존 history03/04 또는 COW08·hist05 small4와 ABBA8을 중복 합산하지 않습니다. 입력 문자열 캐시의 불변 의미·mutable/getter/provider 교체 경계는 source 소유자의 별도 계약으로 유지합니다.

### Trace DOM 재사용: 실제 current05 ABBA8

trace-only 후보는 shell/trace source2의 별도 delta이며 core SDK·Worker·Native 엔진은 유지합니다. font/flow 후보를 섞지 않았습니다. 현재05 baseline A와 trace B를 p15 burst4·30Hz4, 각 모드 A2/B2의 fresh ABBA로 비교했습니다. 아래 값은 r 재입력→최종 DOM marker 관측 평균입니다.

| trace QA 모드 | A | B | 관측과 판정 |
|---|---:|---:|---|
| burst, 각2표본 | 885.40ms | 930.35ms | 약5.1% 길어짐 |
| 30Hz, 각2표본 | 107.90ms | 57.90ms | 약46.3% 짧아짐 |

**모드별 방향이 반대이고, 고부하·작은 표본이므로 일관된 성능 개선은 미확정이며 승격 보류입니다.** 기능 정합성은8사례 모두 최종 text/focus/caret0:15:3·current authority·paintPending=false·ariaBusy=false, trusted40·Meta+Z40·repeat39·untrusted0·console 오류0·소유 browser inactive/pidnull/잔류0으로 통과했습니다. 이 최종값의 엄격 검사를 TypeScript strict 또는 속도 개선으로 바꾸지 않습니다.

측정 종료 후 읽은 trace DOM은 각100개 전체 문자열 배열이8회 모두 exact였고, operation25→82 비감소·operation/view 일치·중복42개를 유지했습니다. 측정 중 기록한 raw publicationTrace와도 최종 배열이 같았습니다. 이는 최종 목록의 상한·순서·중복 보존 근거이며 모든 중간 update의 전체 입력 목록을 독립 수집한 oracle는 아닙니다.

UI undo가능/redo불가만 비교했으며 whole capabilities JSON 동치는 범위 밖입니다. Native ACK/commit 전용 관측·실제 pixels 완료·추가 저장/독립 oracle도 없습니다. CPU Profiler/Debugger0, 기존 양쪽 동일 low-timeline 계측 조건이고 별도 호스트 고부하를 메타데이터로 보존했습니다. 전체 브라우저 실행시간은 입력 지연값이 아닙니다. B의 실제 HTTP bundle/resource와 source핀·manifest 전후 일치를 연결한 QA이며 공개 운영 배포는0입니다.

기존 profiling 표본, font ABBA8, flow Node micro와 이 trace ABBA8은 서로 다른 관측입니다. 각각의 평균/통과/중복 결과를 합쳐 하나의 개선율이나 최적화 완료 수치로 만들지 않습니다.

### Flow mutable copy r1

격리2파일은 paragraph-flow-reuse와 flow-mutable-copy입니다. store가 소유한 geometry snapshot의 plain 그래프를 계획화하고 hit마다 새 mutable 결과를 복원하는 후보이며 alias/cycle·중첩 mutation 격리와 opaque 값의 structuredClone fallback을 유지합니다. 기존 Native stamp/issuer·public full schema는 변경하지 않습니다.

기록된 정합성 근거는 pure5와 실제 Native Noori3owner×initial/splice/undo/redo/bodydraft의 전체 layout 비교15입니다. Node 고정8px/UTF-16 metric·직접 Reader 경로이며 실제 글꼴/Worker 전달/Canvas pixel/속도 동치가 아닙니다. lookup 분모900=hit504+miss351+조기 fallback45입니다. Native paragraph bypass1200은 lookup/store 양쪽을 포함해 이 분모의 적중률이 아니며 key walk visits84943도 문단 fallback만의 방문 수가 아닙니다. label wrapper0을 전체 문서·전체 실행의 label 발급0으로 확대하지 않습니다.

**최종 결정은 앱/SDK 승격 중단(STOP_APP_PROMOTION)입니다.** 실제05 Noori private store snapshot351개로 Node warmed micro ABBA8라운드를 실행했고 B 계획복사가8/8라운드 모두 느렸습니다. A structuredClone과 B는 각각44928회이며 누적 A666.493ms/B821.506ms, B/A1.23258(약23.3% 증가), 라운드 범위1.19716..1.27897입니다. 이는 동일 corpus 복사 micro의 시간이며 실제 browser 회귀율이나 Main lookup102.299ms 제거량이 아닙니다.

계획 생성6.234ms는 위 복사시간에 포함되지 않습니다. 양쪽이 원 snapshot을 보유한 상태에서 explicit GC 전후 retained heap 단일 차이9047648bytes(8.629MiB)를 별도 기록했습니다. 정밀 객체 크기·순간 peak·브라우저 heap은 아니며 Map/closure/GC 타이밍 등의 한계가 있습니다.351개 deepStrictEqual은 복사 값 동치이며 Native 시험351개나 새로운 layout/브라우저 사례로 계상하지 않습니다.

실측은 warmup/계획 생성/heap 측정/양방식 warmup 뒤 같은 A/B/B/A 순서를 유지했습니다. 느린 라운드를 버리지 않았습니다. store의 기존 structuredClone 성공 후 외부에 노출되지 않는 private plain snapshot만 후보 입력이며 일반 structuredClone drop-in 대체가 아닙니다. opaque 값은 기존 복사로 fallback하고, intrinsic monkeypatch·외부 Proxy 직접 적용·Native fatal OOM·동일 heap 비용까지 동치라고 주장하지 않습니다. 원 후보r1은 불변 보존하고 추가 미세조정·앱 승격은 중단했습니다. 기존 정합성5/layout15 성공으로 성능 실패를 상쇄하지 않습니다.

## 호스트 조건을 구분한 quiet16

호스트 조건을 조정한 별도 관측군에서 font8→trace8을 순차 실행했습니다. 각 후보의 p15 burst·30Hz별 ABBA4, 각 A/B2표본입니다. quiet라는 이름은 무부하를 뜻하지 않습니다. 전후 순간 호스트 표본에도 잔여 부하·변동이 있었고 연속 CPU 계측이 아닙니다. 이전 고부하 결과와 묶거나 호스트 조정의 인과효과로 해석하지 않습니다.

| quiet 개별 후보 | 모드 | A r→최종 DOM marker 평균 | B 평균 |
|---|---|---:|---:|
| font | burst | 785.35ms | 717.15ms |
| font | 30Hz | 54.35ms | 54.30ms |
| trace | burst | 802.15ms | 767.05ms |
| trace | 30Hz | 56.80ms | 55.90ms |

font burst B의 두 표본은666.9/767.4ms로 차이100.5ms가 평균차68.2ms보다 큽니다. trace burst의 B765.6/768.5ms는 이번 A790.6/813.7ms보다 낮았지만 A도 순서상23.1ms 증가했습니다. 따라서 burst 한정 작은 양성 단서는 있어도 시간추세·잔여부하와 후보효과를 분리하지 못했습니다.30Hz의 실질 개선도 미확정입니다. 이16건은 기능·cleanup 완료이며 자동 성능 승격 근거가 아닙니다.

quiet 최종 closure가 조합 미빌드·상호작용 미검증이라고 기록한 것은 당시 시점의 범위입니다. 이후 별도 QA로 실행한 아래 combo16과 원 기록을 덮어쓰지 않고 연결합니다. quiet16을 combo16 성과로 승계하지 않습니다.

## Font+trace 조합16: 기능은 통과, 성능 승격은 중단

별도 조합 QA는 p4/p15 × burst/30Hz × ABBA4, 각 조건 A/B2표본의 총16건입니다. 조합 제품4의 actual 소비 source/bundle·resource 지문과 기존 SDK05/Worker/Native 엔진을 연결했습니다. 개별 font·trace 후보 및 고부하·quiet 결과는 여기에 합산하지 않았습니다. 조합의 trace helper 세대도 초기 단독 후보와 구분하며, 평균 차이로 정량 상호작용을 추정하지 않습니다.

| 조합 위치 | 모드 | A r→최종 DOM marker 평균 | B 평균 | 관측 |
|---|---|---:|---:|---|
| p4 | burst | 741.10ms | 758.85ms | 약2.4% 길어짐 |
| p4 | 30Hz | 54.35ms | 54.90ms | 개선 없음 |
| p15 | burst | 798.00ms | 782.45ms | 약1.9% 짧은 작은 관측값 |
| p15 | 30Hz | 57.60ms | 62.10ms | 개선 없음 |

p4 burst의 ABBA698.3/738.6/779.1/783.9ms는 뒤로 갈수록 커졌고 p15는817.5/790.0/774.9/778.5ms로 대체로 낮아졌습니다. 작은 평균 차이가 순서·잔여부하를 제거한 후보 효과라는 증거는 아닙니다. 문단/모드 전반의 일관된 end-to-end 이득이 없어 **조합의 성능 승격을 중단했습니다.**

16건 모두 최종 원문+r·focus/selection/caret·current authority·paintPending=false·ariaBusy=false·trusted 입력40/Meta+Z40/repeat39·console 오류0과 소유 browser 종료/잔류0을 확인했습니다. 최종 trace100개 배열·operation/view25→82 비감소·중복42개·raw publicationTrace 동치도 보존됐습니다. 이는 기능/최종 목록 정합성이며 모든 중간 update 입력의 독립 oracle는 아닙니다. UI history 상태 외 whole capabilities JSON, Native ACK/commit 전용 관측, 실제 pixel 완료는 미검증입니다.

### 조합 저장4 독립 oracle

각 조건의 첫 B에서 측정 종료 후 정상 UI 저장 동의를 거쳐 만든 네 파일을 별도 검사했습니다. 원본 Noori에서 section0 paragraph4 또는15의 UTF-16 offset2에 r을 삽입한 기대를 독립 도출했으며 저장본에서 기대값을 추출하지 않았습니다. 전체 decoded section326 records·UTF-16/style/range/header/cache 규칙, 비대상12 streams와 directory metadata가 일치했고 잘못된 문자R·offset3 기대는 거부했습니다.4건 모두 통과입니다.

이 결과는 physical CFB 전체 byte 동일·모든 문서 무손실·실제 pixels·속도 이득의 증명이 아닙니다. 저장4는16기능 사례와 다른 층의 같은 실행 산출물 oracle이며 별도 신규 브라우저 사례로 더하지 않습니다. 원 combo HANDOFF의 저장 oracle pending은 작성 시점의 기록으로 보존하고, FINAL-CLOSURE가 뒤의 독립4통과를 연결합니다.

## 계측 조건 정정: CPU Profiler0과 CDP Tracing 활성은 다름

quiet16+combo16의 원 스크립트·명령로그·trace32개를 읽어 확인한 결과 CPU Profiler는0이지만 **CDP Tracing은 전32회 활성화**돼 있었습니다. 요청은 `Tracing.start({categories:'-*,devtools.timeline',transferMode:'ReturnAsStream'})`입니다. Trace0·pristine·비계측 실사용 latency라고 표현하지 않습니다.

스크린샷 범주는 요청하지 않았고 실제32개 trace의 Screenshot 관련 name/category 이벤트 합계도0입니다. 실제 category는 metadata, devtools.timeline 및 GC/V8/blink/loading/rail 조합이며 상세 원문은 audit packet이 소유합니다. 이벤트0은 glyph pixel 완료를 검증했다는 뜻이 아닙니다.

Tracing은 trusted 키 입력과 초기 읽기관측 전에 시작해 trusted40→Meta+Z40→r→최종 strict state·DOM/rAF marker·읽기 snapshot 뒤 종료했습니다. stream 읽기·추가 trace DOM 확인·저장·브라우저 close는 latency 최종 관측 뒤입니다. 그 뒤 수집 비용을 입력 지연에 더하지 않았지만, **입력 구간의 trace 기록·DOM/rAF/longtask 관측 오버헤드는 독립 분리·차감하지 않았습니다.** A/B의 같은 category/stream/observer 설정만으로 상대 영향이 완전히 상쇄된다고 증명하지도 않습니다.

정확한 표현은 동일 low-timeline 계측 조건에서 관측한 제한된 A/B 표본입니다. 초기 CPU self 진단과 이 저수준 timeline 계측 A/B도 별개이며, 실제 Native ACK 시각·비계측 사용자 지연·renderer 전체 최적화 완료로 확대하지 않습니다.

## 후보별 최종 판정과 원복

| 후보 | 이번 판단 | 제품/운영 상태 |
|---|---|---|
| flow mutable copy | Node warmed micro에서 일관되게 느리고 계획 비용도 추가되어 기각 | 원 artifact 보존·앱/SDK 승격 중단 |
| font memo 단독 | 고부하/quiet 소표본에서 편차·시간추세가 남고30Hz 이득 미확정 | 개선 미확정·승격 보류 |
| trace 단독 | 고부하 모드 방향 불일치, quiet burst만 작은 양성 단서 | 일관 개선 미확정·승격 보류 |
| font+trace 조합 | 기능16·저장 oracle4 통과와 별개로 p4 burst는 느리고30Hz 개선 없음 | 성능 승격 중단 |

메인에서 제품4source+정규tests4를 임시 통합해 정규20통과·8파일 lint/fmt를 확인한 뒤 자료를 보존하고 원본 복원을 완료했습니다. 그 정합성 검사는 속도 이득이나 제품 채택이 아닙니다. 후보 제품 source 커밋·새 코드 운영 배포는0이며 기존 운영 세대를 유지합니다. 이는 이번 후보들의 조사/판정 기록이지 renderer 성능을 개선 완료했다는 선언이 아닙니다.

## 판정과 집계 원칙

- profiling은 병목 후보를 좁히는 근거이며 실제 A/B 효과와 다릅니다. 단일 진단과 이후 ABBA 결과를 같은 시간 표로 직접 비교하지 않습니다.
- unknown 재분류는 같은 표본의 분할입니다. source/pure/전체 layout 비교/실브라우저 사례와 sub-assertion을 합쳐 독립 기능 통과 수로 세지 않습니다.
- 성능 승격에는 같은 입력/fixture·font/provider·Native/SDK/app/Worker 지문, 실제 소비 경로와 반복 순서·실패 보존·정합성/저장 oracle가 필요합니다. 이 문서가 gate를 완화하거나 새 실행을 승인하지 않습니다.
- 각 실행군의 원 판정을 보존하며 위 후보별 최종 판정을 따릅니다. font·trace 단독은 개선 미확정, flow·조합은 성능 승격 중단이며 전체 renderer 최적화 완료 선언은 아닙니다. 기존 history-owner-window의 완료 결과·배포 이력을 renderer 후보의 성과로 상속하지 않습니다.

## 불변 입력

| 근거 | SHA256 |
|---|---|
| current05 CPU HANDOFF | `e27a78f05f91312fff1652c958e11673410dadd2e0e27d8c44b4c01333fe50e9` |
| unknown source review HANDOFF | `929c8832d50a8dc0b091fdabfa4b23dbcd2eb412c1d011c35d7d3207090c6517` |
| font memo r1 MANIFEST | `4c8888e6efe6843e21782c076ed221983b76983e88a34c834bc6b5faab24727e` |
| font 실제 ABBA8 HANDOFF | `4d574f46ace1086473877b530745d2c252ca03619c71bdfe3fea0f2807c72da2` |
| trace 실제 ABBA8 HANDOFF | `1732623cdd2dcce2cd0bf88151a0f0b2b186d6e0925ff6013719ceb8d18bd12c` |
| flow r1 HANDOFF | `45d81901c197c766e77349927d66d74d7ba494b35f446f52378a39ac50c20738` |
| flow 최종 micro HANDOFF | `a403698c2672d4f049c70a1290bb838bcd6fb380bbdb195b9e4419b31e061129` |
| quiet16 HANDOFF | `ec81b140f251373046a301ff8744e83d696d10661bc0317e8afea9689f986fcc` |
| quiet16 FINAL-CLOSURE | `5b03abf8123d94bdba291532819ae84d2a249e252f3f94d7ea44274808b02d53` |
| combo16 HANDOFF | `7dbad0bcc737715b30b4461d8f458e4894a22e0292b8b47f6756b998e13d6aa7` |
| combo16 FINAL-CLOSURE | `a3ba376fcd763009a3377c561beb6451658e15b7bbd0fbcae69cc928510104c4` |
| combo 저장4 oracle | `b5960b794dc002a645845ace924d169f1472f3b6b555179b0ba2374660993ccc` |
| Trace 조건 addendum | `2c94fbe06b33289c1a175a4363dbaa71fb71a8e498c9ce13badb614d6351f137` |
| Trace scope audit | `44849aa9a8b2662631619b35ba1c7cda403c10b4f6695fd7dad93696ea8ec8b2` |

exact 로컬 경로와 읽은 연결 지문은 후보 manifest에 기록합니다. ignored 검증 자료는 source-only checkout에 자동 포함되지 않습니다.

## Presentation 서식 관측 공유 P: 미채택

P는 실제05 동결 SDK67/앱을 기준으로, 같은 동기 표시 호출에서만 서식 관측을 공유한 격리 후보입니다. 순수22개(정규20·별도 baseline 비교2)와 기존 d849/Noori p4·p15의 공개 editor 발급 상태2개에서 출력 동치·관측 결과 identity4→1을 확인했습니다. reader 요청은 양쪽4회이며 전역 함수 hook 계수나 전체 파이프라인 복잡도·속도 개선 증명이 아닙니다. 최초 capabilities getter 누락 의심은 **실제05에서 비재현으로 종결**했습니다. 해당 서식 경로의 getter 호출은0회이고, 공유 밖 history 조회는 매 presentation마다1회로 같은 state의 readOnly 변경을 즉시 반영했습니다. helper import 이전 prototype 교체를 원 접근자로 인증하지 않는 한계는 남습니다.

후속 trace-off ABBA16은 p4/p15×burst/30Hz, 각 조건 A2/B2입니다. 기능16은 통과했지만 burst의 작은 차이·순서 추세와 30Hz의 악화를 넘는 실질 이득이 확정되지 않아 **P 제품 소스5는 미채택·실제 제품 소스 적용0**으로 보존합니다. 같은 실행군의 저장4는 원본b18에서 p4/p15의 UTF-16 offset2에 r을 삽입한 기대를 독립 생성해 전체 decoded section·비대상12스트림·metadata 및 오문자/offset 음성 대조를 통과했습니다. 이전 저장 성공과 합산하지 않으며 물리 CFB 전체 byte동일·완전무손실 전체범위 인증은 아닙니다.

마감 B postHTTP의 `fetch failed`는 메인이 후보 서버를 전환한 순서가 원인임을 확인한 별도 인프라 관측입니다. 원 실패는 보존하고 P 기능 회귀로 분류하지 않습니다. 실행 전 HTTP·실소비 핀 및 마감 로컬30파일의 drift0과 구분하며, 누락된 B postHTTP를 성공으로 바꾸거나 전후 HTTP exact라고 주장하지 않습니다.

| P의 별도 근거 | SHA256 |
|---|---|
| 동결 source-r2 | `663dfca90cede4018e1940a398919c29ec87fd0dbcb5ca47b9600841a95b1599` |
| 순수22·Noori2 후보 HANDOFF | `aed40eb931cd38163d012f4840a2f3d5d4f97c10982803ec3d2d2b43e638b16b` |
| capabilities getter 가설 종결 | `08aaf3525e7fbda1256de2c331291adbccb2d51ee0bdd51f7632dfce883ac412` |
| 실제 trace-off16 HANDOFF | `f569d0d752043e5f72eabdc9858cd807149afd1f5f5e67ca0a9e32c09d00831a` |
| 해당 저장4 독립 CFB HANDOFF | `4b57dd3fc278063e2aabaf3cee2fb12d9026349a6c4535a7c8ad93cb0abe7e80` |
