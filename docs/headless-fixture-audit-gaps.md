# 전체 픽스쳐 감사의 독립 검증 공백

2026-10-25의 기준선 감사 기록이다. 전체 지원 완료를 뜻하지 않는다. 입력과 종료 결과는 `zig-out/verification/post-focus-full-headless-20261025/manifest.json`, `results.jsonl`, `summary.json`이 소유한다. 1,068경로·1,032개 원본 해시의 감사를 종료했고 독립 검증896·oracle 미지원131·시간 초과9·입력 대상 없음5·HWP3 제외26·사용자 제외1이다. 모두 경로 수이며 중복 원본의 계승 결과를 독립 실행으로 세지 않는다. 도구·원본·WASM은 전후 불변이다. 미지원/timeout 때문에 종료코드1이며 전체 성공이 아니다. HWP3는 서명으로 제외하고, 이름에 hwp3가 있더라도 실제 HWPX로 변환된 파일은 포함했다.

## 저장 실패와 독립 검증 미지원을 구분

`tabdef.hwpx`의 공개 API 입력·저장·undo/redo·재열기는 성공하지만 기존 plain XML oracle는 hp:t의 hp:tab 자식을 거부한다. `oracle-unsupported`를 성공이나 제품 저장 오류로 집계하지 않는다. 격리 후보 `zig-out/verification/tab-splice-oracle-candidate/`는 탭 text/tail 슬롯을 source-only로 계산하며, 실제 저장본과 escaping 대조·탭 속성/순서/삭제·scalar 경계·다른 ZIP payload 변조를 검사했다. 아직 진행 중 감사에 연결하지 않았다.

`3-09월_교육_통합_2022.hwpx`와 `3-09월_교육_통합_2024-구분선아래20구분선위20.hwpx`는 앞선 header 제어 때문에 source classifier가 plain-splice로 종료한다. 기존 direct_text prefix oracle 자체는 두 실제 저장본을 normal/-O에서 검증한다. source-only 직접 run/t 소유권 증명이 필요하며 모든 plain 미지원 결과를 무조건 prefix로 재시도하지 않는다. 본문 paragraph0과 header 내부 paragraph2를 재귀 XML 첫 텍스트로 혼동하지 않는다. 근거는 `zig-out/verification/header-prefix-oracle-candidate/REPORT.md`다.

이 후보들은 기존 감사 도구의 바이트를 변경하지 않는 격리 실험이다. 향후 routing 변경 후에는 바뀐 verifier 버전으로 재검증해야 하며 이전 전수 결과를 소급하여 전체 성공으로 바꾸지 않는다.

## 대형 편람의 시간 제한

`2025 행정업무운영 편람(최종).hwpx`는 13,639,865바이트이며 SHA256은 `c6dd7e847a99f219681afc5a29c80a9665c04df9cda4d820a3350d739664fdf6`다. 60초 감사는 splice 단계에서 중단됐다. 별도 동일 엔진의 300초 제한 검사에서는 160,007ms에 공개 입력·독립 XML/ZIP·undo/redo·재열기·동일 bytes 재저장까지 통과했다. 원본과 WASM은 불변이다. 근거는 `zig-out/verification/search-direction-private/handbook-extended-case.json`이다. 기존 60초 timeout은 그대로 남기며 이 대표 입력의 정확성 통과와 긴 처리 시간을 별도로 기록한다.

시간 제한으로 종료된 자식의 `sourceUnchanged:false`는 자식의 최종 보존 확인이 없다는 보수적 결과다. 이 파일은 별도 원본 해시 대조로 보존을 확인했다. 실제 변경 여부는 최종 감사의 changedPaths와 추가 해시 근거로 판단한다.

대형 편람 프로파일링은 `zig-out/verification/handbook-runtime-profile/`에서 수행한다. 첫 계측은 진단용 동적 import 경로 오류로 baseline 뒤 중단됐고, 제품 실패로 계수하지 않는다. 수정된 계측은 `result-fixed.json`에서 162,008ms에 verified로 종료됐으며 모든 저장·이력·독립 검증이 통과했다. runtime 요청을 그대로 위임하면서 측정한 시간은 다음과 같다.

| 요청 | 시간 |
| --- | --- |
| 최초 load | 23.16초 |
| 편집 enable | 20.89초 |
| splice | 21.96초 |
| undo / redo | 21.82초 / 21.86초 |
| 각 save | 0.39–0.44초 |
| 재열기 load / enable | 23.59초 / 20.86초 |

`runtime.cpuprofile`의 상위 self-time은 WASM function938 31.75초, function31 27.53초, function949 16.61초다. 함수명이 제거된 산출물의 번호만으로 Native 소스 함수를 추정하지 않는다. 요청 시간은 Native 명령과 표시 projection을 함께 포함하며, 짧은 save 결과만으로 전체 복사·저장 경로가 항상 빠르다고 일반화하지 않는다. 후속 [최초 활성화 중복 계산 제거](hwpx-load-enable-projection.md)는 이 기준선 종료 뒤 적용한 별도 변경이다. 기준선 전체 결과를 새 runtime 버전의 전수 완료로 소급하지 않는다.
