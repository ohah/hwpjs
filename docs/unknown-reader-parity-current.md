# unknownObj 후보의 참조 reader 응답 대조

## 중첩 owner 나누기 수정 제품의 전체 참조 재대조

게시 분리 작업본의 a7545f5f 제품과9e75 제품을 같은975경로에서 대조했습니다. `publish-owner-reader-parity.jsonl/.stderr`는977행·exit0·stderr0이며944개의 전체 reader JSON 응답 일치·동일 거부5·범위 밖 HWP3 제외26입니다. 로그 SHA256은 `8df50295fc02aa9b0436bb20c152f95faeaff3a440d3e7297ab179a5c8fb50fe`입니다. 실행 전후 두 artifact 해시·각 입력 버퍼를 도구가 검사했고, 종료 후 `publish-owner-reader-disk.json/.stderr`에서975개 inventory 순서·중복 없음·원본 디스크 해시를 모두 재확인했습니다(exit0·stderr0, JSON SHA256 `85ddda3736a6632189f097ff1a4ccd64bf91f7740bf81a8f0f889fefe7705bcb`).

새 제품의 전체 SHA256은 `a7545f5fb8a4b26479a294ac57fb55b7f17de6c4e9b6709a100a790f2baa48f9`, 비교 제품은 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`입니다. 기존 암호2·구역 불일치3의 동일 거부는 지원 성공이 아닙니다. 이번 결과는 읽기 회귀 대조이며 전체 필드 의미/편집/브라우저/원본 한글 조판 완료와 구분합니다. 제품 수정과 편집 증거는 [쪽·단 나누기 기록](paragraph-flow-break-edit.md)이 소유합니다.

## 다단 나누기 보존 수정 후보의 전체 참조 재대조

명시적 나누기 수정 후보d56b와 이전9e75를 `/tmp/hwpjs-task1749-ranges.9Y1P1R/reference/rhwp/samples`의 고정975경로에서 비교했습니다. `/tmp/hwpjs-flow-carry.yhoy68/carry-reader-parity.jsonl/.stderr`는977행·exit0·stderr0이며 공개 reader JSON 응답 일치944·동일 거부5·HWP3 제외26입니다. 두 artifact 전체 해시는 각각 `d56b7d4c740de8dbeea1aabe5fec16a3cbc6f65a98406a592621d1b40ae408ad`, `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`이며 시작/끝 불변을 도구가 확인했습니다. 로그 SHA256은 `7a55ee97a9ef82a2dc5b13c8fea3a86ba1d616e0d2cececcb66e80d4c8526f8d`입니다.

각 입력 버퍼의 불변도 검사했으며 같은 거부5개는 아래의 암호2개·구역 불일치3개입니다. 결과를 지원975개나 전체 모델 필드 의미/편집/조판 완료로 해석하지 않습니다. 입력 디스크/소스의 전수 종료 불변 확인은 진행 중인 [native 고정 실행](native-current-main-gate.md)과 구분합니다. 기본 WASM/기존 외부 데모는 변경하지 않았습니다.

## Zig 0.17 최신 후보의 전체 참조 재대조

e9aa1141 게시 소스의 분리 사본 `/tmp/hwpjs-main-hwp5-gate.qzuKq7`에서 Node24.20.0·nice10으로 기존 기본 cbaa 후보와 새9e75 후보를 전수 비교했습니다. 전체 SHA256은 각각 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`, `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`입니다. e9aa1141부터 이번 기록 전 main까지 src/JS reader/이 감사 도구의 제품 변경은 없으며, 다른 브라우저 도구 수정까지 포함한 최신 전체 gate라고 부르지 않습니다.

`current-reader-parity.jsonl/.stderr`는 start/파일975/summary의977행·exit0·stderr0입니다. 전체 JSON 응답 일치944·동일 거부5·요청 범위 밖 HWP3 제외26으로 새 응답 불일치는 없습니다. 종료 후 현재 참조 inventory와 경로 순서를 대조해 누락/중복0을 확인했고975개 원본 디스크 SHA256도 전수 일치했습니다. 시작/끝의 두 WASM 해시를 도구가 대조했습니다. 로그 SHA256은 `fc366393474b3a9c594c1e19974d8423a1d3f0d046fa976989007429e46472b1`입니다.

동일 거부는 아래 기록과 같은 암호2개·SectionCountMismatch3개이며 지원 성공으로 세지 않습니다. 이 결과는 기존 reader와의 응답 동치이지 모든 필드 의미/편집/실제 브라우저/원본 조판 완성이 아닙니다. 기본 WASM과 외부 데모를 변경하지 않았습니다.

같은 후보의 추적 문서 실제 입력·숫자 의존 셀·명시적 보호/사본 경로는 [추적 편집 재검증](unknown-candidate-fixture-verification.md)이 소유합니다.

2026-10-18 `/tmp/hwpjs-unknown-anchor-probe.1MV5w4`의 `unknown-reader-parity.jsonl/.stderr`는977행(start/975file/summary)·exit0·stderr0입니다. 직전2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c와 unknownObj 후보eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f를 같은 입력으로 비교했습니다.

전체 reader JSON 응답 일치944·같은 거부5·HWP3 제외26입니다.975개 경로는 중복이 없고 이전 title-reader-parity 조사와 입력 SHA256이 모두 같으며 현재 디스크에서도 같은 바이트임을 재확인했습니다. 도구는 입력 버퍼와 시작/종료 WASM 해시도 검사합니다. 하나의 후보/범위의 회귀 증거이며 다른 실행의 통과 수와 합산하지 않습니다.

같은 거부는 무비밀번호 읽기에서 EncryptedDocument(HWPX)·UnsupportedEncryption(HWP5) 각1개와 SectionCountMismatch3개입니다. 구역 불일치는 issue5715/float_chart_ghost_ladder_gap.hwp, issue5802/hf_cross_section_inherit.hwp, issue5828/landscape_rowbreak_bleed.hwp입니다. 이5개를 지원 성공이나 이번 변경으로 해결한 문서로 세지 않습니다.

기존 [참조 reader 대조](reference-reader-parity.md)의 암호 제공·저장 구역만 읽는 명시적 경로와, 원본 선언을 자동으로 고치지 않는 정책은 별도입니다. 이 비교는 새로운 편집 경로의 [실제 브라우저 검증](hwpx-unknown-object-browser.md)이나 모든 필드 해석·편집·조판·기본 WASM 승격·전체 목표 완료를 대신하지 않습니다.

재현은 `node tools/reference-reader-parity-audit.mjs --before-wasm=/absolute/previous.wasm --after-wasm=/absolute/candidate.wasm`입니다. `--root` 없이 현재 참조 samples 전체를 열거했으며 scope/오류 판정은 기존 공통 도구가 소유합니다.
