# 원본 셀의 테두리·채우기 배치

## 소유권과 입력

HWP5와 HWPX의 원본 셀을 대상으로 합니다. 생성한 표, 불완전한 원본 표, 보호된 셀, 병합 셀 중간을 자르는 범위는 지원 대상으로 추정하지 않습니다. UI 관측값은 선택 권위를 발급하지 않습니다. 대화상자와 공식 UI 비교는 [표 대화상자 관측](table-dialog-reference.md)이 소유합니다.

`js/table-cell-region.mjs`가 원본 셀 소유자·직사각형 범위·병합 경계를 검증합니다. 테두리와 배경은 이 기하 검증을 공유합니다. 행×열 격자를 만들지 않고 경계 끝점을 Map으로 상쇄해 검증하며, 예상 시간은 관측 셀 N과 선택 셀 M에 대해 O(N+M)입니다. 한 요청의 서로 다른 셀 한도는 4096입니다. Native 한도는 `src/model/cell_edit_budget.zig`, JS는 기존 배치 한도 상수를 공유합니다.

`cell-styles`는 `{kind, borders, fills}` 메시지입니다. 각 행은 `section`, `tableNode`, `listNode`로 원본 셀을 지목합니다. 테두리는 `edges`와 변경한 `style`·`width`·`color`만 전달합니다. 생략과 명시적인 NONE·검정은 다릅니다. 두 배열에서 같은 셀을 지정하면 tableNode도 같아야 하며, 동일 배열의 중복 셀은 거부합니다.

채우기는 아래 네 종류입니다. 색은 RGB24 정수입니다.

| kind   | 필드                                                            |
| ------ | --------------------------------------------------------------- |
| none   | 없음                                                            |
| solid  | color                                                           |
| hatch  | face, hatch, style                                              |
| linear | colors 두 색, angle 0–359, centerX/Y·step·stepCenter 각각 0–100 |

Hatch 이름은 HORIZONTAL·VERTICAL·BACK_SLASH·SLASH·CROSS·CROSS_DIAGONAL입니다. 이 공통 enum의 순번은 HWP5 원시 코드와 다릅니다. 실제 공식 출력으로 확인한 원시 매핑은 [표 대화상자 관측](table-dialog-reference.md)에 기록합니다. 변환은 Native `border_fill_patch.zig`, JS 관측·표 렌더링은 `hwp5-hatch-style.mjs`가 각각 소유합니다.

## 원자 변경과 수명

테두리 wire는 32바이트 little-endian이며 소유자3개·edges·presence mask·style·width·color 순입니다. presence mask는 style=1, width=2, color=4이고 생략한 슬롯은 0이어야 합니다. 채우기 wire는 48바이트로 소유자3개·종류·payload8개입니다. 예약 슬롯은 반드시 0입니다. 숫자 범위 검사 후 작은 enum으로 변환합니다.

`cell_style_batch.zig`는 두 wire 배열을 소유자 Map으로 병합한 뒤 포맷별 `h5cell_style_batch.zig` 또는 `hxcell_style_batch.zig`를 한 번 호출합니다. 테두리와 배경은 하나의 정규 변경값과 하나의 이력 명령을 사용합니다. 셀마다 setter를 반복하는 구조가 아닙니다. 입력 버퍼는 동기 호출 중에만 빌리고, 세션·체크포인트는 복사한 scalar 값을 소유합니다. 마지막 셀 검증이나 할당이 실패하면 이전 셀까지 게시하지 않습니다. no-op는 redo를 지우지 않습니다.

현재 모양 조회는 원본 리소스 ID에 대기 편집값을 반영한 Native 결과를 사용합니다. 누락·없음·알려진 값·지원 불가를 구별합니다. 읽기와 폼 초기화는 변경 의도를 만들지 않습니다. 색만 바꾸면 서로 다른 기존 선 종류·굵기를 덮어쓰지 않습니다. 단색의 생략된 무늬 색은 현재 편집값을 먼저 보존하고, 원본 리소스는 그 다음 fallback입니다.

## 검증과 제한

집중 검사는 `h5cell_fill_batch_probe.zig`, `hxcell_fill_batch_probe.zig`, `cell_style_wire_probe.zig`와 `tests/cell-fill-command.test.mjs`입니다. 실제 Noori HWP5/HWPX의 JS setter·독립 CFB/XML 저장 해석·재열기·이력 검사는 `tests/cell-style-fill-native.test.mjs`입니다. 실제 WASM 절대경로와 SHA, 허용된 두 Noori 경로를 환경변수로 명시해야 하며 오래된 WASM으로 대체하지 않습니다.

2026-11-06 후보의 기본 집중 검사는 HWP5 기본 12개, HWPX 12개, wire 12개가 각각 통과했습니다. 추가 연속 편집 반례에서 원본 채우기 없음 → 무늬 → 단색의 무늬 색 보존 오류를 독립 CFB로 재현했으며, 수정 후 이 반례를 포함한 HWP5 집중 검사 13개가 통과했습니다. 이 13개에 앞선 12개를 다시 합산하지 않습니다. JS wire/기하 16개, 관측 91개, 대화상자 port/view/tool 65개, HWP5 표 채우기 plan 37개가 통과했습니다. 수정한 최종 WASM `aa4161ae…bf122`에서 실제 Noori 두 포맷의 저장·재열기·이력 검사 17개도 Node 24.20.0으로 통과했으며, 단색 전환 시 무늬 색 보존과 실제 Native 조회 결과를 표 painter에 연결한 검사가 포함됩니다. Native·소스·브라우저·공개 배포는 서로 다른 증거이며 이 수치를 중복 합산하지 않습니다. 원시 성공·실패 기록은 ignored `zig-out/verification/table-fill-r1/`에 보존합니다.

이미지 채우기·대각선 테두리 편집·Canvas 드래그 다중 셀 선택은 아직 지원하지 않습니다. 알 수 없는 채우기 비트, 이미지·복합 채우기, 미해석 꼬리를 정상 단색으로 바꿔 저장하지 않습니다. 표의 무늬·선형 그라데이션은 기존 Canvas painter를 공유하지만 원본 한글의 픽셀 동치와 중심 좌표에 따른 전체 그라데이션 조판은 검증되지 않았습니다. 현재 공식 셀 배경 창에서 그라데이션 입력을 관측하지 못했으므로 제품의 추가 기능으로 표시합니다.

제품 브라우저 후보에서는 Noori 두 포맷의 통합 테두리·배경 적용과 표 전체 무늬·선형·없음 채우기 총 8개 시나리오를 통과했습니다. 실제 Canvas pattern 색·gradient stops, 한 번의 실행 취소, 두 저장 다운로드와 적용 후 창 유지·탭·변경 없는 확인을 검사했습니다. 관측 폭574px, 가시 label/control 겹침0이며 선형 입력 시 높이는 약450px입니다. 브라우저는 active=false/pid=null로 닫혔습니다. wrapper의 즉시 검사에서 남았던 보조 PID2개는 원래 종료 결과를 보존하고 별도 후속 조회로 모두 종료됐음을 확인했습니다. 이 결과는 공식 한글의 전체 픽셀 동치 또는 다른 viewport 완료를 의미하지 않습니다.
