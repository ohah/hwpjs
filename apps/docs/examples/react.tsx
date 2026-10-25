import { CanvasSurface, useEditorState } from '@hwpjs/react';
import type { HeadlessEditor } from '@hwpjs/core';

// editor의 생성·load·save·dispose는 부모 앱이 소유합니다.
export function DocumentPane({ editor }: { editor: HeadlessEditor }) {
  const state = useEditorState(editor);
  return (
    <section aria-label="문서 편집">
      <p role="status">{state.status}</p>
      <div style={{ height: '70vh' }}>
        <CanvasSurface editor={editor} onError={console.error} />
      </div>
    </section>
  );
}
