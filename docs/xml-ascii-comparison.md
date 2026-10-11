# 인코딩된 XML 텍스트의 ASCII 비교

문단 좌표의 후속 순회 최적화는 [지역 순회 계약](hwpx-paragraph-position-traversal.md)이 소유합니다. 아래 비교 후보의 검증/성능 수치와 합산하지 않습니다.

`src/xml/text.zig`의 borrowed View가 비교만 소유합니다. Unicode/XML 문자 허용, BOM, entity 해석, 줄바꿈 정규화와 source tree 소유권은 각 기존 계층의 책임입니다. 입력 바이트를 수정하거나 비교 결과를 영속 cache에 저장하지 않습니다.

UTF-8에서는 길이가 같고 기대 바이트가 모두 ASCII일 때 byte 비교를 사용합니다. ASCII 대소문자 무시도 같은 정책입니다. 기대값의 비ASCII는 원래 계약대로 false이며, 단순 byte 동일성만으로 UTF-8 비ASCII/잘못된 입력을 통과시키지 않습니다. UTF-16LE/BE는 기존 공통 scalar 읽기를 그대로 사용합니다. 빈 값·NUL·DEL의 비교는 XML 문자 유효성 판정과 다르며 원래 비교 결과를 유지합니다.

## 후보 검증

실제80168 Worker 흐름의 단일 프로세스 CPU profile에서 self sample은 xml.scalars.read23.2%, paragraph_text_positions.build16.9%, character_style_snapshot.read14.9%였습니다. self sample 비중이지 벽시계 시간 비중이나 모든 문서의 일반 특성이 아닙니다. 이름 비교의 반복 scalar 읽기 경로를 이 근거로 최적화했습니다. 프로세스 격리가 있는 첫 수집의 출력 파일 충돌 가능성을 고려해 분석 근거는 `--test-isolation=none`의 전용 profile로 고정했습니다.

이전 scalar 비교를 독립 oracle로 유지해 단일 UTF-8 raw/기대 byte의256×256×두 case mode, 빈 값/정상 이름/비ASCII/과장 UTF-8/고립 surrogate UTF-8/NUL/DEL/잘림 및 UTF-16 양 byte order의 단위/잘림 조합, 합계141512비교를 검사했습니다. 최종 집중 native63/63·exit0는 새 비교 선언뿐 아니라 기존 HWPX namespace/원문 범위/필드/수식·HWP5 UTF-16·scalar/위치/저장 검사를 포함합니다. root import 선언도 포함된 수치이며 두 native 실행을 합산하지 않습니다. fmt/diff check가 통과했습니다.

ReleaseSafe build6/6·exit0(45초), 후보 `xml-ascii-comparison/bin/hwpjs.wasm` SHA256 `90337d9b1f9d92c6fd11f4a7f430afbf6aa798d456709e33219ec781f74934cc`입니다. 최종 UTF-16 추가 비교는 test-only이고 runtime은 변경되지 않았습니다. 실제 Worker80168의 강화된 Canvas controller/Worker/WASM 입력·독립 XML 양 모드·저장·undo/redo 검사1/1·exit0·skip0(57035.177416ms)을 확인했습니다. 이전 단일 프로파일 흐름64853ms와 profiler 여부/시스템 부하가 달라 이를 엄격한 속도 개선 수치로 주장하지 않습니다.

같은 후보로 참조975경로를 다시 읽어 exit0 종료를 확인했습니다. HWP3 제외26·요청 범위949 중 HWP5509/HWPX435, 합계944파일·690523문단의 텍스트 읽기/입력 버퍼 불변이 확인됐습니다. 거부는 EncryptedDocument1·UnsupportedEncryption1·SectionCountMismatch3으로 기존 집계와 같습니다. 새 실제 전수 결과이며 과거 산출물의 통과 수를 재사용하지 않았습니다. 모든 편집/필드/원본 조판 완료 감사는 아닙니다.

runtime은 최신 전체 native gate 전 미커밋이고 기본 WASM/데모는 교체하지 않았습니다. 문단 좌표·서식의 전체 tree 반복 조회는 남은 프로파일 조사 대상이며 비교 최적화를 대형 문서 즉각 반응성 완료로 해석하지 않습니다.
