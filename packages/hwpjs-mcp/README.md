# @ohah/hwpjs-mcp

HWP5/HWPX 문서 도구를 MCP 클라이언트에 연결하는 전용 실행 패키지입니다. `@ohah/hwpjs-mcp@0.1.0`은 기존 공개 `@ohah/hwpjs@0.1.0`을 버전 고정 의존성로 사용합니다. 기본 실행 파일은 `hwpjs-mcp`이며 WASM은 의존 패키지에 자동 포함됩니다. Node.js 24.20 이상이 필요합니다.

다음 명령으로 실행합니다.

```bash
npx -y @ohah/hwpjs-mcp
```

MCP 클라이언트의 서버 설정에 다음 실행 정보를 등록합니다. 설정 위치와 작업 디렉터리는 클라이언트에 맞춥니다.

```json
{
  "command": "npx",
  "args": ["-y", "@ohah/hwpjs-mcp"]
}
```

이 패키지는 기존 공개 버전의 12도구를 연결하며, 현재 저장소 소스의 16도구와 구분됩니다. 기존 실행 방식 `npx --yes --package=@ohah/hwpjs@0.1.0 hwpjs-mcp`도 사용할 수 있습니다.

도구 목록·사용 예시·지원 범위는 [MCP 연결 안내](https://ohah.github.io/hwpjs/guide/mcp.html)를 참고하세요.
