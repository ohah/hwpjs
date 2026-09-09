# PrvImage 형식 조사와 미완료 검증 범위

## 근거와 현재 경계

HWP 5.0 명세 3.2.7은 루트 `PrvImage` 스트림을 BMP 또는 GIF라고 설명합니다. 로컬 원문은 `legacy/rust/.claude/skills/hwp-spec/3-2-7-미리보기-이미지.md`입니다. 실제 표본에 PNG와 JPEG도 있으므로 명세의 두 이름만으로 다른 이미지를 손상으로 판정하거나 BMP로 강제 해석하지 않습니다.

현재 `container/validation.zig`는 `PrvText`는 검사하지만 `PrvImage`는 소비하지 않으며, 해당 스트림은 `uninspected_streams`에 남습니다. 기존 BinData 이미지 선택은 DocInfo가 참조하는 BinData에만 적용됩니다. 이 조사 도구를 추가해도 제품 지원 범위·바이트 예산·JS ABI는 바뀌지 않습니다.

`tests/hwp5/preview-image-evidence.mjs`는 시그니처 관측·정확한 루트 조회·집계의 책임을, `preview-image-survey.mjs`는 파일 입력과 출력의 책임을 소유합니다. HWP 헤더는 식별용 접두부와 주 버전 5만 확인하며 전체 헤더·문서 검증으로 세지 않습니다. 이미지 시그니처가 일치해도 `imageValidated=false`이고, 픽셀·GIF LZW·PNG CRC·JPEG 엔트로피를 검증했다는 뜻이 아닙니다.

조사는 strict CFB를 사용합니다. 관측된 InvalidFat/InvalidUnusedEntry/InvalidRoot만 CFB 거부로 집계하고, 새로운 파서 오류·WASM trap·JS TypeError/RangeError는 실행 실패로 전파합니다. lookup 오류를 CFB 거부로 잡지 않습니다. CFB 서명이 아닌 파일은 별도 `non_cfb`이며, 확장자만으로 HWP5라고 단정하지 않습니다. 암호화·배포용 등의 플래그도 원값을 보고할 뿐 문서 지원 성공으로 바꾸지 않습니다.

CFB API의 `type=2,size=0` 항목은 content 속성이 생략될 수 있습니다. 스트림 부재와 구분해 empty로 집계하고 `contentPresent`를 보존합니다. 비어 있지 않은 스트림의 데이터 누락이나 크기 불일치는 조사 오류입니다. storage 항목은 invalid_kind이며 자식의 같은 이름을 루트 대신 찾지 않습니다. 공개 어댑터의 입력별 반환 표현 차이는 Buffer 입력으로 명시적으로 고정합니다.

## 재측정 결과

아래 두 디렉터리의 직접 자식 `.hwp` 파일만 조사했습니다. 재귀 탐색·symlink 추적·외부 다운로드는 하지 않았습니다. SHA-256은 파일과 이미지 각각 중복을 분리하는 용도이며, 이미지 원문이나 내부 링크 경로를 로그에 출력하지 않습니다.

제품 기준 커밋은 `474cba7393acc51b58fe3af03303af92b365d569`, reference/rhwp HEAD는 `e8800c8def63449808a4092798442652ed460552`입니다. reference의 모든 표본이 Git 추적 파일이라는 뜻은 아니므로 실제 입력별 해시도 조사 JSON에 남깁니다. `/tmp/hwpjs-preview-image-survey.json`의 순서 있는 `{file,sha256}` 행 배열을 JSON.stringify한 SHA-256은 `57d0bf2f4b922d328b02aeaaa0fa7f14e562dd84e99330440b45e3ca0e412107`입니다.

- `legacy/rust/crates/hwp-core/tests/fixtures`
- `reference/rhwp/samples`

2026-09-09 실행에서 파일 발생 336개, 고유 파일 331개였습니다. strict CFB를 통과하고 HWP5 식별 접두부가 관측된 파일은 295개, CFB 거부 17개, CFB 서명이 아닌 파일 24개입니다. 295개 중 해당 암호화/배포용/DRM 플래그를 가진 파일이 6개입니다. 이 수치를 일반 HWP 전체 검증 통과 수로 읽지 않습니다.

| PrvImage 관측 | 파일 발생 수 | 스트림 크기 범위 |
|---|---:|---:|
| GIF89a 시그니처 | 133 | 1,169–7,453바이트 |
| PNG 시그니처 | 158 | 4,502–647,951바이트 |
| JPEG SOI | 1 | 123,728바이트 |
| 빈 스트림 | 1 | 0바이트 |
| 루트 항목 부재 | 2 | 해당 없음 |

이미지 스트림 293개의 고유 바이트열은 빈 스트림 포함 249개입니다. BMP/GIF87a/잘못된 항목 종류는 이 범위에서 관측되지 않았으며 미지원·불가능이라는 뜻은 아닙니다. JPEG 사례는 `software.hwp`입니다. 버전 9종(0x05000107, 0x05000204, 0x05000300, 0x05000302, 0x05000304, 0x05000400, 0x05000500, 0x05010001, 0x05010100)을 관측했지만 버전만으로 이미지 포맷을 자동 결정하는 규칙을 만들지 않습니다.

원시 조사 때 content 부재를 잘못된 항목 종류로 의심했으나, 재현 결과 0바이트 스트림의 기존 JS 계약이었습니다. 제품 버그로 세지 않고 조사 코드를 수정했습니다. 또한 Uint8Array writer 출력과 Buffer 파일 입력에서 공개 API의 content 표현이 달라지는 점을 실제 CFB 테스트로 확인해 입력을 고정했습니다.

기본 회귀의 fixture 48개만 분리하면 GIF 14·PNG 32·JPEG 1·부재 1이며 고유 미리보기는 45개입니다. reference 직접 자식은 288개이고, 그중 247개에서 HWP5 접두부를 관측했습니다. CFB 거부 17개는 InvalidFat 11·InvalidUnusedEntry 3·InvalidRoot 3으로 나뉩니다. 이 거부는 현재 strict 정책의 결과이며 파일 손상 또는 파서 결함의 원인을 확정한 조사가 아닙니다.

## 다음 구현 요구사항

[GIF 색인 프레임 코어](gif-indexed.md)의 블록/LZW/인터레이스 구현·실측은 별도 계약으로 분리했습니다. 아래 전체 요구사항 중 일반 텍스트 의미·합성·PrvImage 연결은 여전히 남아 있습니다.

PrvImage 전체 검증은 아직 미완료입니다. 아래 요구사항을 완료 증거 없이 지원으로 승격하지 않습니다.

1. GIF87a/89a 공통 계층: 헤더·전역/지역 팔레트·이미지/확장/하위 블록 경계, LZW와 interlace 복원, 그래픽 제어의 적용 범위, 출력·프레임·작업량 제한, 정확한 종료/잘림 검증. [CompuServe GIF89a 원문(W3C 보관)](https://www.w3.org/Graphics/GIF/spec-gif89a.txt)을 기준으로 하며, 특히 사전이 가득 찼다고 임의 초기화하지 않는 deferred clear 규칙을 검사해야 합니다. 애니메이션 합성과 렌더링은 프레임 복호화와 구분합니다.
2. HWP 컨테이너 연결: 정확한 루트 조회, 독립 이미지 한도와 전체 문서 바이트 한도, BMP/GIF 명세 경로 및 실제 PNG/JPEG 경로, 빈/미지원/손상 입력의 구분, 오류 시 보고서/소비 상태의 원자성. BinData 압축 정책을 PrvImage에 추정 적용하지 않습니다.
3. 독립 픽셀 대조와 실파일 연결: 이번 시그니처 집계를 픽셀 일치의 증거로 재사용하지 않으며, BMP/GIF87a/다중 프레임 등 실표본이 없는 조합은 생성 fixture임을 명시합니다.

## 검증

별도 명령은 [개발·검증 명령](development-commands.md)의 PrvImage 조사 절을 따릅니다. 구체적인 표본 수는 관측치이며 변경 가능한 외부 reference 디렉터리에 고정된 통과 조건으로 강제하지 않습니다.

자동 테스트 5개는 서명별 모든 접두부 잘림·한 바이트 오염, 앞쪽 쓰레기, 대소문자, 부재/빈 데이터/잘못된 종류, 실제 CFB 루트·중첩·대소문자 조회, 미확인 헤더와 지원 외 플래그, trap/호스트 오류 전파, 중복 파일/이미지 집계를 통과했습니다. `zig build preview-image-audit --summary all`은 8/8 단계로 종료 코드 0을 확인했습니다. 정규 audit에 조사 테스트와 기본 fixture 조사를 연결했습니다.

Debug 제품 WASM을 사용하는 격리 JS 소스에 서명 비교 무시·잘못된 루트·빈 스트림 조건 변경·trap 삼키기·새 오류 삼키기·파일 중복 무시·이미지 중복 무시·플래그 손실·검증 완료 오표시·content 존재 손실의 10종 변형을 넣었습니다. 모두 5개 테스트가 실제 실행됐고, 실패 수는 순서대로 4/2/2/1/1/1/1/1/1/1개였습니다. 문법/import 실패가 아니라 기대값 또는 오류 전파 불일치로 검출했습니다. 근거는 `/tmp/hwpjs-preview-image-evidence-mutants.6CRTFp/`의 변형별 로그입니다.

전체 audit를 Debug → ReleaseSafe → ReleaseFast 순서로 실행하여 각 모드 23/23 단계·944/944 네이티브 테스트·기존 HWP/WASM 검사 7,835,179개를 통과했습니다. 새 조사 테스트 5개와 기본 fixture 조사도 세 모드 모두 성공했습니다. 실행 셸 종료 코드 0을 확인했으며 로그는 `/tmp/hwpjs-preview-image-evidence-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 HWP/WASM 검사 횟수에 새 조사 결과를 임의로 더하지 않았습니다.

최종 `zig build test --summary all`은 5/5 단계·944/944 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 모두 종료 코드 0입니다. 관련 문서 3개의 로컬 링크 22개, 변경 JS의 구문 검사, build.zig 포맷과 diff 검사를 확인했습니다. 제품 GIF/PrvImage 검증과 전체 문서 검증은 여전히 미완료입니다.
