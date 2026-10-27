# Native formatting evidence의 독립 검증

이 도구는 명시 Native opt-in48 산출물을 읽는 개발용 CLI다. 제품 parser·WASM·snapshot을 호출하지 않는다. 입력이 없으면 corpus나 verification 폴더를 탐색하지 않으며 Native 출력을 생성하지 않는다. 정규 CLI와 명시 pure tests를 제공한다. Native producer의 승격 및 CI의 Native48 생성·전달 연결은 별도이며, 이 도구 제공만으로 완료되지 않는다.

`tools/formatting-evidence/hwp5-oracle.mjs`는 CFB/raw-record 기대 변환, `hwpx_oracle.py`는 ZIP/XML 기대 변환을 소유한다. HWP5는 기존 `tests/hwp5/style-preservation/text-record-oracle.mjs`를 상대 import한다. 공통 의존성은 기존 distribution·legacy/cfb다. line-mask는 현재 WIP 대조에서만 추가로 사용되며, HEAD 모드의 text-record와 정규 CLI에는 필요하지 않다. 이 승격은 text-record의 무관한 WIP 두 hunk나 미추적 line-mask를 포함하지 않는다. 새 raw-record parser나 CFB 구현을 복제하지 않는다. `tests/.../formatting-evidence-boundaries`는 guard 및 실제 저장물 변조를 검사하는 명시 테스트다.

현재 text-record SSOT가 `legacy/cfb.js`를 cwd 기준으로 읽으므로 CLI는 `--repo-root`·실제 source root·cwd 일치를 검사하고 stderr에 context JSON을 기록한 후 import한다. cwd를 몰래 변경하지 않는다.

## 기존 Native48 소비와 순수 테스트

아래는 checkout root에서 실행한다. `EVIDENCE_DIR`는 caller 소유의 기존 absolute 경로이며 eight case/source·edited·restored·redone·noop·metadata.json의48개만 있어야 한다.

```sh
node --test ./tests/hwp5/formatting-evidence-cli.test.mjs
node ./tools/verify-formatting-evidence.mjs --repo-root "$PWD" --evidence-dir "$EVIDENCE_DIR"
node ./tools/verify-formatting-evidence.mjs --repo-root "$PWD" --evidence-dir "$EVIDENCE_DIR" --python-optimize
node ./tests/hwp5/style-preservation/formatting-evidence-boundaries.mjs --evidence-dir "$EVIDENCE_DIR"
node ./tests/hwp5/style-preservation/formatting-evidence-boundaries.mjs --evidence-dir "$EVIDENCE_DIR" --callsite
python3 -B ./tests/hwpx/formatting_evidence_boundaries.py --evidence-dir "$EVIDENCE_DIR"
python3 -O -B ./tests/hwpx/formatting_evidence_boundaries.py --evidence-dir "$EVIDENCE_DIR"
python3 -B ./tests/hwpx/formatting_evidence_boundaries.py --evidence-dir "$EVIDENCE_DIR" --callsite
python3 -O -B ./tests/hwpx/formatting_evidence_boundaries.py --evidence-dir "$EVIDENCE_DIR" --callsite
```

양성은원8case, H5경계19·callsite5, HX경계21·callsite포함23이다. normal/-O 반복을 새로운 피쳐 수로 합산하지 않는다. 정규 CLI unit은 외부 fixture 없이 실행한다. 실제 Native 생성물과 기본 pure test를 분리한다.

## Native48 생성의 명시 경계

다음 명령은 재현 문서이며 자동 실행하지 않는다. Native 슬롯·정확 source/fixture·sandbox/자원 guard 승인을 별도로 받은 환경에서만 실행한다. env 부재 시 Native 의미 검증은 그대로 실행하고 evidence 파일 IO는0이다. 기본 CLI/test가 Native를 빌드하지 않는다.

```sh
# OUTPUT_PARENT는 caller 소유의 기존 absolute 경로다.
EVIDENCE_DIR=$(mktemp -d "$OUTPUT_PARENT/formatting-evidence.XXXXXX")
HWPJS_FORMATTING_EVIDENCE_DIR="$EVIDENCE_DIR" nice -n 19 zig test -j1 -O ReleaseSafe --dep baseline -Mroot=src/root.zig -O ReleaseSafe -Mbaseline=src/testing/hwp5_history_reference.zig --test-filter 'whole-w3/HWP5 new7 single batch save undo redo reopen' --test-filter 'whole-w3/HWPX new7 single batch save undo redo reopen' --test-filter 'whole-w3/HWP5 explicit paragraph-style full reset scopes' --test-filter 'whole-w3/HWPX explicit paragraph-style full reset scopes'
node ./tools/verify-formatting-evidence.mjs --repo-root "$PWD" --evidence-dir "$EVIDENCE_DIR"
```

기존 source0 출력 강제나 wire JSON32 출력은 필요 없다. 모든 파일은 Native 테스트의 exclusive sink로 생성되므로 원산출물과 기존 full gate를 덮지 않는다.

## snap-only cache 보존 계약

paragraph reset에서 원문 리소스가 snapToGrid만 다르고, 명시·유일한 inactive grid 두축0 및 방향/원고지 조건을 만족할 때만 cache 보존을 기대한다. 그 외에는 기존 cache 삭제 기대를 유지한다. XML은 정수 section0만 허용하고 H5는 실제 구역 범위와 정수 타입을 검사한다. 실제 edited와 Native.changed를 기대 판정 입력으로 쓰지 않는다. cache·비대상 문단 변조 및 다른 기하1bit를 거부한다.

원본 cache의 절대적 정확성이나 Hancom pixel 동치를 재현하는 검사는 아니다. HWP5 공식 revision1.2 표44 bit8/표62/표123과 한컴 개발자 `https://forum.developer.hancom.com/t/owpml-hp-t/1685/4`의 레이아웃 설명에 근거해 변경의 기하 의존성이 보존됨을 확인한다. CLI full 통과는 Native full/CI/제품 적용 완료를 의미하지 않는다.

## source-only clone과 CI의 준비 단계

이8개신규 source만 있는 checkout에서도 기본 pure CLI unit은 Native 빌드나 생성물 없이 실행한다. 반면 자료 검증 CLI는 Native48이 없으면 `FormattingEvidenceNotPrepared`로 exit1이다. 자동 pass/skip·ignored 경로 검색·옛 산출물 대체는 없다. --help는 사용법만 출력하며 검증 성공으로 세지 않는다.

48 생성은 별도 Native producer가 필요하다. 현재 producer는 아직 정규 main에 적용됐다고 가정하지 않는 Native 통합 후보(source manifest f43886248639e8ce5cb9b2395f275de5feb5ac46c1a5ae1860f50a2f2f8d1afc)다. `src/testing/whole_formatting_w3_tests.zig`, named baseline `src/testing/hwp5_history_reference.zig`, 실제 `src/root.zig`의 정규4case 등록과 닫힌 Zig import/embed closure가 준비돼야 한다. 이8개 CLI 파일의 승격만으로 producer가 생기지 않는다.

Native4 실행의 명시 runtime fixture는 `legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp`, `charshape.hwp`, `charshape.hwpx`다. 고정 조사에서는 각각 fca8efc7c38ff7760046f6e2ba8b82552acb552779cf3e76bbd117868f02efd8 / 8eb333ab110db6f91d7e426d507d41ca09cacd4d40d945188b5ec40663d7576b / 7905b94f6720e7d56f06239ba4cb029ff2fb8509a6ae7feda9dccc9506074b78 이었다. 이는 현재고정입력핀으로, fixture를 바꾸면 별도 세대로 재검토한다. baseline 별도회귀의 Noori/golden 요구와 이4case 입력을 혼합하지 않는다.

CI 연결은 별도 단계다. producer 및 fixture가 없는 checkout은 생성 준비 미완으로 실패시켜야 한다. 준비된 producer job은 새 caller-owned 출력 root와 보호 read/stat deny·자원 guard에서만4case를 실행하고, 후속 pure CLI에 해당 absolute경로를 명시 전달한다. Native 출력물은 source로 vendor하지 않는다. 재사용하는 외부 CI artifact가 있다면 원48개 파일 전체SHA manifest를 별도로 고정·검사한다. 이 CLI·pure tests 제공에는 CI 파일이나 package script 연결을 포함하지 않는다.

Native 생성 명령은 다른 evidence env를 제거한 상태여야 한다. 위 명령 앞에 `env -u HWPJS_HISTORY_EVIDENCE_DIR -u HWPJS_FORMATTING_WIRE_EVIDENCE_DIR`를 적용하고 HWPJS_FORMATTING_EVIDENCE_DIR만 명시 지정한다. 기본 env부재의 의미검증/파일출력0 정책은 바꾸지 않는다. 현재 공식 full 실행 중에는 위 Native 재현 명령을 새로 실행하지 않는다.
