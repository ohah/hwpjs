# HWPX 수식 결과 표시의 요청 단위 묶음 조회

게시 범위는 native 묶음 조회와 선택적 JS API입니다. Worker lookup 연결과 기본 WASM 승격은 별도이며 이번 API 게시 범위에 포함하지 않습니다.

## 코어·API 게시 전 분리 검증

main5204c0ab의 깨끗한 /tmp/hwpjs-display-api-publish.J8pYZV에 필요한 native9파일과 JS decoder/adapter·API 회귀만 반영했습니다. 전체 src가 combined-native 고정 tree6da11f0와 같음을 확인했습니다. 이 native tree의 전체 검사는7/7 steps·4157pass/1skip·exit0이며, API4개와 선언 API4개를 같은5f3baacd WASM/기본 구 ABI 대조에서8/8·skip0으로 확인했습니다. native9파일 fmt --check도 통과했습니다. 로컬 chart/수식 엔진 재배치·Worker/페이지 조립·HWP5 zone-count 변경을 포함하지 않습니다. 기존 별도 ReleaseSafe5/5의 산출물을 명시해 검증했고, 사본의 새 경로에서 빌드를 다시 실행했다고 주장하지 않습니다.

## 책임과 수명

formula_result_projection.zig의 prepareSection이 한 요청에서 현재 수식 평가와 원본/현재 텍스트 descriptor를 준비합니다. selectParagraph는 같은 평가에서 문단 segments만 교체합니다. 기존 단일 문단 API도 이 공통 경로를 사용하며 별도의 결과 계산 규칙을 만들지 않습니다. View는 해당 동기 조회 안에서만 살아야 하고 Session 편집/구조 변경을 가로질러 보관하지 않습니다.

formula_result_paragraphs.listPrepared와 formula_result_targets.listPrepared는 기존 문단/소유 범위 규칙을 공유합니다. formula_result_display_snapshot.zig가 후보 문단마다 targets와 text를 모아 owned rows를 반환합니다. 실패 시 준비된 rows/targets/text/view를 모두 정리합니다. 원본·수식 정의·manual override를 수정하거나 세션에 표시 캐시를 넣지 않습니다. 구조/생성 표로 기존 projection을 쓸 수 없는 경우에는 기존과 같은 빈 후보 결과입니다.

optional ABI hwpx_edit_manual_formula_result_display_snapshot(section)는 기존 output_ptr/len/free 수명을 사용하는 JSON 배열입니다. paragraph는 전역1기반이고 text 및 begin_element/start/end targets를 함께 반환합니다. JS는 이를 독립 배열로 복사하고 UTF-16 범위·문단 순서·타입·중복을 확인합니다. 공통 field target 유효성은 hwpx-field-target-wire.mjs의 validateFieldTargets가 소유합니다.

formula-result-display-lookup.mjs는 hwpxDisplay 호출 안에서만 section별 조회를 재사용합니다. 다음 편집·undo/redo·재열기 응답에서는 새 lookup을 생성합니다. 구 ABI는 기존 단일 조회를 그대로 사용합니다. optional 묶음의 LimitExceeded만 기존 bounded 조회로 다시 검사하며 다른 오류는 전파합니다. 이 fallback은 유효성 실패를 성공으로 바꾸거나 원문 일부를 생략하지 않습니다.

## 고정 후보와 검증

19df39f0 기반 격리 폴더 /tmp/hwpjs-formula-display-batch.7GcE7c입니다. ReleaseSafe 제품 빌드5/5·45초·MaxRSS2G, 별도 install/bin/hwpjs.wasm SHA256 a59552befc758e7dfd0b049ad471f941ae0cacfe8c8c0deaed3d3c2e9bd5209d입니다. 기존338개 함수 export는 모두 유지되고 위 snapshot 함수1개만 추가됐습니다.

formula_display_batch_probe의 진입점1개+native 실제 회귀3개가4/4·skip0입니다. 원래 단일 API와 현재 targets/text 대조, manual 편집과 이전 반환값 독립성, 실제 chart, 전체 할당 실패 지점에서 override/source/save 불변을 검사했습니다. 전체 native 검증은 아닙니다.

기존 API native 필터의 첫 시도는 진입점1개만 실행해 회귀 증거가 아니었습니다. probe에서 targets/paragraphs 모듈도 명시적으로 참조한 뒤 기존 UTF-16 target·할당 실패·후보 문단·현재 번호 이동·잘못된 링크·result sites의6회귀+진입점1개가7/7·skip0으로 통과했습니다. 두 실행의 중복 진입점을 서로 다른 테스트로 합산하지 않습니다.

formula-display-batch-api.test.mjs는 wire 반례·실제 chart/참조 문서의 모든 기존 개별 조회와 새 조회 대조·무편집 저장 bytes·구역/인자 오류·undo/redo·구 ABI 거부4/4·skip0입니다. HWPJS_TEST_WASM=위 후보와 HWPJS_BASELINE_WASM=b59f67c7 산출물을 명시했습니다.

formula-display-batch-worker.test.mjs는 요청 수명/aggregate budget fallback/오류 전파, 실제 chart와 issue5543의 전체 Worker 응답 동치·입력/이력/저장/재열기, 추적46경로의 양 경로 전체 내용 대조3/3·skip0입니다(45읽기·암호1거부). 같은 WASM에서 새 optional export의 발견만 끈 대조이므로 서로 다른 binary/줄 간격 파서와 비교한 값이 아닙니다. 본문/JSON 출력 동치이며 모든 문서의 모든 편집/화면 동치는 아닙니다.

## 실제 브라우저 검증 경계

### 픽스쳐 버튼 전체 열기의 전후 대조

같은 격리 화면 소스/6104126bytes fixture/loopback58885에서 b59f67c7과a59552be WASM만 바꿔 직렬 측정했습니다. 실제 trusted 픽스쳐 선택→메인 load 응답 이후 두 RAF는2683.7ms→1683.1ms, Worker post→reply는2544.2ms→1545.1ms였습니다. fixture resource는20.4/16.0ms, reply→두 RAF는113.5/116.6ms입니다. 양쪽 모두 실제5쪽·그림6/6·같은 정렬 간격6줄/도형 넘침1줄 경고였습니다. 기본 제품/별도 문단 분기 수정이 섞인 산출물을 대조한 값이 아닙니다.

HAR 폴더 hwpjs-fixture-profile-7wjV2r 및 -vWsgoU, 소유 브라우저 inactive 및 전용 서버 종료를 확인했습니다. UI가 아닌 native Worker 단독 수치를 전체 열기 시간처럼 설명했던 한계를 보완하는 실제 버튼 경로입니다. 단건/같은 서버 Mac·두 RAF 관측이며 사용자 WAN·GPU paint·모든 이미지 완료·일반 개선율 보장은 아닙니다. 초기 페이지 진입/모듈 준비는 버튼 이전이라 별도입니다. 기본 데모 WASM은 아직 교체하지 않았습니다.

동일 a59552be 후보의 captioned-picture-browser-audit는 실제 Canvas 포인터·한글/emoji 입력·undo/redo·다운로드·독립 전체 XML/ZIP oracle(normal/-O 및 잘못된 marker 거부)·재업로드를 통과했습니다. 산출 폴더는 hwpjs-caption-canvas-dbvlNL, 저장 SHA256은 c52f341a5fbd58ea4d6db7e716138fa2888fdbcec45e072fad0db13ba1b45fad입니다. 이미지6개 모두 해독됐고 소유 브라우저 inactive 및 서버 종료를 확인했습니다. 실제 화면은5쪽이며 미지원 정렬/간격5줄과 drawing text overflow1줄이 남아 있어 원본 조판 동치 증거가 아닙니다.

manual-result-browser-audit의 첫 시도는 편집 전에 fixture HTTP404로 실패했습니다. 격리 archive의 reference 심볼릭 링크가 서버의 realpath 동일성 검사에 걸렸습니다. 서버의 안전 검사는 완화하지 않았으며 해당 실제 파일을 격리 경로에 복사해 재검증합니다. 실패 실행도 소유 브라우저/서버를 종료했으며 수식 입력 성공으로 계산하지 않습니다.

픽스쳐를 실제 경로에 복사한 재실행은 종료0으로 통과했습니다. hwpjs-manual-browser-UlcsPg에서 실제 수식 결과의 Canvas 입력·메뉴 U/R/S·독립 전체 XML/ZIP·다운로드·재업로드를 검증했습니다. 저장 SHA256은 a4bb9414f8d5cc90e17030cd1b0600d57e8f12a6203558e3bed460561153dcf3입니다. fixture fetch 취소·같은 파일 재열기·픽스쳐 선택도 통과했고 close 응답 경합 뒤 inactive를 재확인했으며 소유 서버도 종료했습니다. 이 검사는 한 실제 결과의 수동 편집 왕복이며 모든 수식 재계산/모든 결과/조판 동치를 뜻하지 않습니다.

## 추가 적대적 검증

native에는 앞선 구역 편집에 따른 문단 번호 이동을 모사하는 회귀를 추가했습니다. source XML은 그대로 두고 현재 번호만7만큼 이동시킨 후 새 묶음 결과와 기존 단일 조회의 문단 번호·targets·text를 대조했습니다. 실제 앞선 구역 삽입 UI 검사는 아닙니다. 필터 재실행은 진입점1개+실제4회귀로5/5·skip0이며 할당 실패 sweep과 chart도 다시 통과했습니다. 추가분은 test 코드뿐이고 앞서 고정한 WASM의 제품 경로를 변경하지 않습니다.

Worker 검사에 같은 문단 번호를 쓰는 구역별 독립성, 빈 결과 재사용, 구역별 LimitExceeded 격리, 다른 오류의 전파와 다음 호출 재시도, 중복 문단 거부, ABI 함수 부재를 추가했습니다. 새 반례를 포함한 전체 파일 재실행은4/4·skip0·38.9초입니다. 실제 편집/이력 대조와 추적46경로(45읽기·암호1거부)의 전체 응답 비교도 다시 통과했습니다. 같은 a59552be 후보를 사용했고 기본 제품 산출물은 바꾸지 않았습니다.

## 성능 관측

최초 API 대조에서 chart13문단의 기존637ms→묶음24ms, issue5543의14문단은1079ms→37ms였습니다. 전체 Worker는 최초1286→660ms와2550→1476ms였습니다.

후속은 순서를 바꿔 다시 검사했습니다. chart는 기존1276/1220ms·묶음624/618ms, issue5543은 기존2499/2520ms·묶음1467/1481ms입니다. 따뜻한 Node 프로세스의 단건 관측으로, 외부망·최초 module import·Canvas·글꼴·이미지 해독이나 일반적인 개선율 보장은 아닙니다. 원본 데이터/편집 권한을 덜 조회해 얻은 수치가 아니며 전체 응답 동치를 함께 단언합니다.

게시된 worker-load-profile 도구의 추가 실측은1522ms이며 새 display_snapshot1회38ms를 확인했습니다. Worker 파일 SHA256 7d7bde7712a2b60ea6255c26b553205284427ea88b3332ba8eb197c6f1f3daed·source 불변을 확인했습니다. 다음 남은 비용은 character_ranges251회354ms 등이며 이것도 해결된 것으로 세지 않습니다.

구역 확장 비영 값의 의미가 미확정인 software.hwp의 페이지 지원 문제와 이 최적화는 별개입니다. 그 값을 무시하는 프로필은 추가하지 않았습니다. 기존 문단 switch 후보의 전체 native 작업이 별도 격리 폴더에서 실행 중이며 이 batch 후보 검증으로 소급하지 않습니다.

## 문단 서식 후보와의 결합 검증

별도 combined-install/bin/hwpjs.wasm에 문단 선택 분기 native3파일과 이 수식 묶음을 함께 빌드했습니다. ReleaseSafe5/5·46초·MaxRSS2G, SHA256 50062ce8af5ff350f708b928e0b395b2efda97bc95f82f2d50ab43e9e553d9be입니다. 기존 a59552be 및 기본 제품 파일은 교체하지 않았습니다.

동일 결합 산출물로 paragraph-selected-display, formula-display-batch-api/worker, drawing-wrap-body-flow, table-paragraph-paper-bounds, page-area-body-composition 여섯 파일을 직렬 실행해23/23·skip0·46.6초를 통과했습니다. 독립 header XML의146/73서식, 원본 저장 bytes, 편집/이력/재열기, 추적46경로의 양 수식 조회 응답 동치(45읽기·암호1거부), 표 원본 offset/셀 폭과 실제 paper bounds를 재검사했습니다. 결합 후보의 전체 native/실제 브라우저/제품 배포 완료를 뜻하지 않습니다. 앞선 브라우저 검증은 별도 a59552be 산출물의 근거로 유지합니다.

## 결합 후보 실제 브라우저

결합 후보의 실제 Chromium 검사도 두 경로를 직렬 실행해 통과했습니다. captioned-picture-browser-audit 산출 hwpjs-caption-canvas-zITF5Q에서 Canvas 포인터·prefix·이력·독립 저장·재업로드, 실제5쪽·그림6/6을 확인했습니다. 정렬 간격 미지원5줄·도형 텍스트 넘침1줄은 남습니다. manual-result-browser-audit 산출 hwpjs-manual-browser-tF5w6J도 수식 결과 실제 입력·메뉴 이력·독립 XML/ZIP·재업로드와 fixture 취소/재선택을 통과했습니다. 각 저장 hash는 앞선 개별 후보와 같은 c52f341a… 및 a4bb9414…입니다. 두 검사 모두 소유 브라우저 inactive와 서버 종료를 확인했습니다. 전체 native/제품 승격 완료와 원본 조판 동치는 여전히 별도입니다.

## 실행 명령

nice -n 10 mise exec -- zig test src/formula_display_batch_probe.zig -O ReleaseSafe --test-filter 'formula display batch'
HWPJS_TEST_WASM=/absolute/batch.wasm HWPJS_BASELINE_WASM=/absolute/old.wasm node --test tests/hwpx/formula-display-batch-api.test.mjs
HWPJS_TEST_WASM=/absolute/batch.wasm node --test tests/hwpx/formula-display-batch-worker.test.mjs

원본 inventory를 읽는 마지막 검사는 Git checkout에서 실행합니다. 격리 archive에서는 정확한 GIT_DIR/GIT_WORK_TREE를 별도로 지정하며 기본 사용자 index는 수정하지 않습니다.
