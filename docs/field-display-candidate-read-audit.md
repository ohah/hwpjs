# 필드 표시 후보의 참조 전체 읽기 검사

같은 후보의 추적 HWP5 prefix·숫자 입력은 [HWP5 편집 감사](hwp5-field-display-candidate-edit-audit.md)의 별도 검증 축입니다.

2026-10-13 후보 `field-label-display-owned-api` SHA256 `39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f`로 `tools/reference-parser-audit.mjs --wasm=<후보> --root=reference/rhwp/samples`를 실행했습니다. `/tmp/hwpjs-reference-parser.RtiKQL`의 시작·975개 개별 결과·최종 summary와 종료코드0을 확인했습니다.

실제 서명으로 HWP3 26개를 제외했습니다. 범위 내949개 중 HWP5 509/HWPX435의690523문단 텍스트 projection·입력 버퍼 불변이 통과했습니다. 개별 path 중복 부재·개별 문단 수 합계와 summary 일치·현재 artifact hash 일치도 별도로 검사했습니다. 기본 제품 WASM은 승격하지 않았으며 모든 필드·편집·저장·Canvas 완료 결과가 아닙니다.

남은5거부는 기본 무비밀번호 정책의 `HWP5-password-123456.hwpx`(EncryptedDocument), `hwp3-sample16-hwp5-2024-password-123456.hwp`(실제 서명 HWP5, UnsupportedEncryption)와 issue5715/5802/5828의3원본(SectionCountMismatch)입니다. 파일명 hwp3로 범위를 제외하지 않았습니다. 성공944개·거부5개를 구분하며 암호 지정 복호화나 누락 구역 자동 복구를 수행한 집계로 바꾸지 않습니다. 같은 후보의 두 실제 중첩 문서 편집 검사와 추적 Worker 회귀는 [편집 감사](hwpx-table-fixture-edit-audit.md)의 별도 범위입니다.

## 설정 run 저장 수정 빌드의 전체 읽기 회귀

SHA-256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`으로 동일 참조 root를 재검사했습니다. `/tmp/hwpjs-reference-read-cbaaf27f.jsonl` 및 session52747의 종료코드0을 확인했습니다. 개별975경로의 중복 부재·문단 수 합계690523·현재 산출물 해시를 별도 assertion으로 대조했습니다. 실제 서명 HWP3 제외26, 범위949 중 HWP5 509/HWPX435 성공944 및 위와 같은 거부5입니다. 입력 버퍼 불변도 검사했습니다.

이 빌드는 설정 전용 run의 문맥 의존 빈 입력 위치 저장 회귀 수정을 포함합니다. 전체 읽기 결과가 유지됐다는 근거이며 해당 수정의 전체 native gate, 모든 문서 편집/저장·Canvas 조판·서비스 배포 완료 근거는 아닙니다. 수정 소스의 커밋과 전체 native gate는 아직 보류 상태입니다. 읽기 보고서만 독립적으로 기록합니다.

## 최종 빈 복사 소유권 보강 후보의 읽기 회귀

별도 `field-affinity-complete-sites` WASM SHA-256 `66944afc4768dd9080accd8efbdc6eb45e1c32efbf18b185080d30bc78810413`의 참조 root 전체 읽기 감사도 종료코드0입니다. `/tmp/hwpjs-complete-sites-reference-read.jsonl`의975개별경로/최종 summary를 확인하고 경로 중복 부재·개별 문단 합계690523·현재 산출물 해시를 독립 assertion으로 대조했습니다. HWP3 서명 제외26, 범위949 중 HWP5 509/HWPX435 성공944와 동일한 암호 미지정2/구역 count3 거부5를 유지합니다. 입력 버퍼 불변 검사는 원래 감사 도구가 계속 수행합니다.

이 후보는 설정 run 저장·구조 수식 projection의 보호 위치·현재 필드 조회/입력 공통 범위 검사·생성 문단의 필드 밖 빈 복사 보강을 포함하지만, 이 문서의 근거는 읽기 projection뿐입니다. 최종 source 전체 native/구조 편집 감사와 게시 API 의존성 검증은 아직 진행 중이고 구현 source·기본 제품·서비스 승격 완료를 뜻하지 않습니다.
