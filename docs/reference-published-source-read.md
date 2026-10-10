# 게시 산출물의 참조 문서 읽기

2026-10-11 기본 제품과 동일한 고정 WASM `/tmp/hwpjs-main-model-syntax.Ql7dDn/zig-out/bin/hwpjs.wasm`, SHA256 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`로 참조 root 전수 읽기를 재실행했습니다. 입력 파일과 기본 WASM을 변경하지 않았습니다.

`node tools/reference-parser-audit.mjs --wasm=/absolute/fixed/hwpjs.wasm --root=reference/rhwp/samples`는 실제 signature로 reader를 선택하고 입력 buffer 불변을 검사합니다. symlink는 따라가지 않으며 파일64MiB 예산·미지 signature·reader 거부는 성공으로 세지 않습니다. HWP3는 사용자 범위 밖으로 명시적으로 제외합니다. 결과는 `/tmp/hwpjs-current-published-reference-read-20261011.jsonl`, 실행 exit0입니다. 조사 도구의 종료코드0은 모든 파일 지원을 뜻하지 않습니다.

| 현재 결과 | 파일 수 |
| --- | ---: |
| 전체 경로 | 975 |
| HWP3 제외 | 26 |
| HWP5/HWPX 범위 | 949 |
| HWP5 텍스트 읽기·입력 불변 | 509 |
| HWPX 텍스트 읽기·입력 불변 | 435 |
| 무비밀번호 암호 거부 | 2 |
| 구역 수 불일치 거부 | 3 |

읽은 문단은690523개입니다.944성공은 텍스트 projection의 증거이며 전체 필드 의미·모든 편집 명령·저장·원본 조판·Canvas 전수 지원을 증명하지 않습니다. 파일별 input SHA256과 최종 summary를 함께 보관합니다.

## 남은 기본 읽기 거부의 분리

암호 파일은 `HWP5-password-123456.hwpx`의 EncryptedDocument와 실제 HWP5 signature인 `hwp3-sample16-hwp5-2024-password-123456.hwp`의 UnsupportedEncryption입니다. 같은 산출물로 HWP5/HWPX password API/Worker4파일 검사12/12·fail/skip0·exit0,14265.542583ms를 확인했습니다. 명시적 비밀번호 복호화·독립 payload·편집/저장/이력/재열기·보호 해제 저장 동의를 검사하며, 기본 무비밀번호 감사의 합계를 자동 성공으로 바꾸지 않습니다.

구역 수 불일치 원본3파일은 독립 CFB.js/Node DocInfo와 stream 목록으로 다시 대조했습니다:

| 축소 참조 경로 | 선언 구역 | 실제 stream |
| --- | ---: | ---: |
| issue5715/float_chart_ghost_ladder_gap.hwp | 2 | 1 |
| issue5802/hf_cross_section_inherit.hwp | 11 | 2 |
| issue5828/landscape_rowbreak_bleed.hwp | 4 | 1 |

`HWPJS_TEST_WASM=/absolute/fixed/hwpjs.wasm node tools/reference-section-count-probe.mjs`는 exit0입니다. 원본 strict CFB는 InvalidFat이며, canonical FAT/root creation0만 적용한 메모리 파생본도 SectionCountMismatch였습니다. 실제 stream 수로 DocInfo 선언만 정정한 파생본은 각각118/23/2614문단을 읽었고 총4구역의 prefix 입력·독립 전체 Section/비대상 stream/metadata·저장 재열기·undo/redo를 확인했습니다. 원본 파일을 다시 읽어 불변도 확인했습니다. 이는 원본 정상 지원·누락 구역 복원·자동 복구 정책 구현의 증거가 아닙니다.

## 조사 도구 회귀

중복/빈/미지원 옵션 거부와 HWP3 제외/미지 signature 분리의2테스트가 각각 통과했습니다. 판정 코어는 기존 `js/document-format.mjs`를 재사용합니다. 이 도구는 파서와 별도의 조사 경계이며, 실제 지원을 늘리는 parser patch는 아닙니다. 최신 native 전수 실행은 [게시 소스 native 감사](native-published-source-audit.md)와 구분합니다.
