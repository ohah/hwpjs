# 패키지 이름과 게시 상태

공개 배포 이름은 **`@ohah/hwpjs`**이며, Zig/WASM 공통 엔진을 포함한 **`0.1.0`이 npm에 게시되어 있습니다.** 내부 개발 workspace 이름과 이전 RC의 API를 현재 공개 API와 구분합니다.

| 대상                                                                | 현재 상태                                                          | 사용 시 주의                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `@ohah/hwpjs@0.1.0`                                                 | 공개 npm 패키지. 공통 SDK·CLI·stdio MCP·WASM과 공개 타입 선언 포함 | Node.js 24.20 이상, ESM. 아래 공개 진입점 사용                |
| `@ohah/hwpjs@0.1.0-rc.10`                                           | 이전 Rust/NAPI·WASI 변환 패키지                                    | `0.1.0`의 `createEditor`·typed command API와 호출 형태가 다름 |
| `@hwpjs/core`, `@hwpjs/vanilla`, `@hwpjs/react`, `@hwpjs/svelte` 등 | 내부 개발 workspace 이름                                           | 외부 프로젝트에서는 `@ohah/hwpjs`의 공개 하위 경로 사용       |

## 공개 설치

문서를 다룰 프로젝트 디렉터리에서 실행합니다.

```bash
npm install @ohah/hwpjs@0.1.0 --ignore-scripts --omit=peer --no-audit --no-fund
npx --no-install hwpjs --help
```

이 설치 방식은 CLI/MCP를 위한 선택적 UI peer 생략 예시입니다. React·Svelte·React Native 어댑터를 사용한다면 해당 peer도 준비합니다. [CLI 가이드](./cli.md)와 [MCP 가이드](./mcp.md)의 명령은 이 공개 버전을 기준으로 합니다. 이전 설치분은 자동 갱신되지 않습니다.

인증 없는 새 소비자와 새 캐시에서 실제 공개 레지스트리 설치를 확인했습니다. 레지스트리 tarball 무결성과 설치 파일 110개가 준비한 릴리스와 일치했고, 설치된 CLI의 도움말·HWPX 생성·Noori HWP5 편집/재열기 및 실제 MCP 버전 `0.1.0`·12도구 목록을 확인했습니다. 이 확인은 모든 문서·기능·플랫폼의 검증 완료를 뜻하지 않습니다.

## 공개 진입점

내부 모노레포의 core·Vanilla·React·Svelte·React Native 분리는 유지하며, 외부에는 단일 패키지와 다음 하위 경로를 제공합니다.

| import 경로                              | 의미                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `@ohah/hwpjs`                            | canonical core API                                               |
| `@ohah/hwpjs/runtime`                    | Reader/Worker runtime과 WASM loader                              |
| `@ohah/hwpjs/worker`, `@ohah/hwpjs/wasm` | 배포된 Worker/WASM asset export                                  |
| `@ohah/hwpjs/vanilla`                    | Canvas surface                                                   |
| `@ohah/hwpjs/react`                      | React adapter, 선택적인 React peer 필요                          |
| `@ohah/hwpjs/svelte`                     | Svelte adapter, 선택적인 Svelte peer 및 SSR 경계 필요            |
| `@ohah/hwpjs/react-native`               | Native provider 기반 JavaScript 경계; 기기 연결·검증 별도        |
| `@ohah/hwpjs/react-native/canvas`        | 별도 Native Canvas 연결 경계; 기기 바이너리를 자동 설치하지 않음 |

core의 canonical 경로는 루트 `@ohah/hwpjs`입니다. `@ohah/hwpjs/core`는 `0.1.0`의 export가 아니며, `@ohah/hwpjs-react` 같은 별도 이름으로 어댑터를 설치하지 않습니다. 이전 `rc.10`의 export와 함수 계약을 현재 하위 경로에 그대로 적용하지 마세요.

`hwpjs`와 `hwpjs-mcp`는 같은 패키지의 실행 파일입니다. 설치된 bin은 TypeScript 원문이 아닌 독립 JavaScript이며, 인접한 WASM 한 벌을 사용합니다. SDK root/runtime import는 React/Svelte 설치나 DOM 접근을 요구하지 않습니다. `/worker`는 Worker 환경 전용으로 일반 Node main에서 직접 실행하는 파일이 아닙니다.

## 설치와 브라우저 체험의 구분

[공개 API 직접 실행](../api/playground.mdx)과 [문서 체험](../cli-simulation.mdx)은 각각 배포에 포함된 동결 소스·WASM을 사용합니다. npm 공개 설치는 별도로 확인된 경로이며, 브라우저가 설치된 Node CLI나 실제 stdio 서버를 실행하는 것은 아닙니다. 미게시 개발 소스와 후속 기능도 `0.1.0`에 포함됐다고 간주하지 않습니다.
