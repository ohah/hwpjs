# hwpjs

CFB 컨테이너 읽기·쓰기용 JavaScript/WASM 라이브러리.

## 준비 및 빌드

Zig 0.16.0과 Node.js 24가 필요합니다. 명령과 예제는 저장소 루트 기준입니다.

```sh
mise install
zig build -Doptimize=ReleaseSafe
```

Zig와 Node.js를 별도로 설치했다면 `mise install`은 생략합니다. 빌드 결과는 `zig-out/bin/hwpjs.wasm`입니다.

## Node.js에서 읽기

```js
import { readFileSync } from 'node:fs';
import { createCfbReader } from './js/cfb.mjs';

const reader = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
try {
  reader.parse(readFileSync('sample.hwp'), { strict: true });
  console.log(reader.findExact('/BodyText/Section0')?.content);
} finally {
  reader.close();
}
```

반환값은 CFB 스트림의 원시 바이트입니다. HWP/HWPX 본문 파싱·편집 API는 아직 제공하지 않습니다.

## 브라우저에서 읽기

```js
import { createCfbReader } from './js/cfb.mjs';

const wasm = await fetch('./zig-out/bin/hwpjs.wasm');
const reader = await createCfbReader(await wasm.arrayBuffer());
try {
  const file = await fetch('./sample.hwp');
  reader.parse(new Uint8Array(await file.arrayBuffer()), { strict: true });
  console.log(reader.findExact('/FileHeader')?.content);
} finally {
  reader.close();
}
```

HTML·JS·WASM·입력 파일을 HTTP 서버에서 제공하고 실행합니다.

## API 안내

스트림 추가·교체·저장과 옵션·자원 제한은 [CFB API](docs/cfb-reader.md#api)를 참고하세요.

라이선스: [MIT](LICENSE) · [제3자 고지](THIRD_PARTY_NOTICES.md).

본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
