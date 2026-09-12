# 배포용 문서 본문 선택 조사

## 확인한 문제

배포용 문서 지원은 UnsupportedDistribution만 제거하는 작업이 아닙니다. 현재 컨테이너는 BodyText를 DocInfo 구역 수와 대조한 뒤 ViewText를 같은 수의 보조 뷰로 검사합니다. 실제 배포용 표본에는 BodyText 1구역과 ViewText 6구역이 있어 이 계약을 그대로 적용할 수 없습니다.

기본 컨테이너 지원 게이트는 유지합니다. 이 문서는 조사와 정책 연결 진행 기록이며 배포용 문서 전체 지원 완료를 뜻하지 않습니다.

## 재현과 관측

tests/hwp5/distribution-policy-evidence.mjs는 기존 distributionSamples 네 파일 목록을 재사용합니다. strict CFB로 읽고 모든 ViewText 구역을 Node BigInt 키 유도·AES·zlib 오라클과 Zig mode 99로 대조합니다. 파일과 해제 구역 SHA-256을 반환하며 파일이나 CFB를 쓰지 않습니다.

문서 의미 검사 경계를 분리하기 위해 **테스트용 헤더 사본에서만 distribution 비트를 제거**해 기존 decoded mode 24에 공급합니다. 원본 헤더와 CFB 헤더가 그대로인지 검사합니다. 이 진단은 원래 플래그의 컨테이너 지원을 증명하지 않으며 제품에서 비트를 지우는 구현으로 채택하지 않습니다. 원본의 배포 플래그 3개 파일은 mode 25에서 정확한 UnsupportedDistribution으로 거부됨을 함께 확인합니다.

| 표본 | flags | BodyText 구역/바이트/레코드 | ViewText 구역/바이트/레코드 |
|---|---:|---:|---:|
| 20250130-hongbo-no.hwp | 5 | 1 / 512 / 11 | 1 / 15,540 / 306 |
| 20250130-hongbo.hwp | 1 | 1 / 15,540 / 306 | 1 / 15,540 / 306 |
| 한글문서파일형식_5.0_revision1.3.hwp | 131077 | 1 / 521 / 11 | 6 / 885,120 / 27,159 |
| issue5756/156732409_superscript_advance.hwp | 5 | 1 / 521 / 11 | 1 / 30,378 / 706 |

6구역 표본에서 DocInfo 선언 구역 수는 6이며, BodyText 진단은 SectionCountMismatch,전체 ViewText 진단은 통과했습니다. 6개 ViewText의 해제 크기는 순서대로 2,142 / 23,134 / 4,745 / 849,154 / 3,401 / 2,544바이트입니다. 종전 배포 디코더 실파일 검사는 이 파일의 Section0만 대조했으나 이번에는 전체 6개를 포함한 총 9개 스트림으로 확장했습니다.

5e724236의 standalone Debug/ReleaseSafe/ReleaseFast WASM에서 오라클 바이트 대조와 진단 검사 모두 종료 코드 0입니다. 첫 기대값 작성에서 6구역 파일 BodyText 크기를 529로 잘못 적어 assertion이 실패했고, 실제 해제 길이 521을 확인해 테스트 기대값만 수정했습니다. 제품 파서 수정이나 오류 허용 확대는 없습니다.

## 명세와 참조 구현의 차이

로컬 hwp-spec 4.2.13은 모든 스트림에 배포 데이터가 들어간다고 설명하지만 네 표본의 DocInfo와 BodyText는 일반 raw DEFLATE로 해제됩니다. 관측을 명세 전체의 대체 규칙으로 일반화하지 않습니다.

참조 rhwp HEAD e8800c8def63449808a4092798442652ed460552의 parser/mod.rs:parse_sections_strict는 배포 플래그일 때 DocInfo 구역 수만큼 ViewText raw를 제한된 경로로 읽고 복호화합니다. ViewText가 없으면 BodyText로 대체하지 않습니다. 반면 cfb_reader.rs:read_body_text_section 구형 공개 helper에는 BodyText fallback이 남아 있으므로 helper 하나만 보고 현재 문서 열기 정책을 판단하지 않습니다. 비배포 문서에서 ViewText를 우선 시도하고 실패 시 BodyText로 되돌리는 rhwp 정책도 존재하지만, 이를 현재 hwpjs의 실패 후 재시도 금지 계약에 그대로 섞지 않습니다.

## 연결 계약과 검증 요구

- 원본 헤더와 암호화/DRM 거부를 보존하면서 배포용 관측 정책을 명시적으로 선택합니다. 기본 거부는 유지합니다.
- primary 구역 소스 선택을 별도 책임으로 분리합니다. 배포용 선택에서는 ViewText 수를 DocInfo와 대조하고, 보조 BodyText에 같은 수를 강제하지 않습니다.
- 공통 section_set을 통해 primary 의미 검사를 수행하며 기본 ViewText 보조 검사와 중복 소비/이중 해제를 피합니다.
- DocInfo·Scripts·BinData의 디코딩은 스트림 역할에 따라 정책을 전달해야 합니다. 전역 플래그 삭제나 실패 후 다른 디코더 재시도는 하지 않습니다.
- 부족한 ViewText, 잘린 envelope, CRC 오류, 공유 한도, 보조 BodyText 보존/검사 상태, 원본 헤더 반환 및 실패 경로의 소유권을 필수 검증 항목으로 두며 아래 결과에 기록합니다.

조사와 컨테이너 연결 테스트는 정규 audit에 연결했습니다. 범용 배포용 포맷 전체 지원과 이번 관측 정책의 검증을 구분합니다.

## 지원 정책 기반 분리

src/hwp5/feature_policy.zig가 버전·암호화·DRM·배포 플래그 지원 검사를 소유합니다. Distribution 정책은 reject/observed_viewtext 두 값이며 기존 stream.requireSupported와 decode는 기본 reject를 유지합니다. 명시적 stream.decodeWithPolicy는 관측된 일반 스트림의 압축 비트만 적용하며 ViewText envelope를 자동 복호화하지 않습니다.

container/view_stream.decodeWithPolicy는 선택된 배포 플래그에서 반드시 배포 envelope 디코더를 호출합니다. 일반 압축 스트림 fallback이나 CRC 실패 후 재시도가 없으며, 비배포 문서의 기존 시그니처 선택은 유지합니다.

document.Options.distribution을 명시적으로 선택한 decoded 문서 검사는 원래 헤더로 진행하고 반환 보고서에도 원본 256바이트를 유지합니다. 기본 decoded 검사는 계속 UnsupportedDistribution입니다. decoded 진입점에서는 호출자가 이미 선택·해제한 primary 구역에 적용하며, 컨테이너 연결은 아래 별도 단계에서 수행합니다.

전용 테스트는 플래그 조합 64개 × 정책 2개, 버전 거부 우선순위, 일반 스트림의 소유 복사·정확한 한도, 원본 헤더 반환과 모든 할당 실패, ViewText 정상 envelope·잘못된 태그·CRC 오류·독립 암호문/출력 한도를 검사합니다.

최종 전용 테스트는 Debug/ReleaseSafe/ReleaseFast 각각 5/5(root 포함), 전체 zig build test는 5/5 단계·974/974 테스트로 통과했습니다(각 종료 코드 0). 격리 사본 /tmp/hwpjs-distribution-policy-mutant.NvnchU에서 observed_viewtext 선택 직후 암호화/DRM 검사를 건너뛰도록 변형하자 Debug 전용 테스트가 UnsupportedEncryption 대신 성공을 받아 실패했습니다(5개 중 1개 실패, 종료 코드 1). 작업 트리에는 변형을 적용하지 않았습니다. 이후 WASM 연결과 정규 audit 결과는 아래 단계에 기록합니다.

## 컨테이너 primary 연결

container/primary_sections.zig는 정책 확인·정확한 primary 저장소 선택·해제 버퍼 소유권을 담당합니다. 배포 플래그와 observed_viewtext 선택이 함께 있으면 ViewText가 필수이며 DocInfo 구역 수는 이 primary 구역들과 대조합니다. 비배포 문서의 BodyText 경로는 유지합니다. 헤더 비트를 삭제하거나 구역 수를 맞추기 위해 보조 BodyText를 복제하지 않습니다.

컨테이너 Report.primary_source는 body_text/distribution_viewtext를 구분합니다. 배포용 primary의 의미 보고서는 Report.document가 소유하며, Report.view_text는 같은 구역의 framing 수치만 나타냅니다. 보조 의미 보고서인 view_text_semantics는 null입니다. view_text_semantics 정책을 strict_document_rules로 설정해도 이미 검사한 primary에 중복 적용하지 않습니다. Report.document와 view_text에 표시된 동일 레코드를 전역 예산에서 두 번 차감하지 않습니다.

보조 BodyText는 이 정책에서 해제·의미 검사하지 않고 uninspected_streams에 남습니다. 원본 CFB에는 유지되지만, 반환 scalar 보고서 자체가 원본 스트림을 소유하지는 않습니다. DocInfo는 명시적 일반 스트림 정책, Scripts는 아래 실파일 조사에서 보완한 배포 envelope 정책, BinData는 기존 항목별 압축 정책에 배포 허용 여부를 전달합니다. 기존 decode/inspect 래퍼는 reject 기본값을 유지합니다.

합성 CFB는 DocInfo 6구역·역순 ViewText 6구역·해석하지 않는 BodyText 1스트림·배포 envelope로 감싼 Scripts/JScriptVersion으로 구성합니다. 성공과 후속 PrvImage 실패의 모든 할당 실패 및 명시적 할당 회계를 검사합니다. primary 선택, 원본 flags 5 반환, Scripts 소비 8바이트, 보조 스트림 미검사 1개, ViewText 부재 거부, 기본 배포 거부, 정확한 총 바이트/레코드 한도와 1 부족을 확인합니다. DocHistory 검사를 선택한 상태에서도 primary ViewText를 이중 차감하지 않는지 검사합니다.

컨테이너 연결 후 기존 전체 네이티브 테스트는 974/974로 통과했고, 새 전용 테스트의 첫 Debug 실행은 4/4(root 포함)입니다. 이 수치는 새 전용 테스트 추가 전 전체 실행과 구분합니다. 후속 실파일 WASM·BinData 처리·소스 변형·정규 audit 결과는 아래에 별도로 기록합니다.

새 전용 테스트를 포함한 최종 전체 네이티브 실행은 5/5 단계·977/977 테스트로 통과했습니다. 전용 테스트는 Debug/ReleaseSafe/ReleaseFast 각각 4/4(root 포함), 모두 종료 코드 0입니다. 세 모드의 전체 audit와 새 정책의 실파일 WASM 검증을 완료한 것은 아닙니다.

## 실파일 Scripts 누락 재현과 수정

첫 새 WASM 연결 실행은 배포용 3개에서 InvalidDeflate로 실패했습니다. 스트림별 원시 시그니처와 독립 Node 해제를 확인하니 세 파일 모두 JScriptVersion과 DefaultJScript에 태그 28 envelope가 있었습니다. 크기는 308/308바이트, 6구역 명세 예제는 308/420바이트입니다. 비배포 대조군은 기존 일반 압축 인코딩입니다. 따라서 일반 스트림으로 전달하던 초기 Scripts 정책을 수정했습니다.

scripts/stream.zig는 원본 배포 플래그와 선택 정책에 따라 배포 디코더를 호출합니다. DocInfo의 일반 스트림 정책과 구분하며 실패 후 fallback하지 않습니다. 컨테이너의 max_script_ciphertext_bytes(기본 64 MiB)는 ViewText 암호문 한도와 별도입니다. 전역 해제 바이트 한도도 유지됩니다. 합성 fixture도 Scripts envelope로 수정하고 정확한 암호문 48바이트 한도 통과·47바이트 거부를 추가했습니다.

비공개 WASM mode 298은 정책 u8 + 기존 컨테이너 입력을 받고 기존 보고서 뒤 primary_source u32를 덧붙입니다. mode 299는 정책 u8 + 기존 decoded 입력으로 원본 헤더의 primary 의미 보고서를 반환합니다. 공개 JS ABI는 바꾸지 않습니다.

distribution-container.mjs는 독립 오라클로 모든 ViewText와 Scripts를 해제하고, 인메모리 대조 CFB에서 ViewText를 BodyText로 옮기며 원래 BodyText는 보조 저장소로 유지합니다. 헤더 비트 변경은 대조군에만 적용하고 기대 보고서의 flags는 원본 값으로 대조합니다. 원본 정책 경로의 결과를 이 대조군과 바이트 단위로 비교합니다. 정규 검사에서 원본 헤더를 지우는 구현은 없습니다.

수정 후 Debug WASM에서 네 파일의 보고서가 각각 1,064 / 1,064 / 5,064 / 1,064바이트로 일치했습니다. 전체 해제 소비량은 570,694 / 586,234 / 1,106,070 / 105,188바이트, 미검사 스트림은 3 / 2 / 3 / 3개입니다. 원본 플래그 유지·기본 배포 거부·정확한 총 바이트/레코드 한도·1 부족·잘못된 정책·오류 후 복구도 통과했습니다. 이 검사를 정규 audit에 연결했으며 Safe/Fast 및 후속 검증 결과는 아래에 기록합니다.

Scripts 수정 후 전용 네이티브 테스트는 세 모드 각각 4/4(root 포함), 전체 네이티브는 5/5 단계·977/977 테스트로 재통과했습니다. ReleaseSafe standalone WASM에서도 위 네 실파일 보고서와 한도·오류 복구 결과가 Debug와 일치했습니다.

ReleaseFast standalone WASM도 동일 검사 결과와 종료 코드 0을 확인했습니다. 이 결과는 세 모드 실파일 연결 검증이며, 정규 audit·소스 변형·게시 게이트는 별도로 관리합니다.

## 손상 스트림과 이력 예산 보강

distribution-container-edges.mjs는 원본 20250130-hongbo-no.hwp의 ViewText/Section0, Scripts/JScriptVersion, Scripts/DefaultJScript를 각각 변형합니다. 0/259/260바이트·끝 1바이트 잘림, 잘못된 태그, 독립 재암호화한 CRC 오류, 일반 레코드로 대체, 빈 해제 결과를 정확한 오류로 거부합니다. ViewText 저장소 부재·잘못된 구역 인덱스·암호화/DRM 비트 추가도 거부합니다. 매 오류 후 원본 보고서 전체를 재확인합니다.

정상 envelope 재인코딩 3건, 보조 BodyText 내용 변경·저장소 이름 변경 2건은 원본과 같은 보고서로 통과합니다. 이 정책에서 보조 BodyText는 검사 대상이 아니며 fallback 입력으로 사용하지 않음을 확인하는 대조군입니다. 세 standalone WASM 모드 각각 대상 스트림 3개·성공 5건·거부 30건, 종료 코드 0입니다. 정규 audit에도 연결했습니다.

이력 예산 테스트를 실제 VersionLog0의 시작/끝 2레코드·16바이트로 확장했습니다. primary 레코드 수 + 2의 정확한 한도는 통과하며 1 부족은 LimitExceeded입니다. 빈 이력 저장소만으로는 ReleaseFast의 잘못된 차감 후 wrapping을 탐지하기 어려워 이 대조군을 추가했습니다. /tmp/hwpjs-distribution-history-mutant.Nt2dES에서 primary ViewText 레코드를 다시 차감하도록 변형하자 ReleaseFast가 부족한 한도를 잘못 허용했고, 새 테스트가 예상 LimitExceeded 대신 성공 보고서를 받아 실패했습니다(2개 중 1개 실패, 종료 코드 1). 정상 코드에는 변형을 적용하지 않았습니다.

보강 후 전용 네이티브 테스트는 Debug/ReleaseSafe/ReleaseFast 각각 5/5(root 포함), 전체 네이티브는 5/5 단계·978/978 테스트로 통과했습니다(각 종료 코드 0).

## 보고서 변조와 trap 검증

각 standalone WASM 모드에서 실파일 검사 호출과 CFB 응답을 기록한 뒤 같은 순서로 재생했습니다. 변경 없는 재생이 통과함을 먼저 확인하고, 첫 배포용 1구역 보고서 1,064바이트와 6구역 보고서 5,064바이트를 각각 바이트별 XOR 1로 독립 변조했습니다. 세 모드 각각 6,128/6,128 변조에서 비교 assertion이 실패했습니다. 예상 UnsupportedDistribution의 Error를 같은 메시지의 WebAssembly.RuntimeError로 치환한 경우도 탐지했습니다. 두 보고서 실험의 trap 주입은 같은 오류 시나리오의 반복이며 서로 다른 두 종류로 세지 않습니다.

이는 기록된 출력에 대한 검사 민감도 검증이며 각 변조마다 WASM을 새로 실행한 퍼징 결과는 아닙니다. 실제 디코딩은 기록 단계에서 각 모드별로 실행했습니다.

## 격리 소스 변형

/tmp/hwpjs-distribution-final-mutants.LWEut0에 현재 src 사본을 만들고 (1) observed_viewtext 선택 시 암호화/DRM 검사 우회, (2) primary 해제 버퍼 deinit 제거, (3) 후속 오류 시 문서 보고서 errdefer 제거를 독립 적용했습니다. 각 변형을 Debug/ReleaseSafe/ReleaseFast에서 distribution 필터 14개 테스트로 실행했습니다. 모드별 실패 수는 각각 1 / 2 / 2이며 총 9개 변형 실행 모두 종료 코드 1로 탐지했습니다. 컴파일 실패가 아니라 TestExpectedError/TestExpectedEqual/MemoryLeakDetected로 실패했고, 전체 변형 실행 스크립트는 종료 코드 0입니다.

ReleaseFast에서도 명시적 할당 회계에 primary 버퍼 1,800바이트와 후속 실패 보고서 9,600바이트가 남는 것을 각각 탐지했습니다. 정상 소스에는 변형을 적용하지 않았습니다. 정규 Debug audit는 이와 별개의 원본 작업 트리 실행입니다.

## 정규 audit와 최종 검증

소스·테스트를 고정해 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. 세 모드 각각 26/26 단계·978/978 네이티브 테스트·HWP/WASM 7,840,885회 검사로 통과했으며 종료 코드 0을 확인했습니다. 로그는 /tmp/hwpjs-distribution-container-{Debug,ReleaseSafe,ReleaseFast}-audit.log입니다. 변경 문서 3개의 로컬 링크 25개와 변경 파일 포맷·공백 검사도 통과했습니다. 최종 제품 빌드와 게시 게이트는 별도로 확인합니다.

audit 이후 최종 zig build test --summary all은 5/5 단계·978/978 테스트, zig build -Doptimize=ReleaseSafe --summary all은 5/5 단계로 통과했습니다(각 종료 코드 0). 이 단계는 명시적으로 선택한 관측 배포용 정책의 구현·검증입니다. 비밀번호/DRM 해제, 미관측 배포 변형, 미지원 payload, HWPX·편집/쓰기·공개 HWP JS API 완료를 뜻하지 않습니다.
