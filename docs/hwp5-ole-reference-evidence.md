# OLE 참조 ID의 대응 증거

[그리기·개체 계약](hwp5-drawings-contracts.md)

## 현재 경계

OLE payload 파서와 직접 부모·개수 검사는 구현되어 있지만 ID의 참조 의미는 `pending_references`로 남아 있습니다. 명세 4.3.9.5 표 118의 BinData ID와 4.2.3 표 17의 저장 ID가 항상 같은 값이라는 규칙은 정의되어 있지 않습니다. 이 조사는 참조 의미를 구별하는 표본 증거이며 제품의 기본 정책을 바꾸지 않습니다.

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
