# 독립 수식 후보의 참조 읽기 감사

## 산출물과 범위

2026-10-11 [수식 셀 계약](hwpx-formula-cell-scalars.md)의 독립 후보fe7de345를 기존 [참조 파서 조사기](../tools/reference-parser-audit.mjs)에 연결했습니다. 결과 원문은 무시되는 `zig-out/verification/reference-reader-fe7.jsonl`에 남깁니다. 파일 경로·입력 SHA256·실제 서명 기반 형식·단계별 상태와 최종 집계를 함께 읽습니다. 조사기 exit0은 모든 문서 지원 성공을 의미하지 않습니다.

총975개 중 실제 HWP3 서명26개는 사용자 지정 범위 밖입니다. HWP5/HWPX949개 중 HWP5509개/HWPX435개, 합계944개에서690523문단의 텍스트 읽기와 입력 버퍼 불변을 확인했습니다. 필드 의미·편집·저장·조판 완료 감사가 아닙니다. 이전 후보의 같은 수치를 재사용한 것이 아니라 fe7de345 산출물로 전수 재실행했습니다.

## 일반 읽기에서 거부된5개

- `HWP5-password-123456.hwpx`: 실제 HWPX, EncryptedDocument.
- `hwp3-sample16-hwp5-2024-password-123456.hwp`: 이름과 달리 실제 HWP5, UnsupportedEncryption.
- `issue5715/float_chart_ghost_ladder_gap.hwp`, `issue5802/hf_cross_section_inherit.hwp`, `issue5828/landscape_rowbreak_bleed.hwp`: SectionCountMismatch.

거부를 통과로 바꾸거나 원본 header/DocInfo/CFB를 자동 정정하지 않았습니다.

## 명시 비밀번호 경로의 별도 검사

### 복호화 뒤 제한적 편집

[보호된 참조 편집 회귀](../tests/hwpx/reference-password-editor.test.mjs)는 메모리 사본에서만 HWPX의 적격 일반 문단1개와 HWP5의 빈 문단1개를 수정합니다. 편집 전 plaintext 저장 원문 일치, Unicode 입력·저장/재열기·undo 원문/redo 수정본 일치 및 암호화 원본/plaintext 입력의 독립 복사본 불변을 확인했습니다. HWP5는 재조판 필요 오류를 유지하고 명시적으로 원본 배치 유지 저장을 허용한 뒤 기존 독립 CFB/본문 레코드 oracle로 대상 변경과 비대상 보존을 검사합니다. HWPX는 현재 텍스트·ZIP 왕복/이력을 검사하며 이 경로의 독립 전체 XML oracle은 아직 별도입니다.

초기 HWP5 진단은 빈 원본 문단에 없는 PARA_TEXT를 실체화할 때 필요한 종결자CR을 기대하지 않아 저장본 재열기 문자열 비교가 실패했습니다. 기존 빈 문단 회귀의 계약을 확인하고 실제 native 편집값/재열기를 정확히 `검증😀`+CR로 검사했습니다. prefix만 비교하는 완화로 통과시킨 것이 아닙니다. 초기 암호화 원본 비교에 Buffer.slice의 공유 뷰를 사용한 부분도 독립 Buffer.from 복사로 바꾸고 plaintext 불변 검사까지 추가한 최종 소스로 재실행했습니다.

최종 독립fe7 후보2/2·exit0/skip0(9526.993166ms), 기본6a 후보2/2·exit0/skip0(9461.322834ms)을 확인했습니다. 복호화 결과는 보호가 제거된 메모리 사본이며 재암호화나 암호화 원본의 직접 편집 지원 증거가 아닙니다. 모든 문단/필드/레이아웃 편집·브라우저 비밀번호/다운로드 흐름을 검증하지 않았습니다.

[보호된 참조 읽기 테스트](../tests/hwpx/reference-password-reader.test.mjs)는 두 공개 예제 파일명에 명시된 예제 비밀번호로 메모리 안에서만 plaintext 변환을 수행합니다. 실제 HWPX418문단/HWP54282문단을 확인했고 원본과 변환 버퍼의 읽기 불변을 검사했습니다. 변환본은 비밀번호 보호가 없는 데이터이며 파일로 저장하거나 원본을 덮어쓰지 않습니다. 편집/재암호화/브라우저 비밀번호 흐름 검사가 아닙니다.

최초 음성 검사에서는 wrong-password의 null 반환을 예상했지만 실제로 WrongPasswordOrCorruptPayload가 반환돼 다음 단계로 진행하지 못했습니다. 이 실행을 성공으로 계수하지 않고, 해당 오류와 null만 명시적인 음성 결과로 인정하도록 정정해 실제 예제 비밀번호의 양성 읽기를 별도로 완료했습니다. 다른 오류는 음성 대조 성공으로 삼키지 않습니다.

독립fe7 후보2/2·exit0/skip0(8068.648292ms), 기본6a2512 후보2/2·exit0/skip0(8098.058792ms)을 확인했습니다. 이 기능은 새 수식 수정의 효과라고 소급하지 않습니다. 참조 파일이 없는 checkout에서는 테스트가 명시적으로 skip하며 해당 경우 실제 파일 검증으로 계산하지 않습니다.

독립 소스 사본의 전체 Debug native 검사와 기존 작업 트리의 이전 ReleaseSafe 검사는 아직 실행 중입니다. 위 읽기/집중 회귀 결과는 이 전체 gate와 별개입니다.
