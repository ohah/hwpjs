export interface SimulationRequest {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: 'tools/call';
  readonly params: {
    readonly name: 'read_document' | 'edit_document';
    readonly arguments: Readonly<Record<string, string | boolean>>;
  };
}
export interface SimulationResponse {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result: {
    readonly content: readonly { readonly type: 'text'; readonly text: string }[];
    readonly isError?: boolean;
  };
}
export interface SimulationParagraph {
  readonly id: string;
  readonly section: number;
  readonly paragraph: number;
  readonly displayText: string | null;
  readonly editability: 'range-check-required' | 'read-only' | 'unknown';
}
export interface SimulationSnapshot {
  readonly format: 'hwp5' | 'hwpx';
  readonly view: 'content' | 'structure';
  readonly sourceSha256: string;
  readonly inputPath: string;
  readonly body: string;
  readonly paragraphs: readonly SimulationParagraph[];
  readonly request: SimulationRequest;
  readonly response: SimulationResponse;
  readonly command: string;
}
export interface SimulationDraft {
  readonly targetId: string;
  readonly expectedSha256: string;
  readonly findText: string;
  readonly replacement: string;
  readonly allowStaleLayout: boolean;
  readonly outputName: string;
}
export interface SimulationSave {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly filename: string;
  readonly sha256: string;
  readonly changed: boolean;
  readonly layoutRequiresReflow: boolean;
  readonly request: SimulationRequest;
  readonly response: SimulationResponse;
  readonly command: string;
}
export interface Simulation {
  read(options: {
    bytes: Uint8Array;
    wasm: Uint8Array;
    filename: string;
    format?: 'text' | 'markdown';
    view?: 'content' | 'structure';
  }): Promise<SimulationSnapshot>;
  edit(snapshot: SimulationSnapshot, draft: SimulationDraft): Promise<SimulationSave>;
}
export function simulationCommand(request: SimulationRequest): string;
export function simulationRequest(
  name: 'read_document' | 'edit_document',
  args: Readonly<Record<string, string | boolean>>,
): SimulationRequest;
export function simulationEditRequest(
  snapshot: SimulationSnapshot,
  draft: SimulationDraft,
): SimulationRequest;
export function simulationError(request: SimulationRequest, error: unknown): SimulationResponse;
export const browserSimulation: Simulation;
