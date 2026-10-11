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

[보호된 참조 편집 회귀](../tests/hwpx/reference-password-editor.test.mjs)는 메모리 사본에서만 HWPX의 적격 일반 문단1개와 HWP5의 빈 문단1개를 수정합니다. 편집 전 plaintext 저장 원문 일치, Unicode 입력·저장/재열기·undo 원문/redo 수정본 일치 및 암호화 원본/plaintext 입력의 독립 복사본 불변을 확인했습니다. HWP5는 재조판 필요 오류를 유지하고 명시적으로 원본 배치 유지 저장을 허용한 뒤 기존 독립 CFB/본문 레코드 oracle로 대상 변경과 비대상 보존을 검사합니다. HWPX의 독립 전체 XML/ZIP 검증은 아래 후속 검사 기록을 따릅니다.

[복호화 HWPX 전체 저장 검사기](../tools/hwpx-protected-plain-edit-oracle.py)는 관측418문단 중 source 문단2의 직접 텍스트에 prefix만 추가한 완전 기대 XML을 만들고 모든 다른 요소/속성/텍스트/제어 요소와 비대상 ZIP payload·entry 메타데이터/순서/주석/CRC를 대조합니다. 최초 direct text에 자식이 없다고 가정해 Source direct text identity로 실패했습니다. 원문을 독립 검사해 fwSpace 자식 하나를 확인했고, 이를 기대 XML에서도 그대로 보존하도록 명시했습니다. 임의 자식 변경을 허용하거나 대상 문단 전체를 비교에서 빼지 않았습니다.

일반/-O 모두 실제 수정본이 통과했고 텍스트·속성·fwSpace 제어 요소·비대상 header payload의4변조를 각각 거부했습니다. 전체 XML/비대상 payload 불일치만 음성 성공으로 인정합니다. 마지막4변조 변경의 HWPX 단독 후보1/1·exit0(851.41325ms), 기본1/1·exit0(820.336459ms)을 확인했습니다. 앞선3변조 단계의 전체 편집 테스트2/2도 각각 통과했지만 마지막4변조의 HWP5 실행으로 소급하지 않습니다. 원문 진단의 직접 spawnSync/stdin 호출은 ETIMEDOUT였고 기존 oracle-process IPC 경계를 사용한 재실행은 즉시 성공했습니다. 그 진단 timeout은 파서 실패나 성공으로 계수하지 않습니다.

초기 HWP5 진단은 빈 원본 문단에 없는 PARA_TEXT를 실체화할 때 필요한 종결자CR을 기대하지 않아 저장본 재열기 문자열 비교가 실패했습니다. 기존 빈 문단 회귀의 계약을 확인하고 실제 native 편집값/재열기를 정확히 `검증😀`+CR로 검사했습니다. prefix만 비교하는 완화로 통과시킨 것이 아닙니다. 초기 암호화 원본 비교에 Buffer.slice의 공유 뷰를 사용한 부분도 독립 Buffer.from 복사로 바꾸고 plaintext 불변 검사까지 추가한 최종 소스로 재실행했습니다.

최종 독립fe7 후보2/2·exit0/skip0(9526.993166ms), 기본6a 후보2/2·exit0/skip0(9461.322834ms)을 확인했습니다. 복호화 결과는 보호가 제거된 메모리 사본이며 재암호화나 암호화 원본의 직접 편집 지원 증거가 아닙니다. 모든 문단/필드/레이아웃 편집·브라우저 비밀번호/다운로드 흐름을 검증하지 않았습니다.

[보호된 참조 읽기 테스트](../tests/hwpx/reference-password-reader.test.mjs)는 두 공개 예제 파일명에 명시된 예제 비밀번호로 메모리 안에서만 plaintext 변환을 수행합니다. 실제 HWPX418문단/HWP54282문단을 확인했고 원본과 변환 버퍼의 읽기 불변을 검사했습니다. 변환본은 비밀번호 보호가 없는 데이터이며 파일로 저장하거나 원본을 덮어쓰지 않습니다. 편집/재암호화/브라우저 비밀번호 흐름 검사가 아닙니다.

최초 음성 검사에서는 wrong-password의 null 반환을 예상했지만 실제로 WrongPasswordOrCorruptPayload가 반환돼 다음 단계로 진행하지 못했습니다. 이 실행을 성공으로 계수하지 않고, 해당 오류와 null만 명시적인 음성 결과로 인정하도록 정정해 실제 예제 비밀번호의 양성 읽기를 별도로 완료했습니다. 다른 오류는 음성 대조 성공으로 삼키지 않습니다.

독립fe7 후보2/2·exit0/skip0(8068.648292ms), 기본6a2512 후보2/2·exit0/skip0(8098.058792ms)을 확인했습니다. 이 기능은 새 수식 수정의 효과라고 소급하지 않습니다. 참조 파일이 없는 checkout에서는 테스트가 명시적으로 skip하며 해당 경우 실제 파일 검증으로 계산하지 않습니다.

독립 소스 사본의 전체 Debug native 검사와 기존 작업 트리의 이전 ReleaseSafe 검사는 아직 실행 중입니다. 위 읽기/집중 회귀 결과는 이 전체 gate와 별개입니다.

## 일반 편집 감사의 입력 불변 경계

독립fe7 후보로 외부 Bindata 참조 `issue1891_external_bindata_link.hwpx`의 특수 감사는168시도 중163편집·독립 XML/ZIP163건(필드 label53건)·저장/재열기/이력·exit0으로 종료했습니다. 거부5건(문단2740..2744)은 별도 원본 XML FORMULA 선두 inventory와 일치했습니다. 이 실행은 입력 불변 경계 추가 전 소스였으므로 새 메모리/디스크 해시 검사를 소급하지 않습니다. 같은 파일 일반 입력 전 문단 감사는 아직 종료되지 않았고 전체 파일 편집률로 합산하지 않습니다.

`tools/hwpx-edit-corpus-audit.mjs`는 파일을 읽은 직후 입력 SHA256을 독립 값으로 보관하고, 파일의 전체 문단 검사 뒤 메모리 입력과 디스크 원본을 각각 다시 해시해 대조합니다. 암호화 거부 경로도 같은 불변 검사를 수행합니다. 입력 버퍼 자체가 바뀌어 저장 결과 비교 기준까지 함께 바뀌는 경우를 통과시키지 않습니다. `audit-input-identity`가 이 경계를 소유하고 메모리 변조·디스크 내용 불일치·없는 파일 오류를 검증합니다. 검사 실패 중의 최종 불변 보장은 이 성공 종료 검사의 범위가 아닙니다.

새 경계/기존 인수 거부 회귀5/5·exit0·skip0을 확인했습니다. 독립fe7 후보로 `example.hwpx`의 전체15문단 입력·저장/재열기·undo/redo 및 원문 복원을15/15·exit0으로 확인했고 입력 SHA256은 `4bc0e084ef9c4701103ef17dd0621fd9897924e357d3cb21a5fa2b62ef03318d`입니다. 독립 전체 XML/ZIP이나 전체 reference 편집 완료 증거는 아닙니다. 이전 소스로 이미 실행 중인 외부 Bindata 문서 감사에는 새 검사 경계를 소급하지 않습니다.

후속 특수 입력 감사도 같은 `audit-input-identity`를 재사용합니다. 실제 `hyperlink.hwpx`의 일반 입력 불가4문단은 특수 필드 prefix 편집4/4·독립 XML/ZIP4/4·저장/재열기/이력·원본 불변·exit0을 확인했습니다. `password-12345.hwpx`는 암호화1건·편집 시도0건·원본 불변·exit0으로 명시적으로 분리했습니다. 복호화하거나 편집 지원으로 계수하지 않았습니다. 인수/변조 회귀5/5·exit0·skip0을 다시 확인했습니다.

새 일반 감사 경계를 포함한 전체 Git 추적 HWPX46경로 실행은 exit0으로 종료했습니다. 암호화1개를 제외한1444문단 중 일반 prefix 수락1231건은 저장/재열기·undo/redo·원문 복원을 확인했습니다. 나머지213건은 UnsupportedParagraphControl146·InvalidFormulaNumber48·ProtectedFieldRange19로 거부됐으며 거부 후 원문/이력 불변과189건의 이전 redo 보존을 확인했습니다. 숫자 참조 칸의 의도적인 비숫자 입력48건은 모든 입력이 불가능한 문단과 구분합니다. 이 집계는 일반 prefix 명령 한 종류의 검사이며 특수 편집 결과를 합치기 전 전체 편집 가능률로 쓰지 않습니다. 후보 SHA256은 앞서 명시한fe7이며 기본 제품 WASM의 결과로 소급하지 않습니다.

같은 독립fe7 후보와 입력 불변 검사를 포함한 전체 특수 감사는46경로·암호화1개·165시도 중152편집/저장/재열기/이력·독립 XML/ZIP152건(필드 label6건 포함)·exit0으로 종료했습니다. 일반 감사1231건과 특수152건을 합친1383건은 각 경로의 prefix 입력 증거이며 나머지61건 전체가 편집 불가라는 뜻은 아닙니다. 특수 거부13건은 chart의 문단24·30·36·65·71·77·130·131·132·133·157·163·169였고 독립 `hwpx-formula-prefix-inventory.py`의 원본 XML FORMULA 선두 inventory와 정확히 일치했습니다. 결과 필드 직접 prefix와 수식 정의/입력 숫자 편집은 별도 명령입니다. 나머지48숫자 입력의 유효 숫자 편집은 별도 corpus 회귀를 실행 중이며 아직 최종 결과로 계수하지 않습니다. 외부 Bindata 참조 한 파일의 전체 감사와 native 전체 gate는 별도로 실행 중입니다.
