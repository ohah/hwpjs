# Vanilla

`createCanvasSurface`는 현재 렌더러와 직접 입력 구현을 연결합니다. 빈 호스트 요소와 editor를 전달하고 실제 마운트 높이를 지정하세요. 예: 호스트 CSS에 `height: 70vh`. 호스트의 자식 노드는 surface가 소유하므로 다른 프레임워크로 자식을 동시에 렌더링하지 않습니다.

아래 예제는 [브라우저 runtime helper](../guide/runtime.md)의 `createBrowserEditor`를 같은 앱 모듈에서 가져옵니다. 호출 앱은 파일 picker에서 받은 `File`과 배포한 asset URL을 전달합니다.

<!-- example:vanilla.ts -->
```ts
import { detectDocumentFormat } from '@hwpjs/core';
import { createCanvasSurface } from '@hwpjs/vanilla';
import { createBrowserEditor, type BrowserAssets } from './runtime';

export async function mountDocument(root: HTMLElement, file: File, assets: BrowserAssets) {
  const editor = createBrowserEditor(assets);
  let surface: ReturnType<typeof createCanvasSurface> | undefined;
  try {
    surface = createCanvasSurface({ root, editor, onStatus: console.info });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
    surface.focus();
    return {
      editor,
      async dispose() {
        try { await surface?.dispose(); }
        finally { await editor.dispose(); }
      },
    };
  } catch (error) {
    try { await surface?.dispose(); }
    finally { await editor.dispose(); }
    throw error;
  }
}
```

파일이 열리면 Canvas에서 마우스·키보드·IME로 입력할 수 있습니다. 하나의 editor에는 활성 input surface 하나만 연결합니다. `surface.dispose()`와 `editor.dispose()`는 서로 다른 수명을 정리합니다. 언마운트 전에 대기 입력 반영과 오류 처리 정책도 정하세요.

이 패키지는 전체 리본·대화상자·파일 다운로드 UI를 제공하는 완제품 에디터가 아닙니다. 데모 shell은 별도 앱입니다. 저장은 반환된 `editor.save()`를 사용합니다.
