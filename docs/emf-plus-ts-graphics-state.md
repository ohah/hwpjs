# EMF+ terminal-server graphics 소유 상태

## 범위와 단일 출처

`src/image/emf/emf_plus_ts_graphics_state.zig`는 파싱이 끝난 `SetTSGraphics`의 상태 수명주기를 소유합니다. wire 크기·Flags·enum·Palette 검증은 [SetTSGraphics record](emf-plus-set-ts-graphics-record.md)만 담당하며 이 계층은 그 결과의 36바이트 고정부를 값으로 보존하고, 빌린 Palette entry bytes를 allocator 소유 복사본으로 물질화합니다. tracked report에는 빌린 slice 대신 고정부와 Palette entry 수만 담은 값 요약을 노출합니다.

이 상태는 일반 [여덟 graphics property](emf-plus-property-state.md)나 world transform에 병합하지 않습니다. terminal-server TextContrast는 0–12이고 일반 SetTextContrast는 1000–2200이며, FilterType은 일반 InterpolationMode와 다른 enum입니다. WorldToDevice도 일반 world transform과 동일한 상태라는 근거가 없으므로 별도 필드로 보존합니다. 따라서 서로 비슷한 이름을 임의 변환하거나 한 record가 다른 상태를 덮어쓰게 하지 않습니다.

## snapshot과 실패 원자성

`emf_plus_graphics_state_stack.zig`는 현재 terminal-server graphics 상태와 Palette를 소유하고 Save/Container push, stack clone, Restore/EndContainer에서 깊은 복사·복원을 수행합니다. 새 SetTSGraphics를 적용할 때는 replacement를 먼저 완성한 뒤 이전 값을 해제하므로 할당 실패가 기존 상태를 훼손하지 않습니다. 같은 comment의 후속 record가 실패하면 tracked stream의 임시 stack과 report를 폐기해 적용 전 상태로 돌아갑니다.

Palette와 WorldToDevice를 실제 device context나 renderer에 적용하는 기능은 아직 없습니다. Windows가 이 record를 생성하지 않는다고 명시하고 로컬 지원 HWP corpus에도 EMF+ signature 표본이 0개이므로, 합성 wire 검증을 실제 한컴 출력 또는 픽셀 동등성으로 확대해 주장하지 않습니다.

## 검증 기록

단위 테스트는 고정부의 모든 필드, Palette 원본과 clone의 독립 소유, Palette 없는 replacement, Save/Restore, BeginContainerNoParams/EndContainer, stack 전체 clone, malformed 후속 record rollback과 모든 할당 실패를 검사합니다. ReleaseFast에서도 해제 누락을 놓치지 않도록 safety가 켜진 명시적 할당 회계로 snapshot과 replacement의 최종 outstanding bytes가 0인지 확인합니다.

10개 의미 변이(Palette 복사, 두 origin, WorldToDevice, Palette count, state clone, stream 적용, report 연결, replacement, snapshot, deinit)를 실행 직전 cache를 지운 독립 source에서 Debug·ReleaseSafe·ReleaseFast로 검사했습니다. 최종 유효 30/30회가 assertion 또는 expected-error 의미 실패였습니다. 초기 snapshot 변이는 잘못된 치환으로 clone 뒤 값을 버려 누수를 만들었고, 두 번째 실행은 optional unwrap panic이어서 모두 증거에서 제외했습니다. presence assertion을 추가한 세 번째 실행만 snapshot 결함의 유효 결과로 사용했습니다. deinit 변이는 세 모드 모두 명시적 할당 회계 실패로 검출했습니다. 유효 snapshot 로그는 `/tmp/hwpjs-tsgraphics-mutant-snapshot-v3-{Debug,ReleaseSafe,ReleaseFast}.log`, deinit 로그는 `/tmp/hwpjs-tsgraphics-mutant-leak-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,917/1,917 테스트(native 1,878, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 traps는 0입니다. 로그는 `/tmp/hwpjs-ts-graphics-state-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
