# PrvImage 컨테이너 검사

## 계약

`src/hwp5/container/preview_image.zig`는 선택한 루트 미리보기 스트림의 조회·크기 한도·소비 상태를 소유합니다. `container.validation.Options.preview_image`는 기본 null이며, 선택하지 않으면 기존 미검사 스트림 집계가 유지됩니다. 선택한 경우 보고서의 absent/empty/inspected/unhandled를 구분합니다. `inspected`는 선택 코덱의 검사 성공이지 전체 렌더링 의미의 검증 완료가 아닙니다.

조회는 기존 CFB `findExact`를 사용합니다. 루트 상대 계층과 CFB 이름 비교 규칙을 따르므로 대소문자 변형을 허용하되 하위 폴더 basename 검색으로 대체하지 않습니다. 잘못된 항목 종류는 오류입니다. 원문 3.1·3.2.7에 따라 PrvImage에는 문서 압축 플래그를 적용하지 않습니다.

호출자는 `images`, `empty`, `unhandled` 정책을 명시합니다. 빈 입력과 미지원 입력은 각각 preserve/reject를 선택합니다. preserve는 스트림을 소비하지만 이미지 검증 성공으로 표시하지 않습니다. 미지원 코덱과 손상된 선택 코덱을 혼동하지 않습니다. 선택 코덱의 오류는 다른 디코더로 재시도하거나 unhandled 성공으로 바꾸지 않습니다. 부재·빈 스트림은 코덱을 호출하지 않으며 이미지 선택 옵션의 유효성도 검사하지 않습니다.

스트림은 자체 max_bytes와 남은 전체 문서 바이트 한도를 모두 만족해야 합니다. BinData와 미리보기는 서로 독립적인 이미지 예산을 갖습니다. 기존 `container/images.zig`가 PNG/JPEG/BMP/GIF 선택과 코덱 호출을 소유하며, PrvImage는 별도 형식 판별기를 갖지 않습니다. 모든 정책·디코더 검사가 성공한 뒤에만 문서 잔여 바이트와 used 표시를 갱신합니다. 반환 보고서는 스칼라만 보유하며 CFB 입력과 이미지 버퍼를 참조하지 않습니다.

## GIF 연결

`container/gif_images.zig`는 [GIF 코어](gif-indexed.md)의 옵션을 재사용하고 스칼라 결과 집계만 담당합니다. 프레임·색인 바이트·LZW 코드의 이미지별 한도와 누적 한도 중 작은 값을 적용합니다. 디코더 소유 버퍼는 호출자에게 반환하기 전에 해제됩니다. 모든 집계 필드의 덧셈은 오버플로를 검사합니다.

`images.Options.gif`의 기본은 null입니다. 기존 PNG → 선택 JPEG → 선택 BMP의 우선순위 이후 GIF를 검사합니다. UTF-16 gif 힌트 또는 GIF 접두부로 선택하므로 미지원 GIF 버전도 명시적 오류가 됩니다. 실패 시 전체 이미지 보고서를 유지합니다. 프레임 합성·애니메이션·일반 텍스트와 응용 확장 의미는 여전히 별도 미완료 영역입니다.

## 검증 기록

네이티브 테스트에 반복 참조의 세 가지 독립 누적 한도, 이미지별 한도, 전체 필드 오버플로, 잘림·미지원 버전, 할당 실패 주입, ReleaseFast에서도 활성인 명시적 할당 회계를 추가했습니다. PrvImage 테스트는 루트/중첩/대소문자/종류, 빈 입력/미지원 입력 정책, 소비 원자성, 문서 압축 플래그, CFB 입력 해제 후 보고서 수명을 검사합니다.

2026-09-12 중간 검증: `zig test src/root.zig --test-filter 'HWP GIF' -O <mode>`는 Debug/ReleaseSafe/ReleaseFast 각각 6/6(root 포함), `--test-filter PrvImage`는 각각 5/5(root 포함) 통과했습니다. `zig build test --summary all`은 5/5 단계·963/963 테스트, 종료 코드 0입니다. 첫 실행의 블록 수 기대값은 트레일러를 포함하도록 고쳤고, OOM 주입은 한도 검사 중 선행 할당 실패를 전파하도록 고쳤습니다. CFB 이름 조회의 대소문자 동등 규칙도 테스트에 반영했습니다.

추가 중간 검증: 테스트 전용 mode 296은 기존 코덱 선택 프리픽스와 이미지 보고서 직렬화를 재사용하며, 기존 모드의 출력은 변경하지 않습니다. 입력 프리픽스는 문서 한도 포함 108바이트, 출력은 기존 컨테이너 보고서 뒤 280바이트입니다. 선택/상태/저장 크기 12바이트, 기존 이미지 보고서 212바이트, GIF 스칼라 56바이트 순입니다. probe의 limit 인수는 기존과 같이 문서 레코드 한도이며 출력 크기 한도가 아닙니다.

`tests/hwp5/preview-image.mjs`는 세 WASM 모드에서 각각 생성 대조 93개·의도적 거부 196개를 통과했습니다. GIF 스칼라는 독립 문자열 사전 JS oracle로 대조하며, PNG/JPEG/BMP는 기존 코덱별 차등 테스트를 재사용합니다. 문서 바이트/미검사 스트림 변경은 기존 테스트 wire 도우미로 검증합니다. 별도 디코더 구현 없이 제품 보고서를 기대값으로만 복사하는 검사로 해석하지 않습니다.

기본 실제 HWP 48개 중 현재 문서 경로가 지원하는 45개에서 모두 inspected 상태를 확인했습니다. 암호화·배포용·DRM 비트(2|4|16|256|1024)를 가진 3개는 전체 문서 검사 대상에서 제외합니다. 동일한 45개 경로를 정규 audit에 추가했습니다. 이 제외를 해당 파일의 raw 미리보기 코덱 미지원으로 해석하지 않습니다.

세 WASM 모드 각각 보고서 출력 1,620바이트를 한 바이트씩 변조해 모두 검출했습니다. 빈/미지원/다중 프레임 입력이 포함되며, RuntimeError를 정상 입력 오류로 오인하지 않는 검사도 통과했습니다. 실행 WASM은 `/tmp/hwpjs-preview-probe.wasm`, `/tmp/hwpjs-preview-{ReleaseSafe,ReleaseFast}-probe.wasm`입니다.

격리 소스 변형 9종(누적 색인/코드/프레임 잔여 한도 무시, GIF 해제 누락, 실패 전 used 표시, 소비 바이트 차감 누락, 빈 입력 정상 판정, 미지원 입력 정상 판정, 집계 오버플로 무시)을 세 모드에서 검사했습니다. 각 변형은 테스트 10개(root 포함)를 실행했고 실패 수는 순서대로 1/1/1/3/2/3/2/1/1개였습니다. 컴파일 실패가 아니라 실제 테스트 실패로 모두 검출했습니다. 근거는 `/tmp/hwpjs-preview-mutants.qf4Iai/{name}-{Debug,ReleaseSafe,ReleaseFast}.log`입니다. 해제 누락은 ReleaseFast에서도 OOM 검사 할당자의 699바이트 할당/578바이트 해제 불일치 등으로 MemoryLeakDetected를 반환했습니다. 이 변형 실행에서는 OOM 검사가 먼저 실패하므로 뒤의 별도 DebugAllocator 회계까지 실행되었다고 주장하지 않습니다.

전체 audit를 Debug → ReleaseSafe → ReleaseFast 순서로 실행하여 각 모드 23/23 단계·963/963 네이티브 테스트·7,840,706개 HWP/WASM 검사를 통과했습니다. 순차 실행 셸 종료 코드 0을 확인했습니다. 로그는 `/tmp/hwpjs-preview-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 앞선 [실파일 시그니처 조사](hwp5-preview-image-evidence.md)와 GIF 코어의 픽셀 대조 결과를 이 연결의 검증 완료 증거로 대체하지 않습니다. 이번 연결 검증을 전체 이미지 의미·전체 HWP/HWPX 문서 모델·편집·저장 완료로 확대하지 않습니다.

최종 `zig build test --summary all`은 5/5 단계·963/963 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 모두 종료 코드 0입니다. 관련 문서 6개의 로컬 링크 79개, 변경 코드 포맷·JS 구문·diff 검사를 확인했습니다. PrvImage 조회/소비, 이미지 선택/예산, GIF 복호화의 책임을 각각 기존 계층에 유지하며 AGENTS/README에 상세 계약을 중복하지 않았습니다.
