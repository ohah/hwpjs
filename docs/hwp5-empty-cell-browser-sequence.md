# 빈 셀 문단의 연속 Canvas 편집 왕복

## 실행과 책임

`HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/hwp5-reference-browser-audit.mjs --case=empty-cell --cell-sequence=all --port=58894`로 실행합니다. 명시적 CFB 보정 동의와 전체 부재 table zone count의 typed 조회를 지원하는 후보가 필요합니다. 현재 기본30434b54는 이 조회 수정 전이므로 같은 결과를 지원한다고 주장하지 않습니다.

원본253E164F57A1BC6934-empty.hwp에는 표2개·각1셀과 빈 셀 문단1/2/3/5가 있습니다. 문단1의 단일 왕복 뒤 같은 세션에서2/3/5를 실제 Canvas 포인터로 선택하고 서로 다른 한글·이모지 표식을 입력합니다. 빈 문단 위치·hit-test·text hover·신뢰된 pointerdown/beforeinput/input을 확인하며 textarea 값을 강제로 바꾸지 않습니다.

포인터 좌표 계산은 `hwp5-blank-cell-pointer.mjs`, 연속 편집/단계별 독립 검사는 `hwp5-blank-cell-sequence.mjs`, 서버·브라우저 수명과 전체 재열기는 기존 audit가 소유합니다. 이들은 제품 문서 모델이나 별도 편집 캐시를 추가하지 않습니다. 모든 단계에서 undo/redo, 직전 저장본과 새 저장본의 독립 전체 Section/비대상 stream/CFB metadata 비교·잘못된 표식 음성 대조·새 native editor의 누적 값/표 조회를 검사합니다. 마지막 저장본은 브라우저 재업로드 후 네 문단 값을 확인하고 편집 시작·검색으로 첫 문단의 실제 선택 대상을 확인합니다.

## 실측 (2026-10-20)

통합 후보8aeb8f4d6bbf1692ece828ba22dd7d517ad345a24b1a588465f2ffcee0c74355와 작업 트리 UI에서7CSYT6·DwD7KE 두 실행이 성공했습니다. 후자는 단계별 화면과 재열기 후 첫 문단 선택을 추가한 실행입니다. xHgZiz는 confirm 표시 후 DOM 조회를 시도한 도구 오류로 실패했으며 성공으로 세지 않습니다. 보정 동의 필요 여부를 클릭 전에 읽도록 고쳤고 모든 실행의 소유 브라우저와 전용 서버를 종료했습니다.

main44063986에서 이번 audit/두 helper/빈 셀 case/인자 회귀만 분리한 `/tmp/hwpjs-empty-sequence-publish.RmFRBC`에서도 같은 후보로 성공했습니다. 관측 폴더 suffix는hwpjs-reference-browser-VM70LV이며 최종 저장 SHA256은9f10839b2d580b3ff467e21ab2e2e346b4e6c745a462b0e3e6a413c908ccd632로 두 작업 트리 성공 실행과 같습니다. browserClosed/serverExited/success 모두true·exit0입니다. 인자 검사2/2는 잘못된 조합이 후보 읽기/브라우저 시작 전에 거부됨을 확인합니다.

단일 파일의 네 빈 문단에 대한 순차 삽입·이력·저장 왕복입니다. 임의 범위/모든 명령·전체 픽스쳐·원본 한글 조판 동치나 기본 데모 승격을 증명하지 않습니다. DocInfo 전용 사례와 관련 제품 API의 미게시 변경은 이번 도구 게시 범위에서 제외했습니다.
