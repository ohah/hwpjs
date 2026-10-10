# 준비된 신규 표의 HWPX 저장

## 저장 위치·빈 노드 경계 후속 검사

2026-10-11 `created_table_save_edges_tests.zig`를 root에 등록해 집중 ReleaseSafe6/6·exit0(root+새5검사)을 확인했습니다. 실제 charshape에 Unicode prefix를 먼저 적용한 시작/중간/끝 삽입, 현재 생성 문단 host와 같은 점의 두 표 생성 순서, 실제 table.hwpx의 빈 셀/self-closing run에 중첩 표 삽입을 저장·재열기 host marker/셀 텍스트로 대조했습니다. 중첩 표 재열기의 cell bindings5개도 확인했습니다.

원본을 수정하지 않은 메모리 파생본에서는 모든 host t를 빈 t로 만든 분기, 첫 t의 CDATA/주석/PI 분기, 미확인 id 속성 분기를 검사했습니다. CDATA/주석/PI의 나머지 텍스트와 markup을 보존했고, 복제하면 위험한 id는 UnsupportedCreatedTableHostAttributes로 거부해 registry0·원문 저장 byte-exact를 유지했습니다. 첫 파생 테스트는 첫 t만 바꾸고 문단 전체가 비었다고 잘못 기대해 실패했습니다. 여러 run/t가 있는 실제 문단을 기준으로 파생/기대값을 수정한 최종 결과만 통과로 계수합니다. fmt/diff·별도 prefix `/tmp/hwpjs-created-table-save-edges-20261011` ReleaseSafe build도 exit0입니다.

위 증거는 native 재열기/현재 위치 검사이며 모든 양식/모든 위치·독립 oracle의 전수 확장·현재 Session 셀 projection·public UI·원본 조판 완료는 아닙니다. 아래 경계 전수 미검증 표현은 이 추가 범위까지만 갱신되며 독립 XML/ZIP 검사기의 기존 한2×2 사례는 별도로 유지합니다. 기본 WASM은 변경하지 않았습니다.

최종 소스 재빌드 후 같은 prefix의 산출물은 SHA256 `0ef20bb069a33f62eee05452b18742c277a1d49bafde499aaff67f0f6c5fc4d6`입니다. 공개4파일을 다시 실행해16/16·fail/skip0·exit0(2862.516041ms)을 확인했습니다. 아래6e4b4c11은 이전 후보 실행 기록이며 두 결과를 합산하지 않습니다.

공개 기존 편집/이력/도형 배치4파일도 후보 `/tmp/hwpjs-created-table-save-20261011/bin/hwpjs.wasm`, SHA256 `6e4b4c11ce05dbc147e3625639040918775f86b25b712033e13cb1259e046f8f`에서16/16·fail/skip0·exit0(2963.950625ms)을 확인했습니다. 신규 표의 public 삽입 검사로 합산하지 않습니다.

`created_table_section_save`는 기존 모든 현재 텍스트/구조/서식·객체 변경을 직렬화한 임시 section 트리에서 host의 현재 문단 순번과 UTF-16 점을 찾습니다. 원본 Session 트리는 변경하지 않습니다. 선택된 text-site의 앞/뒤를 기존 XML text writer로 작성하고 원래 run/text QName과 검증된 속성을 재사용해 그 사이에 모델 파생 표 fragment를 넣습니다. CDATA·빈 t/run·run 경계와 같은 site의 여러 표를 처리하는 분기를 두며, 같은 점은 registry 생성 순서입니다. 현재 검사 증거는 아래 실제 텍스트 host 사례이며 이 모든 분기 전수 검증은 아직 아닙니다.

실제 텍스트 site를 가상 경계보다 우선하고 같은 점의 유효 site 중 뒤쪽을 선택합니다. 복제하는 run/t의 속성은 charPrIDRef 및 namespace·xml:space/lang으로 제한하며 미확인 identity 속성을 복제하지 않습니다. 기존 앵커는 기존 정책을 재사용하고 필드/미지원 컨트롤 host는 아직 거부합니다. 대상 문단의 기존 linesegarray는 삭제해 오래된 줄 배치를 새 표의 정확한 배치로 사용하지 않습니다. 나머지 source span과 ZIP payload를 보존하되 XML 선언/어휘 전체 byte-exact·한글 재조판 완료를 주장하지 않습니다.

Session.save가 이 경로를 새 ZIP replacement에 포함하며 이전 UnsupportedCreatedTableSave 게이트를 제거했습니다. stage는 registry swap 뒤 실제 save 적합성까지 검사하고 실패하면 이전 registry로 되돌립니다. 본문/분할/병합 등의 앵커 rebase 게이트와 public WASM 미지원은 그대로입니다. 저장은 반복해도 중복 삽입하지 않으며 별도 수정 가능한 XML 캐시를 만들지 않습니다. 현재 Session의 일반 문단/객체 projection은 신규 셀을 아직 노출하지 않아, public 삽입/API/Worker/UI 완료가 아닙니다. 문서 전체 ID/리소스 참조 검증·HWP5 신규 표 저장도 후속입니다.

2026-10-11 root staging 집중4/4·exit0(root+3검사)은 실제 charshape에 표 저장·재열기 새 셀 텍스트 및 기존 editor로 입력·undo 원문/redo 동일 ZIP·늦은 실패 후 redo·예산과 staging/capture 모든 할당 실패를 확인했습니다. 최초 이전 저장 거부 기대의 실행은 새 save 성공에 대해 TestExpectedError·미해제 반환 버퍼가 발생해 실패했고 통과로 계수하지 않습니다. 기대를 실제 저장/재열기/명시적 버퍼 해제로 바꾼 최종 실행은 leak/error 없이 exit0입니다.

`created_table_save_survey.zig`의 한 실제2×2 저장본을 별도 `hwpx-created-table-save-oracle.py`로 검사했습니다. 전체 비대상 ZIP payload·목록/순서·CRC, 표/셀 주소·폭51/50·높이17·문단/서식 ID·Unicode/CR, 생성 표를 제거하고 분리 run을 합친 전체 비대상 XML 의미와 대상 줄 캐시 삭제를 대조합니다. 검사기 비교는 prefix 어휘/압축 raw byte가 아닌 XML 의미 및 ZIP payload 범위입니다.

공개 oracle 테스트1/1·fail/skip0·exit0(1476.318875ms)이며 일반/-O 유효본과7변조(텍스트/ID/치수/비대상 XML/추가 요소/헤더/목록)의 정확한 ValueError 종류를 확인했습니다. 최초 느슨한 오류 검사 통과 뒤 변조기 CR 정규화와 JS/Python escape 오류를 발견해 수정했고, SyntaxError 같은 도구 오류를 성공으로 계수하지 않습니다. 재현은 `HWPJS_TEST_ZIG=/absolute/zig HWPJS_TEST_ZIG_CACHE=/absolute/cache node --test tests/hwpx/created-table-save-oracle.test.mjs`입니다. surrogate/일반 위치 경계의 전체 삽입·복수/nested/빈 host·독립 재열기 편집 및 GUI 전수는 아직 별도입니다.

ReleaseSafe build·fmt/diff도 exit0이며 기본 데모 WASM은 변경하지 않았습니다. 후보와 현재 작업 트리의 회귀를 깨끗한 게시 전체/native/브라우저 검증에 소급하지 않습니다.
