// 호스트는 공통 메모리 서비스만 호출하며 별도 parser·renderer를 만들지 않는다.
export { exportDocumentHTML } from '../../document/src/export-html.ts';
export type { HTMLExportInput, HTMLExportResult } from '../../document/src/export-html.ts';
