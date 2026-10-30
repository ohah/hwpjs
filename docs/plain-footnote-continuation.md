# 단일단 plain 각주의 연속 페이지

표를 포함한 별도 경로와 공통 계획기의 경계는 [혼합 각주 계약](mixed-footnote-continuation.md)을 따릅니다.

`plain-footnote-continuation.mjs`는 전체 각주 높이가 빈 페이지를 넘는 HWP5 단일 구역·단일단 plain 경로에서만 측정된 행을 분할하고 본문 하단을 예약합니다. 짧은 각주의 기존 예약 경로는 유지합니다. 실제 제품 승격 전 격리 검증한 구현이며 운영 SDK·서버를 변경하지 않았습니다.

## 계약과 한계

참조 판정은 일반 예약기와 `footnote-reference-rows.mjs`의 기존 text-row predicate를 공유합니다. Native 본문 참조·현재 문단·source offset을 다시 발급하거나 저장 모델을 변경하지 않습니다. 본문과 각주가 같은 페이지를 소유하는지 확인하고, 각주 내용을 완전한 행으로 다음 페이지에 넘깁니다. 첫 행이 들어가지 않는 경우는 다음 페이지에서 시작할 수 있습니다. 표·그림·별도 객체·다단·불명 기하를 plain으로 가장하지 않습니다. 기존 미주 흐름은 본문 흐름에 유지하며 미주 구분선과 각주 구분선을 구분합니다.

원문 행·번호 prefix는 원래 행에 한 번만 남습니다. 각주 영역마다 기존 구분선·위/아래/각주 사이 간격을 적용합니다. 각 페이지 예약 뒤 본문을 재조판하고 이미 처리한 참조의 페이지/좌표가 바뀌면 실패합니다. 빈 페이지보다 높은 단일 행, 페이지/행/재조판 상한, 누락·중복 참조는 부분 성공으로 반환하지 않습니다. 최소 진행 단위는 완전한 한 행이며 별도 한글 widow/orphan 설정을 구현했다는 뜻은 아닙니다.

소수 행을 새 원점으로 옮길 때 `row.y + row.height`가 단순 끝점 차보다 클 수 있습니다. 실제 정규화된 행 경계를 높이에 포함하며 기존 `placeFootnoteArea`로 물리 투영까지 검사합니다. 물리 좌표의 다음 표현 가능한 수만큼 예약 공간을 올리는 조정은 최대 8회입니다. 정확한 공간이 없으면 마지막 완전한 행을 다음 페이지로 넘깁니다. 허용 epsilon을 추가하거나 행을 자르지 않습니다.

소스 참조 인덱스는 본문 행과 해당 참조를 한 번씩 방문하고, 물리 위치 인덱스는 재조판마다 한 번 구성합니다. 참조 순서화는 53비트 키의 안정 radix와 16개 이하 고정 상한 분기를 써서 각주 수 N의 고정 상수배로 제한합니다. 반복 재조판 O(P·R), raw 진입점의 누적 anchor 확인 O(N²), 기하 재시도의 slice·영역 배치 비용은 남습니다. 이는 정렬 부분의 상한이며 전체 pagination·입력 O(n) 또는 실제 시간 개선의 증거가 아닙니다.

## 근거와 검증 경계

[한컴 각주 도움말](https://help.hancom.com/hoffice130_assistant/ko-KR/Hwp/insert/annotations/footnotes.htm)은 긴 각주의 다음 쪽 이어짐과 마지막 줄 참조의 다음 쪽 이동을 설명합니다. [각주 모양 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/insert/annotations/footnote_format.htm)은 본문 영역 감소와 구분선/간격·배치 정책을 설명합니다. 모든 글꼴/다단/객체 조합의 한글 화면 동치 증거는 아닙니다.

초기 순수 21개 기록을 보존합니다. 이번 정렬 후보의 명시 두 파일은 기존 28개와 신규 순서화 25개로 53개입니다. 아래 저장·Canvas 결과는 정렬 변경 전의 별도 검증입니다. 같은 허용 원본 `footnote-endnote.hwp`(SHA256 `360c6dc2c679e03e48396b11d7f31823a577d64e96a9ec75e074390385b865a9`)의 첫 각주에 Native 저수준 splice로 18,200자를 추가했습니다. 공개 owner가 null인 상태를 위조하지 않았으며 기존 sourceTextChange의 표시 8→원문 15 경계를 사용했습니다. 저장 후 undo 원본 바이트 일치·redo 편집본 일치·재열기를 확인했습니다.

기존 d849 WASM·공식 g8 SDK의 고정 8px 측정에서는 9페이지/268행, 실제 Chrome createRenderer/Canvas 글꼴 측정에서는 4페이지/197행에 18,208 UTF-16 단위가 누락·중복 없이 배치됐습니다. 본문/미주/각주 비겹침과 각주 영역당 구분선 1개, 처음/중간/마지막 쪽 픽셀을 확인했습니다. 마지막 쪽에는 별도의 미주 구분선도 있어 전체 구분선 수는 5개입니다. 이 실제 Canvas 사례는 직접 ReaderRuntime 경로이며 Worker·공식 새 bundle·한글 원본 화면 동치를 증명하지 않습니다.

원 실패 세대와 고정 측정·실제 Canvas 결과를 별도로 보존했습니다. 새 Native 빌드·실제품 적용·운영 변경은 수행하지 않았습니다. 실행 명령은 [개발·검증 명령](development-commands.md#plain-각주-연속-페이지-집중-검증)을 따릅니다.

## 측정 전용 잠금 검사 후보

`note-body-page-layout`이 새로 측정한 note를 전달하는 경로만 `paginateMeasuredPlainFootnoteContinuations`를 사용합니다. 등록 순간 section·hostParagraph·anchorUnit을 새 scalar 객체로 복사하며 caller를 동결하지 않습니다. 임의 raw caller의 기존 live 참조 재검사 경로는 유지합니다. 이 표시용 잠금은 Native 편집 권한을 발급하지 않습니다.

기존 physicalIndex 구성 순회 안에서 source-key Map을 조회하고 고유 발견 수·중복·누락·위치를 검사합니다. 등록마다 공통 text-row 판정을 수행하며, 같은 source 행의 최소·최대 anchor를 매 scan 재검사합니다. 같은 key의 상충 위치 등록은 영구 모순이고 일시적인 물리 이동·중복·누락은 각 scan에서 다시 판단합니다. 중간 오류를 먼저 반환하지 않으며 최종 pagination 성공·비제한 결과 뒤에서만 기존 AnchorMoved 오류를 반환합니다.

정규 순수 검사는 기존 53개와 신규 helper13·실제 진입점4로 총 70개입니다. 격리 출력 동치53·phase 모형10·sandbox 통제1은 별도 증거이고 이 70개에 더하지 않습니다. Node 및 Bun 검사에서 통과했으며 Native·Canvas·운영 SDK 승격 증거는 아닙니다.

각주 N=32/64/128, 물리 본문 행 R=1 통제에서 원 locked 루프 방문은 528/2080/8256회였고 새 scan 참조 판정은 60/121/243회였습니다(등록 판정 32/64/128회 별도). Map 조회는 평균적 비용 특성이며 최악 상수 보장이 아닙니다. 잠금 목록 누적 순회만 제거했고 P·R 순회와 fragment 복사·배치 비용은 남아 전체 O(n) 또는 실제 입력 시간 개선을 주장하지 않습니다.

## 복수 plain 각주의 합계 예약 fallback

개별 각주는 페이지보다 짧더라도 합계 예약이 본문을 수용하지 못할 수 있습니다. 기존 continuation이 없고 각주가 둘 이상인 HWP5 plain 경로에서, 본문 표가 없고 일반 pagination이 정확히 `PageColumnReservationOverflow`로 실패한 경우만 같은 measured planner로 재계획합니다. 긴 각주와 합계 초과 경로 모두 측정 전용 잠금 검사를 사용하며, 임의 raw caller의 live 재검사는 유지합니다. 다른 오류·표·개체·다단 거부나 limited 결과를 성공으로 바꾸지 않습니다.

이번 합성의 실제 저장소 root 검증은 순수70개, 기존 d849 엔진의 통합2개, 정규 독립 저장 oracle6개가 각각 fail0·skip0으로 통과했습니다. 통합2개는 긴 각주1개와 두 짧은 각주 합계 초과1개이며, 같은 허용 `footnote-endnote.hwp`를 저수준 Native splice와 ReaderRuntime으로 검사합니다. 본문·미주와의 비겹침, UTF-16 구간과 번호1)/2)의 단회 보존, 비대상 텍스트·저장·undo/redo·재열기를 확인했습니다.

독립 저장 oracle6개는 순수 변조 통제5개와 실제 Native 저장1개입니다. 실제 사례는 각주별 문자열150회 반복을 각각 한 번 splice한 총2편집이며 300회 키 입력 검증이 아닙니다. 원본 기반 raw-record 기대와 전체 Section·비대상 스트림·컨테이너 metadata, 두 단계 undo와 redo 바이트가 일치했습니다. `allowStaleLayout:true`와 변경 문단의 linecache 제거 정책을 명시적으로 유지합니다. 이6개를 Native6사례로 세지 않습니다.

위 root 결과는 고정 측정의 Node·기존 WASM 검증이며, 별도 Chrome 직접 ReaderRuntime·Canvas에서 같은 원본과 고정 저장본 `f294a6e2`의 복수 각주도 확인했습니다. 검증 입력은 `a4627273`의 note-body `7229cbef`, 고정 renderer `d2f24345` mirror, 공식 core67·d849 WASM이며 이후 renderer 변경이나 현재 HEAD 전체의 검증으로 상속하지 않습니다. baseline은 정확한 `PageColumnReservationOverflow`와 모델 보존을 확인했고, 후보는 2페이지·각주73행·6771 UTF-16 단위의 번호1)/2) 단회 보존·현재 owner12/18의 물리 순서·구간 단조성·본문/미주 비겹침·각주 영역당 구분선1개를 확인했습니다. 저장 전후 node ID를 혼용한 기대, 음성 baseline의 paint 판정, absolute spacer로 마지막 각주를 화면에 넣지 못한 초기 하네스 기록은 보존합니다. 정규 surface와 같은 stage·일반 흐름 spacer를 쓴 별도 실행에서는 최신 frame과 실제 viewport 좌표를 검사하고, 첫 각주와 마지막 계속 각주·끝줄의 PNG를 직접 확인했으며 소유 editor/renderer·Chrome·서버 종료와 세션 inactive·잔류0을 확인했습니다. 이 고정 픽스쳐의 가시성 근거는 공식 새 bundle·Worker·공개 선택 입력·모든 복합 각주·실제 입력 성능을 검증한 결과가 아닙니다. 새 Native 빌드나 운영 반영도 수행하지 않았고 전체 O(n)이나 입력 지연 개선을 주장하지 않습니다.
