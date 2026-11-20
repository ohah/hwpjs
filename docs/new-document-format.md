# 새 문서 바이트 생성

`src/new_document/root.zig`의 일반 `hwp5(a)`·`hwpx(a)` factory와 명시 HWP5 호환 profile용 `hwp5WithProfile(a, profile)`은 새 문서 버퍼를 만든다. 결과는 호출자가 같은 할당자로 해제하는 독립 버퍼다. 생성은 기존 문서·픽스처·파일시스템·설치 글꼴·시계·사용자 정보 없이 메모리에서 수행한다. ABI 및 Core 연결은 별도 경계가 소유한다.

`src/new_document/defaults.zig`가 두 형식의 작성 정책을 소유한다. A4 세로는 1/7200인치 단위로 반올림한 `59528×84189`, 사방 여백은 20mm(`5669`), 머리말·꼬리말 여백은 10mm(`2835`)다. 본문은 빈 문단 하나, 바탕글/Normal 스타일, 함초롬바탕 11pt, 장평·상대 크기 100%, 줄 간격 160%, 왼쪽 정렬, 40pt 기본 탭이다. 7개 언어 그룹은 각각 글꼴 ID 0을 명시하고 스타일 언어는 한국어 1042, HWPX 언어는 `ko-KR`다. 요청 글꼴을 선언하며 설치 여부를 검사하지 않는다. 이 값은 새 문서의 명시적 정책이며 기존 리더의 누락 필드 대체값이 아니다.

HWP5 일반 factory의 후속 기본 profile은 **5.0.3.0**이다. `src/new_document/hwp5_profile.zig`가 version·mapping·CharShape·ParaShape 크기를 함께 소유한다. 16개 ID 매핑(64바이트, memo count0), 74바이트 글자 모양(border ID0·독립 취소선 색0 포함), 54바이트 문단 모양(attributes3=0·현대 줄 간격160 포함)을 작성한다. 기존 legacy factory 바이트 계약은 명시 `.legacy_5_0_1_7` profile(15개/60바이트 mapping, 68바이트 CharShape, 46바이트 ParaShape)로 보존하며 별도 canonical factory 전체 바이트 비교가 필요하다. 기존 입력 파일의 버전·필드를 자동 변경하는 경로는 없다. 압축 플래그는 0이고 기존 레코드 인코더와 CFB writer를 재사용한다. 루트에는 `FileHeader`, `DocInfo`, `BodyText/Section0`만 있으며 작성자·요약 정보·사용자 데이터·미리보기·스크립트·이력 스트림을 추가하지 않는다. CFB의 CLSID·상태·생성/수정 시각은 0이다. 본문 첫 문단의 `secd`·`cold` 비표시 제어와 마지막 CR을 포함한 원시 텍스트는 17 UTF-16 유닛이다. 보이는 텍스트 길이는 0이다. 구역/용지 정의는 해당 제어의 자식 레코드이며 줄 배치 캐시는 작성하지 않는다.

HWPX는 `mimetype`, `version.xml`, `META-INF/container.xml`, `Contents/content.hpf`, `Contents/header.xml`, `Contents/section0.xml`, `settings.xml`의 7개 항목을 작성한다. OPF manifest가 header/section/settings를 연결하고 spine은 header와 한 section을 지정한다. `version.xml`의 OWPML 버전은 5.0.1.7, XML 버전은 1.5다. 정적인 문서 식별자·애플리케이션 식별자는 사용자 식별자가 아니다. 작성자·날짜·외부 리소스를 넣지 않는다. 글꼴 속성은 기존 XML 인코더를 사용한다.

새 생산용 `src/zip/store_writer.zig`의 `write(a, sources, options)`는 기존 ZIP 교체 writer와 별개로 새 ZIP32 STORED 패키지를 만든다. 입력을 빌리고 반환 바이트를 소유한다. 항목 이름·UTF-8·중복·ZIP64 한계·전체 바이트 예산을 검사하며 CRC32를 작성한다. `mimetype`는 첫 로컬 항목이고 비압축·extra 없음이다. ZIP 날짜는 실행 시각과 무관한 형식상 고정 epoch인 1980-01-01, 시간은 0이며 확장 시각·주석은 없다. 기존 합성 테스트 ZIP helper를 제품에서 import하거나 수정하지 않는다.

첫 문단 Enter는 `section_prefix_split.zig`가 알려진 `secd`·`cold` 접두만 처리한다. 두 앵커 뒤에서 나눌 때 원본 구역/용지 및 알려진 주석 모양·쪽 테두리 자식 바이트를 왼쪽에 보존한다. 오른쪽은 일반 텍스트 문단이고 제어 하위 트리를 복제하지 않는다. 접두 내부 위치·다른 제어·불투명 레코드·확장 꼬리·중복 정의·다른 소유자는 거부한다. 일반 생성 문단의 헤더는 제거된 구역/단 제어 비트 2만 지우며 다른 비트와 왼쪽 원본은 보존한다. 기존 공유 저장 writer의 동작을 새 생성자 안에 복제하지 않는다.

검증 진입점은 `src/new_document_probe.zig`다. 독립 CFB/ZIP/XML 리더를 통한 메타데이터·리소스 참조·결정성·버퍼 소유권, ZIP 변경/복원, Native 열기/읽기/삽입/저장/재열기, 빈 문단 Enter 및 undo/redo, 제어 하위 트리의 정확한 보존, 잘못된 헤더·불투명 제어 거부와 할당 실패 정리를 준비한다. 초기 작업은 **소스 준비만** 수행하며 컴파일·Native·브라우저·SDK·배포 성공을 뜻하지 않는다. 메인 담당이 실행 슬롯을 승인한 뒤 이 진입점을 검증하고 정규 root에 연결한다.

기준 HEAD는 `39c8a4a18cf82df67f7134a1bec404ad685d710c`이며, preimage·변경 목록·SHA와 세 차례 소스 검토는 ignored `zig-out/verification/table-range-new-document-r1/`에 보관한다. 실행 검증 결과는 실제 실행 이후 별도로 기록한다. 주제 인덱스 연결과 최종 커밋·푸시·두 데모 배포는 메인 담당 범위다.

2026-11-06에는 기준 커밋의 `src`와 담당 변경 13개 파일만 격리하여 `zig test src/new_document_probe.zig -OReleaseSafe -j1 --test-filter 'new document'`를 실행했다. 포맷 정리 후 최종 소스에서 **14/14 pass, fail/skip 0, 종료 0**이었다. 12개 기능 계약과 2개 import 진입점이며 이전 성공 실행과 중복 합산하지 않는다. HWP5/HWPX의 빈 문서 읽기·한글/이모지 삽입·첫 빈 문단 Enter·저장/재열기·undo/redo, 독립 CFB/ZIP/XML 메타데이터·리소스 검사, 할당 실패, 구역/단 자식 바이트 보존 및 음성 검사가 실제 통과했다. wall 48.263초, 합산 최고 RSS 2,635,056KiB, guard 발동 없음, 소유 PGID 최종 잔류 0이었다. 첫 두 컴파일 오류와 수정 뒤의 성공 로그를 모두 보존한다. 이는 집중 Native 증거이며 전체 코어·최종 ABI/SDK·브라우저·두 데모 배포 검증을 대신하지 않는다.


## 현대 신규 HWP5 후속의 근거와 미실행 gate

공식 한컴 revision1.3 PDF SHA256 `1d1da9e6fe22563ae2c5285bbbfc6762974fb7f002278084cbc11e5266bdc782`의 표15–18·33·43–46·58·129를 직접 대조했다. 표33의 전체 길이72 표기와 필드 폭 합 `68+2+4=74`는 원문 모순이다. 필드 자체를 추측해 보충하거나 삭제하지 않고 명시된 border2/strike4의 순서·버전 조건을 적용한다. 자체 strict reader의 border offset68/strike offset70/독립색 크기74는 별도로 대조한 제품 계약이며 공식 원문의 오기를 해결했다는 주장이 아니다. 참조 markdown의 구현 주석은 구현 근거가 아니다.

5.0.3.0은 독립 취소선 색이 정의되는 최소 지원 버전으로 선택한다. 5.0.3.2부터인 mapping track-change/author와 paragraph merge-tracking 필드는 아직 작성하지 않는다. 5.1의 문단 level 확장도 작성하지 않는다. paragraph header22, section control ID4+속성26, language1042, PageDef40, column과 font/style 정책은 같은 필드 체계다. BinData는 표17–18에 해당하는 리소스를 아직 만들지 않으므로 mapping count0이며 가짜 ID/스트림을 생성하지 않는다.

기본 factory는 Native/ABI→Core·JS→CLI/MCP·UI 신규 문서의 공통 경로다. default 전환의 채택 조건에는 기존 신규 문서의 빈 본문·Enter·선택·한글/이모지·undo/redo/save/reopen, 생성 H5 표·이미지·용지 설정 및 수식 조회 회귀가 포함된다. 빈 문서의 수식0 조회와 실제 수식이 있는 원본의 표시·조회는 다른 gate다. HWPX factory 정책은 이 변경 대상이 아니다. 명시 legacy 프로필은 독립색 요청을 계속 거부하고 바이트/History/기존 redo를 보존해야 한다. 기존 원본문서에 독립색 필드가 없을 때의 guard도 유지한다.

현대 profile의 source-only 후보에는 구조/리소스/History/거부/OOM 회귀를 작성했으며 **현대 writer Native 실행0·일반 SDK0·interop0**이다. 이전 2026-11-06의14/14는 옛 factory의 별도 실제 증거로 보존하며 새 profile에 승계하지 않는다. 별도 명시 실행 grant 뒤 canonical legacy 전체 바이트 동치 및 현대 생성/수정/저장/재열기를 검증해야 한다. 공식 한컴 호환 gate는 기존 empty5.0.1.7이 수용된 공개 제품 경로와 같은 경로에서 새5.0.3.0 열기1, 실제 독립색 서식값, 저장·재열기를 관측하는 것이다. 자체 Native green만으로 외부 한글 호환 완료를 선언하지 않는다.

## 2026-11-20 격리 통합 준비와 증거 범위

별도 narrowemit3 후보에서 같은 현대 factory/구역 소스 후상을 사용하여 blank·text·빈2×2 table을 실제 생성·재열기·이력 검사하고 exclusive 저장했다. Main은 그 세 파일의 실제 CLI Markdown 읽기 성공을 확인했다고 전달했다. 이 증거는 정규 Web/Core 생성이나 실제 한글 수용의 증거가 아니다. 이전 본문의 소스 준비/실행0 표기는 해당 과거 준비 단계의 기록이다.

새 scoped canonical 후속은 tree63268d1f873a5985d195233b1678665dc7993279에 현대 생성19경로를 전상 정확 대조 후 격리 통합하며, 기본 생성 진입점의 계약은 [새 문서 명령](new-document-command.md)이 소유한다. canonical 후보의 새 WASM·정상 SDK·브라우저 실행은 아직 하지 않았다. 명시 legacy·기존 문서 무업그레이드·공식 명세26/observed28와 쪽 테두리 표시12/필드14의 구분을 유지한다.
