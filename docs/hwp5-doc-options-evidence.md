# DocOptions 조사와 미확정 경계

## 명세와 현재 처리

HWP 5.0 3.2.8과 로컬 `legacy/rust/.claude/skills/hwp-spec/3-2-8-문서-옵션.md`는 `_LinkDoc`의 역할을 연결 문서 경로 저장이라고 설명하지만 필드 배치·인코딩·길이·종결·패딩은 정의하지 않습니다. DRM·인증서·서명 관련 6개 스트림도 역할 설명만 있습니다. 3.1의 압축 표시는 사용 안 함입니다.

현재 제품은 DocOptions 의미를 검사하지 않으며 해당 스트림은 uninspected로 남습니다. CFB 원본을 통한 보존과 필드 검증 완료를 구분합니다. 경로를 열거나, 전체 바이트를 NUL 종결 문자열로 해석하거나, 일반적인 길이를 필수 규칙으로 강제하지 않습니다.

## 확장 표본 조사 — 2026-09-12

제품 HEAD `d871c60aa34ac84187ae5278f37132f60f267f5e`, reference/rhwp HEAD `e8800c8def63449808a4092798442652ed460552`에서 조사했습니다. [PrvImage 조사](hwp5-preview-image-evidence.md)의 336개 직접 자식 파일 inventory를 사용하고, 각 원본 SHA-256을 다시 확인했습니다. 17개 strict CFB 거부와 24개 non-CFB는 DocOptions 관측 대상에서 제외한 상태이며 원인 판정을 대신하지 않습니다.

나머지 295개에서 DocOptions 스토리지와 `_LinkDoc`를 관측했습니다. 다른 6개 명세 스트림과 미지 직접 자식은 관측되지 않았습니다. `_LinkDoc` 합계는 154,080바이트, 고유 바이트열은 211개입니다. 길이 524바이트가 294개, 24바이트가 1개였고 전체 0인 스트림은 36개였습니다. 첫 16비트 단어가 0이 아닌 것은 1개, 첫 0 단어 이후에도 비영 바이트가 남는 것은 259개였습니다. 파일 발생 횟수와 고유 바이트열을 구분합니다.

24바이트 사례는 `reference/rhwp/samples/hwpers_test4_complex_table.hwp`이며 첫 단어는 1입니다. 그러나 rhwp의 `mydocs/tech/archive/hwpers_analysis.md` 2026-02-10 기록은 hwpers v0.5.0 생성 파일이며 한컴에서 손상으로 판정됐다고 보고합니다. 이는 이번에 한컴으로 재검증한 결과가 아니고, 손상의 원인이 DocOptions라고 확정한 것도 아닙니다. 이 표본을 정상 24바이트 배치의 증거로 사용하지 않습니다.

rhwp `src/parser/hwpx/contract_streams.rs`는 변환 시 `_LinkDoc` 대응 데이터가 없으면 blank2010에서 추출한 524바이트 자산을 넣습니다. 정적 자산의 재사용은 필드 배치 검증의 증거가 아닙니다. 첫 단어 0만 보고 빈 경로로 판정하면 다른 바이트를 놓칠 수 있다는 기존 경계를 유지합니다.

## 관측 도구와 미확정 경계

`tests/hwp5/doc-options-evidence.mjs`는 구조·길이·단어/비영 바이트 분포만 관측하며 fieldsValidated=false를 반환합니다. 경로나 문자열을 만들지 않습니다. 기존 optional-survey가 이 계산을 재사용합니다. `hwp-corpus-evidence.mjs`가 SHA-256·CFB 열기/오류 분류·헤더 식별·스트림 바이트 확인을 소유하며 PrvImage와 DocOptions 조사가 재사용합니다. 파일 입력은 별도 `doc-options-survey.mjs`에 두었습니다.

이 단계의 관측 확대는 파서 구현 완료가 아닙니다. 정상 한컴에서 연결 문서를 설정한 전후 파일 쌍 또는 필드 배치를 설명하는 추가 근거가 필요합니다.

## 재현한 결함과 검증 기록

SSOT 검토에서 이름 비교 중복의 결함을 실제 생성 CFB로 재현했습니다. CFB 명세 비교는 `DocOptionſ`를 `/DocOptions`로 조회하지만 JS toLowerCase로 다시 검색하면 MissingDocOptionsSnapshot을 반환했습니다. 스토리지 인덱스는 CFB 조회 결과의 원래 이름과 정확히 대응시키고, 알려진 자식도 각 CFB 조회가 반환한 원래 이름 집합으로 집계하도록 수정했습니다. `DrmLicenſe`까지 포함한 생성 CFB 회귀를 추가했습니다. 한컴 표본에서 이 이름을 관측했다는 뜻은 아닙니다.

관련 테스트 15/15(DocOptions 6·공통 관측 4·PrvImage 5)가 통과했습니다. 빈 입력과 0 채움, 짧고 홀수인 입력, 524 외 길이, 0 단어 뒤 비영 데이터, 정렬·little-endian·부분 뷰, 원본 불변성, 루트/항목 종류·미지 자식, trap/미분류 오류 전파, 종료 시 close를 검사합니다.

수정본의 소스 변형 13종은 빈 입력/전체 0 혼동, big-endian, 비정렬 단어 탐색, 부분 뷰 무시, 0 이후 데이터 무시, 검증 완료 오표시, trap 분류 생략, 미분류 오류 수용, close 생략, 누락된 비어 있지 않은 스트림을 빈 데이터로 대체, 미지 자식 집계 제거, 스토리지/자식의 JS 소문자 비교 복원입니다. 변형마다 테스트 10개를 실행하여 실패 수 1/1/1/1/2/4/1/1/3/2/2/1/1개로 모두 검출했습니다. 실제 CFB 테스트의 JS 어댑터 import만 격리 폴더에서 원본 절대 경로로 연결했으며 조사 로직은 각 격리본을 사용합니다. 로그는 `/tmp/hwpjs-doc-options-v2-mutants.9rQnyu/{name}.log`입니다.

초기 6종 로그(`/tmp/hwpjs-doc-options-mutants.kxzJ9Y/`)와 공유 계층 추출 후 11종 로그(`/tmp/hwpjs-doc-options-final-mutants.h17OAk/`)는 중간 이력이며, 최종 수정본의 근거는 위 13종 결과입니다. `/tmp/hwpjs-doc-options-survey-v2.json`의 336개 행 전체가 수정 전 조사 JSON과 동일하고, 파일 목록·SHA-256도 기존 inventory와 일치함을 확인했습니다.

첫 전체 audit(`/tmp/hwpjs-doc-options-{Debug,ReleaseSafe,ReleaseFast}-audit.log`) 실행 도중 이름 비교 결함을 수정했으므로 이 실행은 최종 판정에서 제외합니다. 종료 코드 0을 확인한 뒤 수정본을 고정하여 전체 audit를 Debug → ReleaseSafe → ReleaseFast 순서로 다시 실행했습니다. 각 모드 26/26 단계·963/963 네이티브 테스트·7,840,706개 HWP/WASM 검사를 통과했고 순차 실행 셸 종료 코드 0을 확인했습니다. 최종 근거는 `/tmp/hwpjs-doc-options-{Debug,ReleaseSafe,ReleaseFast}-audit-v2.log`입니다. 두 실행을 중첩하지 않았습니다.

최종 `zig build test --summary all`은 5/5 단계·963/963 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 모두 종료 코드 0입니다. 관련 문서 3개의 로컬 링크 26개, Zig 포맷·JS 구문·diff 검사도 통과했습니다. 전체 문서 검증 완료가 아니라 관측 도구·근거 보강의 완료이며 DocOptions 필드 의미는 계속 미확정입니다.
