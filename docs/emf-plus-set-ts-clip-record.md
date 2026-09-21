# EMF+ SetTSClip record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_ts_clip.zig`는 MS-EMFPLUS 2.3.8.1의 EmfPlusSetTSClip record envelope를 소유합니다. Type `0x403A`, Flags의 최상위 C bit와 하위 15비트 NumRects, C별 `Size = 12 + NumRects * (C ? 4 : 8)`, DataSize와 실제 slice를 서로 독립적으로 검사합니다. `emf_plus_ts_clip_rects.zig`만 rectangle delta wire와 누적 좌표를 소유하며 stream은 parser 결과를 집계하고 별도 상태 계층에 전달합니다.

C=1의 각 좌표는 최상위 bit가 1인 signed 7-bit 한 바이트입니다. C=0은 첫 바이트 최상위 bit가 0인 big-endian signed 15-bit 두 바이트입니다. 이는 최상위 bit가 0이면 한 바이트인 일반 EMF+ PointR 압축과 반대이므로 해당 decoder를 재사용하지 않습니다. 네 값은 이전 rectangle의 left, top, right에 대한 delta와 현재 top에서 bottom까지의 delta로 해석하며 첫 rectangle의 이전 좌표는 0입니다. 반환 rectangle은 i32 누적 좌표이고 원본 bytes도 빌려 보존합니다.

공식 문서에는 SetTSClip 전체 record 예제가 없고 Windows는 이 record를 생성하지 않으며 GDI+ 1.1만 지원한다고 명시합니다. 따라서 합성 wire로 검증하며 제3 구현의 C=0 little-endian RectS 해석은 공식 압축 알고리즘과 충돌하므로 oracle로 채택하지 않았습니다.

## 상태 연결과 미지원 경계

tracked stream은 복원된 rectangle을 [소유 terminal-server clip 상태](emf-plus-ts-clip-state.md)로 물질화하고 Save/Container snapshot·report·rollback에 연결합니다. 빈 배열은 empty, 비어 있지 않은 배열은 union geometry 미계산을 나타내는 complex로 분류합니다. 실제 rectangle union, transform 적용, clipping mask와 렌더링은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없으므로 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

두 C 형식의 모든 signed wire 값(7-bit 128개, 15-bit 32,768개), 다중 rectangle 누적과 bottom 규칙, NumRects 0·15-bit 최댓값, marker 반전, 모든 size 축, count 불일치, iterator 실패 원자성, stream count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

적대적 검토는 (1) 공식 Flags·크기식, (2) marker·endian·부호 전 범위, (3) 이전 rectangle 누적과 현재 top 기준 bottom, (4) parser/stream 실패 원자성, (5) SSOT·미지원 범위의 다섯 관점으로 반복했습니다. 20개 의미 변이를 모드별 독립 source와 cache, 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 campaign에서 eager 검증 제거와 stream parser 우회 두 변이가 컴파일 경고로 종료되어 성과에서 제외하고, 컴파일 가능한 변이로 다시 실행했습니다. 최종 60/60회가 assertion 또는 unhandled expected-error 의미 실패였고 생존·컴파일 오류·timeout은 0입니다. 로그는 `/tmp/hwpjs-tsclip-mutants-run2`의 유효 54개와 `/tmp/hwpjs-tsclip-mutant-fix.EELDOk`의 대체 6개입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,785/1,785 테스트(공통 native 1,746, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-ts-clip-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
