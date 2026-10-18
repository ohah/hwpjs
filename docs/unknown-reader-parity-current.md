# unknownObj 후보의 참조 reader 응답 대조

같은 후보의 추적 문서 실제 입력·숫자 의존 셀·명시적 보호/사본 경로는 [추적 편집 재검증](unknown-candidate-fixture-verification.md)이 소유합니다.

2026-10-18 `/tmp/hwpjs-unknown-anchor-probe.1MV5w4`의 `unknown-reader-parity.jsonl/.stderr`는977행(start/975file/summary)·exit0·stderr0입니다. 직전2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c와 unknownObj 후보eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f를 같은 입력으로 비교했습니다.

전체 reader JSON 응답 일치944·같은 거부5·HWP3 제외26입니다.975개 경로는 중복이 없고 이전 title-reader-parity 조사와 입력 SHA256이 모두 같으며 현재 디스크에서도 같은 바이트임을 재확인했습니다. 도구는 입력 버퍼와 시작/종료 WASM 해시도 검사합니다. 하나의 후보/범위의 회귀 증거이며 다른 실행의 통과 수와 합산하지 않습니다.

같은 거부는 무비밀번호 읽기에서 EncryptedDocument(HWPX)·UnsupportedEncryption(HWP5) 각1개와 SectionCountMismatch3개입니다. 구역 불일치는 issue5715/float_chart_ghost_ladder_gap.hwp, issue5802/hf_cross_section_inherit.hwp, issue5828/landscape_rowbreak_bleed.hwp입니다. 이5개를 지원 성공이나 이번 변경으로 해결한 문서로 세지 않습니다.

기존 [참조 reader 대조](reference-reader-parity.md)의 암호 제공·저장 구역만 읽는 명시적 경로와, 원본 선언을 자동으로 고치지 않는 정책은 별도입니다. 이 비교는 새로운 편집 경로의 [실제 브라우저 검증](hwpx-unknown-object-browser.md)이나 모든 필드 해석·편집·조판·기본 WASM 승격·전체 목표 완료를 대신하지 않습니다.

재현은 `node tools/reference-reader-parity-audit.mjs --before-wasm=/absolute/previous.wasm --after-wasm=/absolute/candidate.wasm`입니다. `--root` 없이 현재 참조 samples 전체를 열거했으며 scope/오류 판정은 기존 공통 도구가 소유합니다.
