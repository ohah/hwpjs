# 메타데이터 전용 run의 텍스트 입력

## 원인과 소유 계약

후속 전체 공개 검사에서 metadata-only 사이트를 기존 본문이 있는 문단에도 만들던 회귀를 확인했습니다. fallback은 현재 paragraphOnly로 문단 전체가 메타데이터 run/linesegarray뿐인지 확인하고, 원래 hp:t(빈/탭 전용 포함) 또는 기존 빈 run이 있으면 생성하지 않습니다. 원래 텍스트/앵커의 삽입 run·서식을 바꾸지 않습니다. 이미 가진 covered 배열에 정확한 paragraph 소유자를 표시하며 nearest owner는 paragraph_site_owner.optionalAncestor를 공유합니다. 소유자 부재는 null이고 잘못된 인덱스/순환은 오류로 남습니다.

issue1891의80168/86712 규제분석 원본5번 문단은 run 안에 ctrl/pageNum만 있고 hp:t가 없습니다. 기존 text_sites.collect는 자식 없는 run에만 빈 텍스트 사이트를 만들므로 두 문단의 일반 입력과 split 조회는 MissingTextSite로 거부됐습니다. 쪽번호를 텍스트로 해석하거나 표시 번호를 합성하는 문제가 아닙니다.

로컬 수정의 retained_run_metadata.runOnly는 정확한 paragraph namespace run의 직접 자식이 기존 supported 메타데이터 컨트롤뿐인지 판정합니다. 원문 사이의 비공백 내용·필드·그림·알 수 없는 컨트롤·기존 t를 제외합니다. text_sites.collect는 이 판정으로 run 시작 태그 직후의 빈 missing_text 사이트를 소유합니다. 입력·저장은 기존 공통 문자 트랜잭션과 XML writer를 사용하고 기존 메타데이터를 그대로 복사합니다. 메타데이터 종류 판정을 collector에 복제하지 않습니다.

## 검증과 현재 경계

### 전체 검사에서 발견한 회귀와 수정

이전 e64bdcfa 후보의 공개 전체 실행에서 anchor-editor의 page number XML mismatch와 character-effect-metadata의 세 파일 UnsupportedInlineControl이 나왔습니다. 후자는 multicolumns-in-common-controls/multicolumns/table-bug입니다. 같은 후보에서 page number 집중 검사1/1 실패를 실제 재현했습니다. 기존 텍스트 앞에 새 빈 메타데이터 사이트가 끼어 원래 입력 run을 바꾸고, 서식 fragment가 불필요한 missing run을 만나던 것이 원인입니다. 독립 oracle를 완화하거나 테스트 기대 XML을 변경하지 않았습니다.

paragraph fallback 후보 SHA256 `afb292567422cdaaa945217d546fe1e057bbbb3c3133196d99a8ecf845f83723`는 ReleaseSafe build6/6 exit0입니다. anchor-editor·character-effect-metadata·실제 두 쪽번호 원본 집중5/5 exit0으로 완료했고, 메타데이터 효과는46파일 분류/실제26파일208트랜잭션·독립 XML·undo/redo에서 실패0입니다. 원래 hp:t·기존 빈 run·탭만 있는 hp:t의 삽입 소유자를 유지하며 필드/그림 host에는 fallback을 만들지 않는 반례도 추가했습니다.

새 empty metadata 문단의 부분 서식 저장도 별도 UnsupportedInlineControl을 재현했습니다. 첫 합성 fixture는 refList가 없어 MissingReferenceList를 냈으므로 검사 입력을 올바른 charProperties header로 교정한 뒤의 UnsupportedInlineControl만 제품 원인 근거로 사용했습니다. character_style_missing_run은 검증된 메타데이터 전용 문단의 run만 허용하며 첫 fragment에만 메타데이터를 유지합니다. 모든 실패 할당 정리·뒤 fragment의 컨트롤 제거·원문/현재 문자열 불변 및 부분 서식 후 컨트롤1개/재열기·재저장을 검사했습니다. 실제 issue1891의 서식 동반 입력은 별도 global unmatched InvalidFieldLinks가 남아 이 clean fixture 결과로 지원 완료를 주장하지 않습니다.

style fallback 후보 SHA256 `f49c5316a2f1e3bfcb28fdc24aa0e3f7bcbaa78a05d1a1831609c515a0782955`도 ReleaseSafe build6/6 exit0입니다. 기존 실패 두 검사·실제 쪽번호·중첩 회귀 집중6/6 exit0이며 focused-public.log에 기록했습니다. 현재 metadata 필터 native20/20은 새7개 검증과13개 기존 의존 검사입니다. 메타데이터 Session 검사는 metadata_run_session_tests로 분리하고 원래 scope 진입점과 정규 root에서 읽어 책임을 분리했습니다. 앞선 전체 실행의 실패는 그대로 남겨두며 최신 전체 native/public 완료로 바꾸지 않습니다.

### 실제 브라우저 입력

agent-browser의 격리 세션에서 loopback10014 서버가 위 metadata-text-sites 후보를 제공하도록 했습니다.80168 원본을 실제 file input으로 업로드하고 편집 시작→시작 문단5/개수1 구간 이동→Canvas 빈 문단 영역 클릭→브라우저 `keyboard inserttext`로 `본문😀<&`를 입력했습니다. 실제 Worker 응답의0-based4번 text 변경과 undo 활성화를 확인했습니다. 앞선 클릭들은 빈 문단의 줄 영역 밖이어서 커서가 생기지 않았고 입력 성공으로 세지 않았습니다. 현재 Worker content를 관측한 뒤 공통 배치기로 빈 줄의 위치를 확인하고 실제 마우스 클릭으로 커서를 놓았습니다. 모델/편집 API를 직접 호출하거나 DOM input 이벤트를 합성하지 않았습니다.

다운로드 버튼이 만든 redo Blob은2,805,904바이트, SHA256 `158ca31d949e4cb3ac9e1a746998be94e99e276b25937aa354b0c46988ade883`입니다. normal/-O 독립 전체 XML/비대상 ZIP·잘못된 기대값 거부가 통과했습니다. undo Blob은179,730바이트, SHA256 `1e00b54e1139515258260a657217e0b3baa0b1b652a2cd28dd4b9bc48aa262fe`로 원본 파일 SHA와 일치했습니다. 브라우저 오류 목록은 비어 있었고 소유 브라우저/서버를 종료했습니다. 캡처는 같은 후보 폴더의 browser-empty/window/typed/redone.png입니다. 한 문서의 실제 클릭·입력·저장 Blob이며 OS 다운로드 파일이나 모든 문서의 브라우저 완료가 아닙니다.

첫 Blob 검사 assay는 Node 기본 동기 입력 파이프로 Python을 호출해 최적화 실행의 음성 대조에서 EOF 대기했습니다. 정확히 소유한 Python 자식만 종료했고 SIGTERM을 통과로 인정하지 않았습니다. 기존 oracle-process 파일 기반 stdin으로 재실행한 결과만 성공 근거입니다.

독립 검사기는 `tools/hwpx-metadata-only-run-oracle.py`로 분리해 공개 API 회귀와 브라우저 Blob 검사가 재사용합니다. 현재 범위는 두 실제 원본의section0/5번이며 임의 메타데이터 문단의 범용 oracle가 아닙니다. normal/-O self-test는 정상1개와 잘못된 입력문자·비대상 payload 변경·쪽번호 속성 변경·컨트롤 제거·추가 t·중복 ZIP 항목의6개 반례를 검사합니다. 원문/기대 트리/출력 전체 비교를 줄이거나 원문을 보정하지 않습니다.

후속 `'metadata only text collection'` 집중 검사는1/1 exit0입니다. max_sites=0의 LimitExceeded, collect와 변경 없는 writer의 모든 할당 실패 정리·원문 불변, 성공 시 빈 missing_text 사이트1개와 byte-exact 저장을 확인했습니다. 이 테스트는 앞서 기록한 후보의 코어와 같은 정책이며 전체 source gate와 합산하지 않습니다.

이전 장시간 실행의 핸들과 임시 로그가 사라져 최종 결과를 입증할 수 없었습니다. 해당 실행을 성공으로 세지 않고 현재 코어에서 정규 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`을 재시작했습니다. 로그는 `zig-out/verification/metadata-text-sites/native-full.log`에 보관합니다. 이 실행 시작 뒤 위 할당 회귀가 추가됐으므로 그 집중 결과를 별도 기록하며 전체 검사에 자동 포함됐다고 가정하지 않습니다. 코어 정책은 실행 중 추가 변경하지 않았습니다.

`zig test src/field_scope_regression_test.zig -O ReleaseSafe --test-filter 'metadata only page number'`는 수정 전1/1 실패를 재현하고 수정 후1/1 통과했습니다. 입력·재열기/재저장과 입력 전체 삭제 후 원본 byte-exact 복원을 검사합니다. `'metadata only run text binding'` 필터는 필드·그림·unknown ctrl·쪽번호 뒤 opaque 텍스트에 사이트를 만들지 않는 네 반례를1/1 통과했습니다.

metadata-text-sites 후보 SHA256 `d3bbada08ceca03791f2b870ffef315b6206933f02de1b50f6676b1d05b78210`는 ReleaseSafe build6/6 exit0입니다. `HWPJS_TEST_WASM=/absolute/metadata-text-sites/bin/hwpjs.wasm node --test tests/hwpx/metadata-only-run-reference.test.mjs tests/hwpx/field-exterior-inline-reference.test.mjs`는2/2 exit0입니다. 실제 두 쪽번호 문단과 앞선 네 하이퍼링크 문단의 저장·재열기·undo 원문/redo 수정본 및 normal/-O 독립 전체 XML/비대상 ZIP·잘못된 기대값 거부·원본 파일 불변을 확인했습니다. 독립 검사기는 원문의 유일한 ctrl/pageNum 앞에 t 하나를 추가한 기대 트리와 전체 출력 트리를 비교합니다.

`HWPJS_TEST_WASM=/absolute/metadata-text-sites/bin/hwpjs.wasm node --test --test-concurrency=1 tests/hwpx/metadata-only-run-canvas.test.mjs`는2/2 exit0(실패/skip0)입니다. 실제 두 원본의0-based4번 문단이 빈 문자열과 plainEditable=true로 Canvas projection에 존재하고, 컨트롤러 선택·beforeinput/input→Worker/WASM→현재 문자열·저장·undo 원문/redo 수정본을 확인했습니다. DOM/Canvas는 대역이며 실제 브라우저 입력이나 원본 조판 검증이 아닙니다. 로그는 `zig-out/verification/metadata-text-sites/canvas-metadata.log`입니다.

코어 수정과 회귀 파일은 아직 로컬입니다. 제품 WASM 승격·최신 전체 native/public 검증·모든 메타데이터 종류의 실제 파일·문단 구조 split/merge·실제 브라우저는 별도 검증이 필요합니다. 이전 field-inline-exterior 의존 회귀는 이 수정 이전 바이너리이며 최종 로그도 없어 이 정책의 전체 검사로 사용하지 않습니다. 관련 잔여 필드 범위와 입력 거부 분류는 [끝 마커 없는 필드 범위](hwpx-unmatched-field-scope.md)가 소유합니다.
