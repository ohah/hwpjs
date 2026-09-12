# OLE 참조 ID의 대응 증거

[그리기·개체 계약](hwp5-drawings-contracts.md)

## 현재 경계

OLE payload 파서와 직접 부모·개수 검사는 구현되어 있으며 기본 정책은 ID 참조를 `pending_references`로 남깁니다. 후속 선택적 순번 범위 검사는 아래 별도 절에서 관리합니다. 명세 4.3.9.5 표 118의 BinData ID와 4.2.3 표 17의 저장 ID가 항상 같은 값이라는 규칙은 정의되어 있지 않습니다. 이 조사는 참조 의미를 구별하는 표본 증거이며 제품의 기본 정책을 바꾸지 않습니다.

## 전체 표본 재조사

`legacy/rust/crates/hwp-core/tests/fixtures`와 `reference/rhwp/samples`의 재귀 `.hwp` 경로 584개를 제품 strict CFB 및 기존 `observeHwpFile` 분류로 읽었습니다. 중복 내용의 경로를 제거한 수가 아닙니다. HWP5 fingerprint 관측 482개·CFB 거부 73개·비CFB 29개이며 관측 입력 중 보안 플래그 마스크 `2|4|16|256|1024`에 해당하는 7개를 제외했습니다. 남은 DocInfo/BodyText를 Node raw DEFLATE와 기존 레코드 framing 순회로 조사했습니다.

50개 파일 경로에서 OLE 태그 84 레코드 53개를 찾았습니다. 길이 26바이트가 7개, 30바이트가 46개이며 관측26 배치의 u16 ID와 같은 위치의 u32 값이 달라지는 표본은 없었습니다. 따라서 이 데이터만으로 ID의 필드 폭을 판정할 수 없습니다. rhwp `parser/control/shape.rs:parse_ole_shape`는 u32를 읽고 storage ID라고 설명하지만, 그 구현의 기본값 보충이나 미해석 후속 필드를 현재 파서에 이식하지 않습니다.

ID 0은 `task1725/text_footnote_tail_overpagination.hwp`에서 1개 관측했습니다. BinData 항목은 18개이며 이 관측을 무조건 오류 또는 부재로 규정하지 않습니다. ID가 가리키는 DocInfo 항목의 저장 ID가 다른 표본은 아래 한 건입니다.

## HWP/HWPX 짝의 추가 근거

`chart/분산형/곡선이있는분산형.hwp`는 OLE ID 1, DocInfo 항목 순번 1의 storage ID 3입니다. 실제 BIN0001/2/3.OLE 모두 존재하며 내부 차트 설정이 각각 smooth/lineMarker/smoothMarker라서 파일 존재 여부로는 어느 참조가 맞는지 결정할 수 없습니다. 이 반례는 과거 공통 기록과 기존 `ole-reference-evidence.mjs`에서 이미 고정했습니다.

이번에는 같은 이름의 HWPX를 추가 대조했습니다. `version.xml`은 Hancom Office Hangul 및 appVersion `12, 0, 0, 535 WIN32LEWindows_10`을 기록합니다. 이는 파일 메타데이터이며 이 세션에서 한컴 프로그램을 실행했거나 변환 출처 전체를 인증했다는 뜻은 아닙니다.

- HWPX의 `Chart/chart1.xml`과 `BinData/ole1.ole` 내부 `OOXMLChartContents`는 바이트 단위로 같습니다.
- 그 4,119바이트 XML은 HWP의 `BIN0003.OLE` 내부 XML과 같고 BIN0001/2와는 다릅니다.
- XML SHA-256은 `a041d9589ff08bf241eaf47ef2fd558b9f27f4d695158e43c3a20487cae21b8a`입니다.
- 외부 OLE envelope 전체 해시는 HWP/HWPX 사이에 다르므로 전체 바이너리 동일성을 주장하지 않습니다.

이 표본에서는 DocInfo 항목 순번을 거쳐 storage ID 3으로 가는 해석을 뒷받침합니다. 다른 버전·ID 0·외부 링크·다른 개체 종류까지의 보편 규칙으로 확장하지 않습니다. 제품의 pending 값은 유지합니다.

## 회귀 테스트

`ole-paired-evidence.mjs`는 이미 테스트에 사용하는 MIT `legacy/cfb.js`로 고정 HWPX의 ZIP 항목을 읽고, 제품 CFB로 내부 컨테이너를 strict 검사합니다. 새 실행 프로그램이나 제품 HWPX 의존성을 추가하지 않습니다. HWPX가 없는 환경은 명시적으로 skipped를 반환합니다.

`pairedTarget`은 HWPX chart와 embedded XML의 일치·비어 있지 않음·HWP 후보의 유일한 일치를 검사합니다. 별도 Node 테스트 3개가 정상/후보 순서 변경, 누락/모호성/빈 XML/불일치 거부, 선택 XML의 모든 바이트 변조 검출을 통과했습니다. 실제 짝 대조도 storage ID 3과 위 해시를 확인했습니다. 기존 내부 CFB 검사기의 수명은 try/finally로 닫도록 보강했습니다.

실제 표본의 ID 3만 기대하는 편향을 막기 위해 ID 1/2/17/65535와 후보 순서 반전도 검사합니다. `/tmp/hwpjs-ole-pair-mutants.UQvGlF`의 별도 소스 복사본에서 반환 ID를 3으로 고정, embedded XML 대조 생략, 유일성 검사 생략, XML 첫 바이트만 비교하는 네 변형을 실행했습니다. 모두 테스트 실패·종료 코드 1로 검출했습니다. 각 변형의 실패 테스트 수는 1/1/2/2이며 import/구문 오류가 아닌 assertion 또는 예상하지 않은 TypeError 검출입니다.

실제 HWP의 읽기 전용 조회 결과를 바꾼 두 실험도 검사했습니다. BIN0003 대신 BIN0001을 반환해 일치 후보를 없앤 경우와 BIN0001 대신 BIN0003을 반환해 후보를 중복시킨 경우 모두 AssertionError로 거부했습니다. 각각 거부 후 원본으로 다시 검사하여 storage ID 3 및 원래 보고서가 복원됨을 확인했습니다. 파일 자체는 수정하지 않았습니다.

변경 소스·테스트를 고정해 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. `/tmp/hwpjs-ole-paired-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·982/982 네이티브 테스트·HWP/WASM 7,840,996회 검사를 통과했고 종료 코드 0을 확인했습니다. 실제 paired 결과의 storage ID 3 및 위 XML 해시도 출력에서 확인했습니다. 추가된 Node 비교 assertion은 HWP/WASM 호출 수와 별개이며 검사 횟수를 인위적으로 늘리지 않습니다. 변경 파일 포맷·JS 구문·공백과 변경 문서의 로컬 링크 5개 검사도 통과했습니다.

최종 `zig build test --summary all`은 5/5 단계·982/982 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0). 이 단계는 참조 해석의 증거 보강이며 제품의 모든 OLE 참조 해결 완료가 아닙니다.

## 선택적 순번 범위 검사

문서 옵션 `ole_references`는 기본 uninspected와 명시적 observed_ordinal을 구분합니다. `body/ole_references.zig`가 정책·집계를 소유하고 양수 ID의 범위 계산은 기존 DocInfo `reference_rules.resolve(.one_based, ...)`를 재사용합니다. 선택하지 않거나 개수가 없으면 미검증으로 남기며 선택한 범위 초과는 InvalidOleBinaryReference입니다. ID 0은 실제 표본에서 관측했지만 부재/오류 의미가 확정되지 않아 zero_ids로 집계하고 pending을 유지합니다. 실패한 범위 검사는 누적 통계를 변경하지 않습니다.

`ole_validation.inspectDetailed`는 기존 소유권·payload 검사를 재사용해 OLE 보고서와 참조 보고서를 함께 반환합니다. 기존 inspect는 uninspected wrapper로 유지합니다. 문서 구역은 실측 BinData 항목 수와 선택 정책을 전달하고, 기존 OLE 보고서와 별도 `ole_references` 보고서를 보유합니다. ordinal_references는 항목 범위 검사이며 실제 저장 경로 해결·콘텐츠 검사·외부 링크 접근 완료가 아닙니다.

초기 네이티브 검증은 기존 OLE 테스트와 정책 조합·실패 시 통계 보존 테스트를 포함해 root 포함 5/5 통과했습니다. 이후 두 payload 배치에서 파싱된 ID와 비영 테두리 색을 분리하는 연결 테스트를 추가했습니다. 문서·CFB·WASM 및 적대적 검증 결과는 아래 절에서 관리합니다. 위 982개 전체 검증은 이전 증거 보강 커밋의 결과이지 이 후속 소스 변경의 결과가 아닙니다.

### 문서·CFB 연결 보강

비공개 WASM mode 303은 정책 u8·버전 u32·배치 u8·BinData 개수 u32(0xffffffff는 미제공)·본문을, 304/305는 정책 u8 뒤 기존 decoded/CFB 입력을 받습니다. 출력은 기존 OLE 7개 u32와 참조 진단 4개 u32이며 304/305는 구역 수와 구역별 보고서를 반환합니다. 기존 serializer와 공개 제품 JS API는 변경하지 않습니다.

`ole-reference-policy.mjs`는 순번/저장 ID가 다른 차트, `한셀OLE.hwp`, 실제 ID 0을 가진 task1725 표본을 사용합니다. 원본 또는 메모리 복사본의 ID를 0/1/개수/개수+1/65535로 바꾸고 독립 본문·decoded·재생성 CFB에서 결과를 대조합니다. Debug WASM에서 정상 21/21/27건과 오류 12/12/12건을 확인했습니다. 기본 정책은 기존 pending을 유지하고 선택 정책만 양수 범위를 검사합니다. 잘못된 정책·레코드 한도 1 부족도 거부하며, 오류 후 원본 검사로 복구를 확인합니다. 정상 집계는 한도 정확 일치 검사도 포함합니다.

별도 네이티브 문서 테스트는 BinData 항목 순번 1/storage ID 3과 두 구역을 생성해 역순 입력으로 전달합니다. 정상·ID 0·뒤쪽 구역의 범위 오류 및 모든 OOM 주입을 검사하고, 명시적 allocator 잔량도 0인지 확인합니다. Debug/ReleaseSafe/ReleaseFast OLE 필터는 각각 root 포함 7/7 통과했습니다. 세 모드 실제 WASM도 각 정상 69건·오류 36건을 통과했습니다.

### 소스·출력 적대적 검증

별도 복사본 /tmp/hwpjs-ole-reference-mutants.ictrcH에서 범위 오류를 성공으로 변경(range), 선택된 ID 0을 검사 완료로 변경(zero), 선택 시 Tree 해제 생략(leak)의 세 변형을 각 빌드 모드에서 실행했습니다. range와 zero는 각 모드의 테스트 4개가 실패했고 leak는 각 모드 명시적 allocator 잔량 2,240바이트를 검출해 실패했습니다(누수 검사 panic으로 인한 ABRT 포함). 절대 소스 경로를 사용했으며 제품 소스는 변형하지 않았습니다.

선택된 순번 참조 보고서를 대상으로 mode 303의 44바이트, 304/305의 각 48바이트를 한 바이트씩 XOR 1 하는 실제 WASM 응답 변형을 실행했습니다. 세 모드 각각 140/140 검출했습니다. InvalidOleBinaryReference를 같은 메시지의 WebAssembly.RuntimeError로 바꾼 경우도 정상 거부로 세지 않고 실패했습니다.

소스·테스트를 고정해 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. /tmp/hwpjs-ole-reference-{Debug,ReleaseSafe,ReleaseFast}-audit.log에서 각 모드 27/27 단계·986/986 네이티브 테스트·HWP/WASM 7,841,134회 검사가 통과했고 종료 코드 0을 확인했습니다. 이는 선택된 순번 범위 검사의 구현·검증이며 저장 경로 해결·내부 OLE 형식 전체 검사·ID 0 의미 확정·모든 버전 지원 완료를 뜻하지 않습니다.

최종 zig build test --summary all은 5/5 단계·986/986 테스트, zig build -Doptimize=ReleaseSafe --summary all은 5/5 단계로 통과했습니다(종료 코드 0). 변경 파일 포맷·JS 구문·공백과 변경 문서의 로컬 링크 1개 검사도 통과했습니다.
