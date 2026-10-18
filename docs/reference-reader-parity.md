# 참조 문서의 전체 reader 응답 회귀 비교

이 감사의 출력 실패와 완료 판정은 [감사 JSONL 출력 무결성](audit-output-integrity.md)을 따릅니다.

편집 감사의 디스크 부족 중단과 별도 후보의 해당 지점 재검증은 [독립 검사 입력의 디스크 부족](reference-oracle-disk-failure.md)을 따릅니다. reader 응답 일치와 편집 전수 완료는 별도 판정입니다.

## 책임과 판정

`tools/reference-reader-parity-audit.mjs`는 실제 signature로 HWP5/HWPX reader를 선택하고 두 지정 WASM의 전체 reader JSON 해시를 비교합니다. 경로별 입력 hash와 시작/종료 WASM hash의 불변도 확인합니다. 결과 판정은 `reference-reader-parity-result.mjs`가 소유하며 서로 다른 응답/거부,손상된 판정 입력,양쪽의 같은 미예상 실패도 오류입니다. 암호 미제공/미지원 암호/구역 수 불일치의 같은 거부는 matched_refusal로 따로 집계하고 지원 성공으로 바꾸지 않습니다. 실행 명령의 소유자는 [개발·검증 명령](development-commands.md)입니다.

## 2026-10-15 후보 실측

이전 여백 보호 후보 SHA-256 `f0bb43dfecaf654fef20557bda47b1c71a79060020118c245827bf43ac7655a1`과 양식 원문 보존 후보 `cb5d1b87a04768990c19481ad007c20517ee80e02ed44978989b7dd966617349`를 참조 root `reference/rhwp/samples` 전체에 비교했습니다. handle16411·exit0,로그 `/tmp/hwpjs-form-reader-parity.JJ7be1/audit.jsonl`의 최종 summary는975경로·전체 응답 일치944·HWP3 제외26·같은 거부5입니다. 양쪽 입력과 산출물 hash의 시작/종료 불변도 통과했습니다.

같은 거부5개는 기본 비밀번호 없는 읽기의 EncryptedDocument1/UnsupportedEncryption1과 구역 수 선언 불일치3개입니다. 비교 중 정상 응답을 얻었다는 증거이지 모든 필드 해석,암호 상태 재저장,문서 편집/객체 편집/조판/GUI 동치 또는 기본 WASM 승격의 증거가 아닙니다. 기본 제품에 후보의 편집 기능을 소급하지 않습니다.

판정기의 부정 대조는 다른 텍스트/scalar/문단/위치 응답,같은 OutOfMemory/Timeout/IOFailure/UnknownFormat의 부당한 통과,잘못된 응답 envelope와 서로 다른 거부를 거절해야 합니다. 인수 검증과 판정기 두 파일은 공통 선택 wrapper에서3/3·skip0·exit0(234.901958ms)입니다. 이 focused 결과를 전수975경로 수와 합산하지 않습니다.
