# 게시 WASM의 구간 편집 검증

## 2026-10-15 긴 문서 후보 검증

cb5d1b87 후보(SHA256 `cb5d1b87a04768990c19481ad007c20517ee80e02ed44978989b7dd966617349`)의 실제 ZIP/HWPX `reference/rhwp/samples/hwp3-sample10-hwpx.hwpx`는26939문단입니다. 파일명은 변환 이력이며 HWP3 signature를 검사한 것이 아닙니다. 기본 표시가 limited=true인 상태에서 마지막26939번째 문단을 set-edit-window로 열어 Canvas 입력·현재 구간 검색·저장·독립 전체 XML/ZIP(Python 일반/-O)·undo 원문 byte-exact·redo 저장본 byte-exact·재열기 후 같은 구간/문자열을 확인했습니다. 최초 현재 작업 트리 검사1/1·skip0·exit0은148798.756208ms입니다(handle49307). 문서 전체 검색은 현재 미구현이며 이 구간 검색 통과로 대체하지 않습니다.

분리 게시 JS(현재 controller와 cmp 일치)에 같은 테스트를 적용한 단계 계측 실행도1/1·skip0·exit0입니다(handle27167,148251.537417ms). 잘못된 prefix 기대는 일반/-O 모두 complete XML mismatch로 거부하고 원본 파일 byte-exact 불변도 확인했습니다. 원본 reference 경로는 읽기 전용 공유 링크이며 기본 WASM을 교체하지 않았습니다. Node26.7.0의 동시 부하가 있는 단일 실행으로,현재 작업 트리 Node24 실행과 성능 개선율을 비교하지 않습니다.

| 단계 | Worker/renderer 포함 시간(ms) |
| --- | ---: |
| load | 24713.55 |
| enable | 20123.04 |
| 마지막 구간 이동 | 9782.26 |
| 입력 반영 | 11419.07 |
| 편집본 저장 | 551.99 |
| 저장본 reopen | 23073.30 |
| reenable | 20060.78 |

위 단계 합은 oracle·별도 저장 대조·undo/redo 등 전체 검사 시간을 모두 포함하지 않습니다. 순수 native getter benchmark가 아니며,구간 이동/입력의 초 단위 비용은 아직 남아 있습니다.

실행 중 프로세스만 지정한270.33ms CPU 프로파일에서 attachHwpxStyles→characterRanges→hwpx_edit_character_ranges→character_style_formula_snapshot.read 및 mem.eql/xml.text.View.equals 경로를 확인했습니다. 해당 read는 요청 문단의 FORMULA 존재 여부를 확인하려고 구역 전체 elements를 순회하고 가까운 문단 조상을 찾습니다. 샘플은 반복된 전체 구역 순회의 비용을 줄일 조사 근거이며 전체 지연을 이 함수 하나로 단정하거나 최적화를 이미 적용했다고 기록하지 않습니다. 이전 macOS sample의 해석 불가 WASM frame도 별도 근거입니다. 테스트 프로세스는 정상 종료했고 일시적으로 연 inspector9229 listener도 남지 않았습니다. 새 브라우저/디바이스는 실행하지 않았습니다.

DOM/측정은 기존 harness 대역입니다. 실제 브라우저·글꼴·원본 페이지 동치·모든 문단 전수 편집·문서 전체 검색 완료의 증거로 확대하지 않습니다.

## 후속 도형 조회 조사

요청 내 native 일괄 소유 조회의 책임과 연결 전 제한은 [사각형 소유 위치 일괄 조회](hwpx-rectangle-host-batch.md)를 따릅니다.

2026-10-11 기본c196919b 산출물로 행정업무 편람 section11의 rect node74/100을 직접 조회했습니다. `rectangleRenderingSource`는43.56/39.95ms, `drawingTextSnapshot`은40.12/39.55ms였으며 두 노드 모두 현재 host paragraph8589·anchor0입니다. 사각형 소유 조회의 anchor_node는42입니다. 단일 실행/동시 부하 측정이며 전체 Worker 시간으로 확대하지 않습니다.

현재 `reader-worker`는 drawing text snapshot을 먼저 부착하고 page settings 단계에서 같은 사각형의 rendering source를 다시 조회합니다. 양쪽 native 경로는 `rectangle_display_host.read`를 호출하며 이 함수는 매번 `display_current_paragraphs.read`로 구역의 현재 문단 목록을 구성합니다. 후속 일괄 조회에서 요청 내 문단 view 공유를 검토할 근거이며, 아직 구현·절감 실측은 없습니다. 텍스트 없는 사각형·그룹 소유·anchor_node와 오류 진단을 보존해야 하므로 텍스트 snapshot으로 사각형 조회를 단순 대체하지 않습니다. 장기 revision 캐시의 정합성을 검증한 결과도 아닙니다.

2026-10-11 고정 WASM SHA256 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`로 다음3파일을 실제 실행했습니다:

```sh
HWPJS_TEST_WASM=/absolute/fixed/hwpjs.wasm node --test tests/hwpx/large-edit-window-canvas.test.mjs tests/hwpx/edit-window-canvas-input.test.mjs tests/hwpx/window-worker.test.mjs
```

최종4/4·fail/skip/cancel/todo0·exit0,380891.138083ms입니다. 대형 행정업무 편람의 후반 문단8853(Worker0기반/section11)을 구간 표시하고 현재 텍스트116코드 유닛·plainEditable·Renderer 행·Canvas 선택을 확인했습니다. 실제 native 입력 후 원본 ZIP/XML을 Python 일반/최적화 모드로 대조했고 저장·undo 원문 byte-exact·redo 저장본 byte-exact를 확인했습니다. 대형 표본 검사 자체의380771.289708ms는 load/enable/구간 조립/입력/저장/oracle/이력을 모두 포함하며 순수 입력 지연이 아닙니다.

작은 실제 charshape.hwpx는 잘못된 구간 이동에서 선택·원문을 보존하고, 성공 이동에서 오래된 선택을 정리하는 경계를 확인했습니다. sparse 구간 입력의 원래 문단 좌표·독립 XML·이력도 검사했습니다. Worker의 읽기 전용/편집 구간 차이·잘못된 요청·입력/분할/병합/활성 구간/전체 복원·revision 및 저장 불변을 함께 확인했습니다. 구간 표시 성공만으로 편집 권한을 부여하지 않습니다.

`tests/canvas/worker-harness.mjs`는 실제 Worker/WASM/Renderer/controller를 연결하지만 DOM·측정/그리기 이벤트는 대역입니다. 실제 브라우저 후반 탐색·포커스/IME·글꼴·원본 조판 및 모든 임의 구간/객체 관계의 증거로 확대하지 않습니다. 기본 WASM·원본 파일·실행 중 관련 소스는 변경하지 않았습니다.

게시88ea9d74 Git archive의 별도 `/tmp/hwpjs-published-window-tests.jLjX0F`에서 작은 실제 구간/Worker2파일도 다시 실행했습니다. 고정fe97 WASM으로3/3·fail/skip0·exit0,1641.042209ms입니다. 미커밋 JS/검사 helper 없이 게시된 의존성으로 실행한 증거이며, 대형 reference 원본은 Git archive에 포함되지 않아 이 clean 검사에서 재실행하지 않았습니다. 대형4/4 결과와 이3/3을 누적 완료 수로 합치지 않습니다.

## 독립 검사기와 지연 조사 경계

후속 실제 Worker 계측과 요청 내 취소선 색인 최적화의 원인·후보·비교는 [취소선 snapshot 색인](hwpx-strike-snapshot-index.md)이 소유합니다. 아래 개별 getter 관측만으로 전체 지연 원인을 확정하지 않았습니다.

`tools/hwpx-plain-splice-oracle.py --self-test`와 Python `-O`의 같은 실행은 정상 삽입과13변조 반례를 모두 확인했습니다. 전체 XML/비대상 ZIP payload/metadata·UTF-16 경계·원문 run 스타일·no-op 보존을 검사하며 제품 파서를 import하지 않습니다.

지연 조사용 별도 읽기 전용 public API 측정에서 파일 open2376.37ms, section11의707문단 snapshot43.30ms, neighbors39.88ms, 문단8854(native1기반) 적격성0.337ms·텍스트0.977ms, table bindings697개46.44ms·placement1개44.65ms였습니다. 별도 실행의 character shapes937개481.76ms, 해당 문단 ranges1.418ms, drawing bindings2개40.16ms였습니다. history 활성화 후 단일 조회도 적격성0.376ms·텍스트1.496ms·ranges0.754ms였습니다. 동시 실행 부하가 있는 일회성 관측이며 순수 benchmark나 전체 Worker 지연의 원인 확정이 아닙니다. 실행 중 Node의 샘플 `/tmp/hwpjs-large-window-current-20261011.sample.txt`는 주로 이름을 해석할 수 없는 WASM frame이어서 특정 함수 병목으로 단정하지 않았습니다. 성능 개선은 단계별 전체 재투영 비용을 더 측정한 뒤 진행해야 합니다.
