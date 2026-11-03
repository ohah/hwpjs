# 문단 측정값과 배치 행의 분리

## 채택 범위와 책임

2026-11-03 문단 로컬 readonly 측정값을 공유하고 각 배치의 outer row를 새로 만드는 제한 최적화를 채택했다. 게시 번들의 반영 여부는 서버가 제공하는 manifest와 릴리즈 검증 기록으로 별도 확인한다. 증분 scheduler·표/페이지 전체 조판·전체 O(N) 구현 완료를 뜻하지 않는다. 이전 미채택13제품·font cache·flatplan을 이 기능에 포함하지 않는다.

`web/preview/measurement-placement-private.mjs`는 최초 clone의 독립 소유와 readonly 변환·내부 포트 연결만 소유한다. 원본을 freeze하지 않는다. `web/preview/paragraph-flow-reuse.mjs`는 문단 로컬 geometry의 cache 키·signature·보관 예산·store/hit 수명을 소유한다. `web/preview/renderer.mjs`와 기존 배치 엔진은 매 hit 새 outer row에 현재 y·선택 flags 등 배치별 값을 조립한다. readonly nested geometry를 수정하거나 이전 절대좌표·hit 권한을 가져오지 않는다. `packages/vanilla/src/surface.ts`는 private factory의 수명과 내부 연결만 소유하며 public layout 반환을 새로 추가하지 않는다.

## raw 계약·권위·예산

private Surface factory와 readonly pure port만 공유 경로를 선택한다. raw createRenderer와 기존 helper 기본호출의 clone·독립 반환값, onLayout/layout/paintedFrame 관측과 가변 계약은 유지한다. 외부 frozen 객체나 포트 이름만으로 opt-in하거나 Native 권한을 발급하지 않는다.

최초 store의 clone·readonly 검사 비용과 entry/row/논리 단위·key 비용 예산, close/clear 해제를 유지한다. 기존 cache key·signature·환경 검증과 Native 경로의 기존 현재성 검사를 유지한다. 추가 Native 권위 발급이나 검사 생략은 없다. 기존 일반 cache lookup의 read 뒤에 새 Native query나 사후검사가 있는 것으로 해석하지 않는다. 캐시 hit는 geometry commit·dirty 소비·paint ticket을 전진시키지 않으며 기존 실패 fallback을 유지한다.

## source·기능·pixel 확인 범위

초기 채택 당시 정규 source 회귀는 신규5+projection16+line-spacing8=29pass·0fail·0skip이다. 합성 A→B→A는 Native undo가 아니다. line-spacing 시험은 baseline에서도 재현된 quote 의존 실패를 정규식2줄로 교정했고 기존 음성 mutants와 높이 기대는 유지했다. 제품4와 별도 시험 수정이다. 독립 소유권/raw 대조 및 geometry·배치/형제·table/page·복원/clear·폭/환경의 다섯 source 축도 통과했다. 이 source 결과를 실제 Native·Surface 실행 수로 확대하지 않는다.

별도 실제 브라우저4는 HWP5 40입력/40undo 후 재입력, HWPX8입력/8undo 후 재입력, 각 포맷의 원본 복원 후 저장·재열기를 확인했다. 저장 범위는 undo한 원본 바이트이며 임의 편집 문서 전체 저장 동치가 아니다. HWP5 관측은 cache hits+5193, hit copiedRows0이지만 cold store copiedRows+1303이다. 전체 복사0이 아니다.

같은 Noori HWP5 최초 화면의1056×443 crop에서 두 RGBA SHA가 `6bf7ebff5ec6d2630b0a7805f805a18e3b1db50f745ff197f5ea967e48164358`로 같았다. 최초 가시영역 일부만의 동치이며 편집 후·전체 페이지·다른 기기 픽셀 동치는 아니다.

## 제한된 지연 비교

A는 운영 actual65 baseline, B는 r3 후보다. hostInputToFinalReadMs에는 CDP 키 전달·DOM 관측 비용과 외부 CPU 부하가 포함된다. 두 cohort는 각각 A-B-B-A, 각 버전 n2이며 표본을 합산하지 않았다.

| cohort | A1/B1/B2/A2(ms) | 짝별 변화 | 중앙값 비율 |
| --- | --- | --- | --- |
| 최초 | 1103.838917 / 1007.935333 / 1105.925416 / 1181.836084 | −8.688% / −6.423% | −7.517% |
| 독립 확인 | 1112.971333 / 1078.079791 / 1096.036750 / 1107.006459 | −3.135% / −0.991% | −2.066% |

두 cohort 모두 양 짝에서 감소를 관측해 이 제한 단계의 채택 근거로 삼았다. 각 표본은 작으며 일반 성능·통계적 유의성·개별 키 지연·첫 파일 열기 개선을 주장하지 않는다. 최초 clone/freeze를 제외한 warm 합성 benchmark는 이 실제 비교와 별도다. 운영 배포 완료는 별도 확인 대상이다.

정규 실행 명령은 [개발·검증 명령](development-commands.md#문단-측정과-배치-분리-정규-회귀)이 소유한다. 이 문서는 지원 경계와 증거 범위의 단일 출처이며 기존 미구현 증분 설계 전체의 상태를 바꾸지 않는다.

## 소유 측정값의 null-prototype 보존

`structuredClone`은 null-prototype 사전을 일반 객체로 바꾼다. 소유 측정값의 명시 opt-in clone은 이 원형을 보존하고, 기존 private 문단 캐시가 이 경로를 사용한다. clone의 소유권이나 구조가 불확정이면 현재 계산 결과를 유지하고 캐시 저장을 생략한다. raw/default clone의 동작과 기존 환경·현재성 검증은 유지한다. 표 캐시나 새 Native 권한을 추가하지 않는다.

정규 세 entry는 측정·배치8+projection16+line-spacing8의32개가 통과했다. fresh/cold/warm·null-prototype·alias·cycle·raw 가변성·불확정 clone의 fallback을 검사했다. HEAD 의존성에 정확 두 제품과 선택 시험만 더한 검증이며, 다른 미채택 캐시의 결과를 합산하지 않는다.

별도 SDK05/Native Noori 검사는 load·편집·undo를 각각 한 번 수행했다. cached-on과 fresh cache-off의 엄격 비교6쌍에서98행·40박스·4페이지가 같았고, undo 뒤 원래 출력 hash가 복원됐다. glyph 측정은 통제한 범위이며 추가 alias graph 전수 증명·실제 Canvas·성능·HWPX 배포를 뜻하지 않는다. 실제 게시와 다른 환경의 결과는 별도 검증한다.
