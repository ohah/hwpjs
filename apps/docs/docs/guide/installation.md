# 설치와 패키지

이번 안내는 현재 개발 workspace 기준이며, 제품 모노레포 변경은 순차 공개 중이므로 main의 새 clone이나 npm에서 즉시 설치·빌드할 수 있음을 보장하지 않습니다.

## 로컬 workspace부터 시작

현재 문서는 저장소에 있는 `@hwpjs/*` 소스와 `0.1.0` 패키지 manifest를 기준으로 합니다. npm 레지스트리에 같은 버전의 아티팩트가 게시됐다는 보장은 하지 않습니다. 다른 npm 패키지의 같은 이름이나 이전 `@ohah/hwpjs`를 대신 설치하지 마세요.

이 저장소의 앱에서는 필요한 패키지를 workspace 의존성으로 선언합니다.

```json
{
  "dependencies": {
    "@hwpjs/core": "workspace:*",
    "@hwpjs/vanilla": "workspace:*"
  }
}
```

저장소 루트에서 잠금파일에 맞춰 의존성을 설치합니다. 현재 workspace는 Bun 1.4.4를 사용합니다.

```bash
bun install --frozen-lockfile
```

| 패키지 | 역할 | 추가 조건 |
| --- | --- | --- |
| `@hwpjs/core` | 상태·선택·명령·저장 | 문서 Runtime 주입 필요 |
| `@hwpjs/core/runtime` | Reader/Worker factory와 WASM loader | 별도 export 경로 |
| `@hwpjs/vanilla` | Canvas 렌더링과 입력 호스트 | 브라우저 DOM |
| `@hwpjs/react` | React CanvasSurface와 hooks | 현재 workspace React 19.3.1 |
| `@hwpjs/svelte` | Svelte CanvasEditor와 action | 현재 workspace Svelte 5.57.2 |
| `@hwpjs/react-native` | Native provider/transport 기반 | experimental; [미완료 경계](../frameworks/react-native.md) |

React/Svelte 앱은 해당 어댑터를 `workspace:*`로 추가합니다. core와 어댑터의 버전을 함께 맞추세요.

## 빌드된 패키지와 소스의 차이

package exports는 `dist`를 가리킵니다. workspace 연결만으로 worker나 WASM이 생성되지는 않습니다. 저장소에서 확인한 명시적 WASM을 사용해 웹 패키지를 빌드하는 명령은 다음과 같습니다. `<...>`는 실제 파일 경로로 바꿉니다.

```bash
bun run build:web --wasm=/absolute/path/to/hwpjs.wasm
```

이 명령의 소유 빌드 결과에는 core의 `index.js`, `runtime.js`, `worker.js`, `hwpjs.wasm`과 타입 선언이 포함돼야 합니다. 이미 실행 중인 데모의 파일을 바꾸려면 별도의 서버/배포 절차가 필요합니다. 문서 사이트 빌드는 제품 패키지나 WASM을 빌드하지 않습니다.

외부 프로젝트에 배포할 때는 패키지 게시 상태와 `exports`가 가리키는 파일을 먼저 확인하세요. 다음 단계는 [Runtime · WASM 설정](./runtime.md)입니다.
