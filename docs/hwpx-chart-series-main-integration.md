# 차트 계열 이름 편집의 main 기반 통합 후보

## 계약

직접 계열 이름 `c:ser/c:tx/c:v`는 캐시 포인트가 아니다. 전용 `chart_text` ordinal과 `chart_series_text` 이력 명령을 사용한다. native `chart_resources`의 optional `series_text`가 현재값을 소유하며 기존 포인트·공유 별칭·checkpoint·XML/OLE 저장 경로를 재사용한다. 조회 결과나 UI 초안은 저장 SSOT가 아니다.

`chartSeriesText(section, wrapper)`는 `{kind:"direct_series", values:[{series_node,text_node,value_node,text}]}`를 반환한다. `setChartSeriesText(section, wrapper, ordinal, text)`는 배열 순서의 ordinal을 사용한다. 세 export(조회·변경·UTF8 바이트 한도)가 없는 환경에서는 지원을 합성하지 않는다. 문자열 응답의 노드 순서·중복 leaf·유효 Unicode는 별도 JS decoder가 검증한다.

## 2026-10-18 실측

- 포인트 통합 후보에서 계열 이름 API를 연결한 ReleaseSafe WASM SHA256: `891fe0a1cb560083251ac50130505dc2dabac57f6ebeaf37f90bc226e76a676a`.
- 기존 기본 WASM의 311 export 이름·종류를 모두 유지한다. 새 후보는 327개다. signature·전체 API 동작 동일성 검사를 대체하지 않는다.
- native Debug·ReleaseSafe 각각 집중검사 7개 통과, skip 0. 작은 strict 공유 입력의 open→History 변경→save→undo/save→redo/save 전체 할당 실패 주입은 모드별 성공 포함 callback 4,603회다. 실제 10개 이름 모두의 전체 OOM을 의미하지 않는다.
- 공개 API·응답/optional ABI·UTF8 한도·공유 XML/OLE 사본 검사 21개 통과, skip 0. 실제 issue6037 이름 10개의 빈 값·Unicode·제어 문자·literal escape 변경, 독립 Python 일반/-O XML/ZIP/OLE 대조, 잘못된 기대값 거부, 저장·재열기·undo/redo를 검사했다.
- 공유 이름 검사에서 shared_xml/shared_ole/chain 세 경우가 통과해 앞선 포인트 전용 후보의 API 부재 실패를 해소했다. 이는 원래 파일에 해당 공유 구조가 있었다는 뜻이 아니며 원본에서 파생한 적대적 입력이다.
- 기존 기본 WASM과 28차트 문서의 본문 입력 28회·포인트 편집 56회 전후 및 undo/redo의 전체 chart query packet이 일치했다.
- 같은 후보의 확대 재검사도 숫자 289포인트·문자열 297포인트·직접 이름 10개와 공유/경계 사례를 포함해 53개 통과, fail/skip 0이다. 실행 시간 132,188.58ms이며 원본 포인트 개수와 테스트 선언 수를 혼용하지 않는다.

## 후속 분리 빌드와 native 의존 검사

main `601e0091` 기반 트리 `764aee5c68e10f05bcd32d6335398d269b9643e4`의 ReleaseSafe 제품 빌드는 5/5 단계 통과했다. WASM SHA256은 `43395302660c8b0ee2178b6b894ebe840dce2fec8802d6822eabe3631e9d0b02`이며 이전 후보 327 export의 이름·종류를 유지한다. [혼합 현재값 검사](hwpx-chart-mixed-current-values.md)에서 계열·숫자·문자열의 상호 보존과 이력을 별도 검사한다.

이 새 빌드에서도 숫자/문자열/직접 계열·공유 표현·경계 공개 회귀 53/53·실패/skip 0(130,946.67ms)을 확인했다. 같은 소스의 별도 HWP5 controlled text splice native 검사도 9/9·실패/skip/누수 0이다. 분리 서버 사본에 web 파일이 없었던 첫 UI 재검사는 module-not-found로 실패했으며 제품 실패로 세지 않는다. web 원본 준비 뒤 UI 재검사는 26/26·실패/skip 0(7,393.58ms)으로 종료했다. 실제 브라우저 재검사는 아니다.

같은 트리의 mixed character property shard 바이너리 SHA256은 `d6adf3d51b31d2812e2a52525ba47cba67a02f19e57f4ca617f84f195aaf3677`이다. 명령 할당량을 56,666회로 새로 측정했으며 root 포함 측정 2/2 통과했다. 단일 프로세스별 실패 지점 0 및 56,665의 rollback과 56,666의 정상 완료를 확인했다. 잘못된 빈 범위·둘 이상 지점·끝 환경변수 부재는 각각 기대 오류로 exit1이며 누수 진단은 없었다. 이는 중간 1..56,665 전체 sweep 완료가 아니다. 기본 전체 검사에서 해당 선언의 skip을 통과로 바꾸지 않는다.

## 미완료와 실행 경계

전체 검사 중 발견한 [수식 저장 테스트 계약](hwpx-formula-save-test-contract.md)의 SUM·AVG 기대값과 테스트 버퍼 해제 수정은 별도 후보로 검증했다. 제품 차트 코드의 실패로 합치거나 수정 전 전체 실행을 통과로 변경하지 않는다.

현재 후보의 전체 native gate는 완료 확인이 필요하다. 표준 단일 프로세스 실행은 자원 문제로 중단했고 동일 바이너리의 테스트별 자원 감시 실행을 이어간다. Worker·계열 이름 폼·이번 후보의 실제 Chromium 연결 결과는 [UI 통합 기록](hwpx-chart-ui-main-integration.md)이 소유한다. 과거 다른 소스 후보의 브라우저 결과와 혼용하지 않는다. 기본 WASM·외부 데모도 교체하지 않았다. rich-text·차트 전체 조판·실제 한글과의 픽셀 동일성 완료를 뜻하지 않는다.

1GiB 감시의 최초 실행은 2,531개 완료 뒤 structural formula exterior allocation failure 검사에서 current/peak 1,103,070,360bytes로 중단됐다. 그 전에 underline batch의 전체 44,929 실패 지점은 완료했다. 후속 같은 바이너리의 범위 재개에서도 index2565·2569·2572의 진단 메모리 한도 초과를 기록했으며 지우지 않는다. guardian 값은 제품 명세의 메모리 제한이 아니다. 같은 바이너리의 2531..4077을 단일 native 프로세스씩 4GiB 감시한 별도 실행도 38개 완료 뒤 index2569에서 current/peak4,345,810,376bytes로 중단·exit1 종료했다. index2531·2565는 이 범위에서 통과했지만 이를 1GiB 통과나 전체 gate 완료로 표시하지 않는다. 한도를 더 올리지 않고 수정 후 전체 inventory 바이너리로 선택 재검사를 준비한다.

structural exterior와 split coordinates는 기존 공통 allocation_failures helper로 원래 전체 OOM·모델·ZIP·읽기 전용 단언을 유지했다. installed split plan은 작업 트리에 있던 첫 두 검사의 checked_allocator wrapper를 검토해 채택하고 세 번째 검사에도 적용했다. 제품 parser/writer는 수정하지 않는다. filtered structural 검사 2/2·관측 peak17,449,296bytes, structural+좌표/실제 chart 묶음 4/4·peak387,531,376bytes, installed 세 검사 묶음 4/4·peak8,110,392bytes가 각각 실패/skip/로그/누수0·guardStopped=false로 종료했다. 이들은 작은 filtered 바이너리이므로 이전 전체 바이너리와의 메모리 차이를 allocator 변경만의 인과로 확정하지 않는다. 전체 inventory 바이너리를 새로 빌드해 같은 인덱스를 재확인해야 한다.

후속 전체 바이너리 `9fda8718e6480ef787c40200239fc741907792de337c7bb0e0c30604b383c274`와 원래 `4b2cab406eba17fb26841e89ed1c038c885177b74b43e27b3949ca3395c08ac9`의 서버 metadata 4,077개 이름·순서를 deep equality로 확인했다. 새 전체 바이너리의 2531..2572는 41/41·실패/skip/로그/누수0·exit0·관측 peak533,873,408bytes로 1GiB 안에서 종료했다. 따라서 앞선 세 테스트는 작은 바이너리에서만 통과한 것이 아니다. 전체 4,077개의 완료는 아니며 범위 도구도 range-complete/fullInventoryCovered=false를 보고했다.

같은 기준의 styled formula public split/remerge 및 실제 header 색·언어 글꼴 검사 5/5도 filtered 바이너리 `f8df6319f4e0ebadb74ee7e39ca28a2052047ad925b9709a03be03a5b4262adc`에서 실패/skip/로그/누수0·peak7,012,688bytes로 종료했다. 기존 작업 트리의 단순 wrapper는 역변환하면 HEAD의 검사 본문과 바이트 단위로 같음을 확인해 채택했으며, 첫 remerge에도 동일 wrapper만 추가했다. 제품 함수·검사 데이터·단언을 함께 승인한 것이 아니다. 이후 전체 바이너리/정규 gate 검증은 계속 필요하다.

재현: `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/chart-series-text-editor.test.mjs tests/hwpx/chart-series-text-wire.test.mjs tests/hwpx/chart-series-text-boundary.test.mjs tests/hwpx/chart-shared-representation.test.mjs`. native는 `zig test src/root.zig -O ReleaseSafe --test-filter 'direct chart series text' --test-filter 'series string Session' --test-filter 'series transaction'`이며 Debug도 같은 필터다. reference가 없는 사례는 명시적으로 skip한다.
