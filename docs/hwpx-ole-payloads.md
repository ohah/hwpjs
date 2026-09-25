# HWPX OPF OLE 사본 검사

## 계약

`Document.inspectOlePayloads()`는 OPF `manifest/item`에서 `media-type`의 기본 MIME 토큰이 대소문자와 무관하게 `application/ole`이거나 `href`가 `.ole`로 끝나는 항목을 고릅니다. MIME 매개변수는 후보 판정에서 제외합니다. `isEmbeded="0"`은 **외부 선언**으로 계속 기록합니다. 다만 정확히 같은 이름의 안전한 `BinData/` ZIP 엔트리가 실제로 존재하면, 외부 선언과 별개인 **패키지 내 사본**으로 검사합니다. 외부 URL이나 로컬 파일을 읽지 않으며, 임의의 다른 경로로 대체하지 않습니다. 사본이 없으면 `without_packaged_copy`에 남깁니다. 내장 선언은 기존 OPF→ZIP 바인딩을 따릅니다.

ZIP 바이트는 8바이트 CFB 시그니처가 위치 0이면 raw, 위치 4이면 관측된 4바이트 little-endian 길이 접두부 형식으로 분류합니다. 접두부 값은 뒤따르는 바이트 길이와 **정확히** 같아야 합니다. 두 형식 모두 공통 `src/ole/` 계층에서 strict CFB 구조 검사합니다. 접두부·CFB 오류는 해당 `Target.inspection_error`로 남기며 다른 형식으로 재시도하지 않습니다. 메모리 부족이나 한도 초과는 호출 오류로 전파합니다. OLE 객체 활성화, `Contents` 스트림 의미 해석, 이미지/편집/저장은 하지 않습니다.

CFB 시그니처 상수는 `src/cfb/format.zig` 한 곳에서 읽기·쓰기·HWPX 후보 판정이 공유합니다. 테스트 fixture의 독립 literal은 실제 바이트 대조를 위해 유지합니다.

`max_targets`, 엔트리/총 인코딩 바이트, 내부 CFB 스트림 바이트·엔트리·경로 길이 한도를 적용합니다. `Report.targets`는 OPF 순서의 실제 사본에 대한 인덱스·계수·오류만 소유하고 payload 바이트는 보유하지 않습니다. 검사 중에는 ZIP 엔트리를 해제해 사용하고 즉시 정리합니다. 호출자는 `deinit(allocator)`으로 대상 목록을 해제합니다. `inspectKnown`은 이 보고서를 소유·정리하지만 보고서 성공을 전체 문서 유효성으로 해석하지 않습니다. HWP5의 기존 `src/hwp5/ole/` API는 공통 OLE 계층을 재노출하여 계약을 유지합니다.

직접 `inspectOlePayloads` 호출은 암호화 manifest를 선제 판별하지 않습니다. 보호 여부까지 필요한 호출자는 `inspectProtection`을 먼저 사용하거나 암호 문서를 거부하는 `inspectKnown`을 사용해야 합니다. `inspection_error`가 있는 대상의 내부 스트림은 검증된 것으로 세지 않습니다.

원본 strict 실패를 유지한 채 관측 편차를 **임시 복사본에서만** 바로잡아 내부 구조를 별도로 검사하는 [좁은 정규화 보고서](hwpx-ole-observed-repairs.md)가 추가됐습니다. `normalized` 결과는 원본 CFB의 strict 성공으로 합산하지 않습니다.

## 관측과 검증

2026-09-26 기준 로컬 표본과 코드에서 확인했습니다.

독립 `tools/hwpx-ole-payload-oracle.py`는 Python ZIP/XML, 길이·시그니처, CFB 루트 첫 엔트리 및 파일 밖 FAT 슬롯만 직접 읽습니다. `--self-test`는 외부 선언 내부 사본, 원격 URI 무시, 경로 이탈, 접두부 불일치·미식별 바이트와 루트/FAT 반례를 확인합니다. 인자 없이 실행하면 로컬 두 corpus의 8개 shard별 OPF/ZIP 조사값을 냅니다. `--root-probe`는 비정상 루트의 파일 경로를 출력합니다. 이 oracle은 **전체 CFB 내부를 검증하지 않습니다**. Zig의 `hwpx_known_survey.zig`는 같은 항목/사본/길이 분포와 별도로 strict CFB 결과를 대조합니다.

현 corpus에서는 지원·읽기 가능한 HWPX 476개에서 OLE 후보 99개를 관측했습니다. 65개는 외부로 선언됐지만 동일 경로 ZIP 사본을 갖고 있고, 34개는 내장 선언입니다. 99개 모두 정확한 4바이트 길이 접두부와 CFB 시그니처를 가졌습니다. 34개 내장 선언 사본은 CFB 루트의 생성 시간이 0이 아닙니다. [MS-CFB 2.6.2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/026fde6e-143d-41bf-a7da-c08b2130d50e)는 이 필드가 0이어야 한다고 명시합니다. 또한 그중 14개는 파일 끝 이후 FAT 슬롯에 FREESECT가 아닌 값을 가집니다. strict 검사는 FAT를 먼저 읽으므로 해당 14개는 `InvalidFat`, 나머지 20개는 `InvalidRoot`로 남습니다. 독립 ZIP/바이트 조사와 Zig 결과를 shard별로 대조하며, ZIP 봉투 통과와 strict CFB 통과를 혼동하지 않습니다. 읽기 불가 ZIP 6개와 암호화된 2개는 이 관측에서 제외됩니다. 이 수치는 표본 분포이지 모든 HWPX 버전의 형식 규칙은 아닙니다.

합성·실파일 API·할당 실패 테스트는 `zig test src/root.zig --test-filter 'HWPX OLE payloads'` 및 `--test-filter 'HWPX known inspections retain packaged OLE'`로, 전 corpus 연결은 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 확인합니다. 한 shard나 접두부 oracle만의 성공은 전체 CFB 검사 완료 주장이 아닙니다.

원인별 기대값을 독립 조사에서 고정한 뒤 8개 ReleaseFast shard를 각각 재실행해 8/8 통과했습니다. OLE 단위 테스트 7/7은 Debug·ReleaseSafe·ReleaseFast에서 통과했고, HWP5 공통 OLE 컨테이너 테스트와 CFB writer 왕복도 재확인했습니다. 문서 API 연결의 별도 실파일 테스트도 통과했습니다. 이 결과는 패키지 내 OLE 사본의 선택·봉투·strict 구조 진단까지이며, 위 34개 실패의 내부 스트림 내용이나 전체 문서 의미의 완성은 아닙니다.

공통 시그니처 SSOT 정리 후 `zig build -Doptimize=ReleaseSafe --summary all`과 `zig build audit -Doptimize=ReleaseSafe --summary all`이 종료 코드 0으로 끝났습니다. corpus 8개 shard는 기본 audit에 포함되지 않으므로 위 별도 실행을 유지합니다.

동일 최종 소스로 `zig build test --summary all`도 5/5 단계, 2,503/2,503 네이티브 테스트 통과 및 종료 코드 0을 확인했습니다. 완료 판정은 위 파트의 검사 계약에 한정합니다.
