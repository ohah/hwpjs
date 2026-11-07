import { useEffect, useRef, useState } from 'react';
import { withBase } from '@rspress/core/runtime';
import {
  browserSimulation,
  simulationRequest,
  simulationCommand,
  simulationEditRequest,
  simulationError,
  type SimulationSnapshot,
  type SimulationRequest,
  type SimulationResponse,
} from './cli-simulation.mjs';
import './CliSimulation.css';

const samples = [
  { name: 'noori.hwp', label: 'Noori · HWP5' },
  { name: 'noori.hwpx', label: 'Noori · HWPX' },
];
const json = (value: unknown) => JSON.stringify(value, null, 2);
async function fetchBytes(url: string, max: number, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error(`파일을 가져오지 못했습니다 (${response.status}).`);
  const declared = response.headers.get('Content-Length');
  if (declared && Number(declared) > max) throw Error('파일 크기 제한을 초과했습니다.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > max) throw Error('파일 크기 제한을 초과했습니다.');
  return bytes;
}
function explainError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  if (/WebCryptoUnavailable/.test(code))
    return '이 브라우저에서 Web Crypto를 사용할 수 없습니다. HTTPS 또는 localhost 환경을 확인하세요.';
  if (/SourceSHA256Mismatch/.test(code))
    return '읽은 문서 SHA와 일치하지 않습니다. 문서를 다시 읽으세요.';
  if (/NewOutputFilenameRequired|InvalidSimulationFilename/.test(code))
    return '원본과 다른 새 파일 이름을 같은 문서 형식의 확장자로 지정하세요.';
  if (/Ambiguous/.test(code))
    return '선택한 문단에서 여러 번 일치합니다. 찾을 문자열을 더 구체적으로 지정하세요.';
  if (/NotFound/.test(code))
    return '선택한 문단의 편집 가능한 원문에서 문자열을 찾지 못했습니다. ID와 찾을 내용을 확인하세요.';
  if (/Stale|Reflow/i.test(code))
    return '저장된 줄 배치가 무효화되는 편집입니다. 이를 수용할 때만 배치 무효화 항목을 선택하세요.';
  return code;
}
export default function CliSimulation() {
  const [sample, setSample] = useState(samples[0].name);
  const [viewFormat, setViewFormat] = useState<'text' | 'markdown'>('text');
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [targetId, setTargetId] = useState('');
  const [findText, setFindText] = useState('보도일시');
  const [replacement, setReplacement] = useState('수정한 보도일시');
  const [outputName, setOutputName] = useState('noori-edited.hwp');
  const [allowStaleLayout, setAllowStaleLayout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('샘플을 선택하고 문서를 읽어 보세요.');
  const [command, setCommand] = useState('');
  const [request, setRequest] = useState<SimulationRequest | null>(null);
  const [response, setResponse] = useState<SimulationResponse | null>(null);
  const [download, setDownload] = useState<{
    url: string;
    filename: string;
    sha256: string;
  } | null>(null);
  const lifetime = useRef({ active: true, sequence: 0, busy: false });
  const controller = useRef<AbortController | null>(null);
  const downloadURL = useRef<string | null>(null);
  const clearDownload = () => {
    if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
    downloadURL.current = null;
    setDownload(null);
  };
  useEffect(() => {
    lifetime.current.active = true;
    return () => {
      lifetime.current.active = false;
      lifetime.current.sequence++;
      controller.current?.abort();
      if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
    };
  }, []);
  const reset = () => {
    lifetime.current.sequence++;
    controller.current?.abort();
    clearDownload();
    setSnapshot(null);
    setRequest(null);
    setResponse(null);
    setCommand('');
    setTargetId('');
    setAllowStaleLayout(false);
    setStatus('샘플을 선택하고 문서를 읽어 보세요.');
  };
  const begin = () => {
    if (lifetime.current.busy) return null;
    lifetime.current.busy = true;
    setBusy(true);
    clearDownload();
    return ++lifetime.current.sequence;
  };
  const current = (sequence: number) =>
    lifetime.current.active && lifetime.current.sequence === sequence;
  const finish = (sequence: number) => {
    lifetime.current.busy = false;
    if (current(sequence)) setBusy(false);
  };
  async function readSample() {
    const sequence = begin();
    if (sequence === null) return;
    const pending = simulationRequest('read_document', {
      inputPath: './' + sample,
      format: viewFormat,
    });
    controller.current = new AbortController();
    setSnapshot(null);
    setRequest(pending);
    setResponse(null);
    setCommand(simulationCommand(pending));
    setStatus('브라우저의 Native 엔진으로 읽고 있습니다.');
    try {
      const signal = controller.current.signal;
      const [bytes, wasm] = await Promise.all([
        fetchBytes(withBase('/editor/fixtures/' + sample), 64 * 1024 * 1024, signal),
        fetchBytes(withBase('/editor/hwpjs/hwpjs.wasm'), 32 * 1024 * 1024, signal),
      ]);
      if (!current(sequence)) return;
      const next = await browserSimulation.read({
        bytes,
        wasm,
        filename: sample,
        format: viewFormat,
      });
      if (!current(sequence)) return;
      const target =
        next.paragraphs.find(
          (p) => p.editability === 'range-check-required' && p.displayText?.includes('보도일시'),
        ) ?? next.paragraphs.find((p) => p.editability === 'range-check-required' && p.displayText);
      setSnapshot(next);
      setTargetId(target?.id ?? '');
      setFindText(target?.displayText?.includes('보도일시') ? '보도일시' : '');
      setOutputName(next.format === 'hwp5' ? 'noori-edited.hwp' : 'noori-edited.hwpx');
      setCommand(next.command);
      setRequest(next.request);
      setResponse(next.response);
      setStatus('읽었습니다. 원문 ID와 SHA를 기준으로 한 문단을 수정할 수 있습니다.');
    } catch (error) {
      if (current(sequence)) {
        setResponse(simulationError(pending, error));
        setStatus(`읽지 못했습니다: ${explainError(error)}`);
      }
    } finally {
      finish(sequence);
    }
  }
  async function editSample() {
    if (!snapshot) return;
    const sequence = begin();
    if (sequence === null) return;
    setCommand('');
    setRequest(null);
    setResponse(null);
    let pending: SimulationRequest | null = null;
    try {
      const draft = {
        targetId,
        expectedSha256: snapshot.sourceSha256,
        findText,
        replacement,
        outputName,
        allowStaleLayout,
      };
      pending = simulationEditRequest(snapshot, draft);
      setRequest(pending);
      setResponse(null);
      setCommand(simulationCommand(pending));
      setStatus('Native 범위를 확인하고 수정본을 만들고 있습니다.');
      const saved = await browserSimulation.edit(snapshot, draft);
      if (!current(sequence)) return;
      const url = URL.createObjectURL(
        new Blob([saved.bytes], {
          type: snapshot.format === 'hwp5' ? 'application/x-hwp' : 'application/hwp+zip',
        }),
      );
      downloadURL.current = url;
      setDownload({ url, filename: saved.filename, sha256: saved.sha256 });
      setCommand(saved.command);
      setRequest(saved.request);
      setResponse(saved.response);
      setStatus(
        saved.layoutRequiresReflow
          ? '수정본을 만들었습니다. 저장된 줄 배치는 무효화되며 새 조판 결과는 포함하지 않습니다.'
          : '수정본을 만들었습니다. 아래 링크에서 다운로드하세요.',
      );
    } catch (error) {
      if (current(sequence)) {
        if (pending) setResponse(simulationError(pending, error));
        setStatus(`저장되지 않았습니다: ${explainError(error)}`);
      }
    } finally {
      finish(sequence);
    }
  }
  return (
    <section
      className="hwpjs-cli-simulation"
      aria-busy={busy}
      aria-label="CLI와 MCP Native 실행 시뮬레이션"
    >
      <div className="hwpjs-cli-simulation-notice">
        <strong>실제 문서 처리 · 브라우저 실행</strong>
        <p>
          같은 CLI engine의 Native WASM으로 읽고 수정합니다. Node CLI·로컬 파일 시스템·MCP stdio
          서버는 이 페이지에서 실행하지 않습니다. 아래 명령과 MCP 메시지는 로컬 실행을 설명하는
          시뮬레이션입니다.
        </p>
      </div>
      <fieldset disabled={busy} className="hwpjs-cli-simulation-inputs">
        <legend>문서 읽기</legend>
        <label>
          공개 샘플
          <select
            value={sample}
            onChange={(e) => {
              reset();
              setSample(e.target.value);
            }}
          >
            {samples.map((s) => (
              <option key={s.name} value={s.name}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          논리 뷰
          <select
            value={viewFormat}
            onChange={(e) => {
              reset();
              setViewFormat(e.target.value as 'text' | 'markdown');
            }}
          >
            <option value="text">텍스트</option>
            <option value="markdown">Markdown</option>
          </select>
        </label>
        <button type="button" onClick={() => void readSample()}>
          문서 읽기
        </button>
        <a href={withBase('/editor/fixtures/' + sample)} download={sample}>
          원본 샘플 다운로드
        </a>
      </fieldset>
      <p role="status" aria-live="polite" className="hwpjs-cli-simulation-status">
        {busy ? '처리 중 · ' : ''}
        {status}
      </p>
      {snapshot && (
        <>
          <label className="hwpjs-cli-simulation-sha">
            읽은 문서 SHA256
            <input readOnly value={snapshot.sourceSha256} />
          </label>
          <details open className="hwpjs-cli-simulation-outline">
            <summary>읽은 논리 구조 · {snapshot.format === 'hwp5' ? 'HWP5' : 'HWPX'}</summary>
            <pre>{snapshot.body}</pre>
          </details>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void editSample();
            }}
          >
            <fieldset disabled={busy} className="hwpjs-cli-simulation-edit">
              <legend>한 문단의 리터럴 문자열 교체</legend>
              <label>
                원문 Native ID
                <select
                  value={targetId}
                  onChange={(e) => {
                    clearDownload();
                    setTargetId(e.target.value);
                  }}
                >
                  <option value="">문단을 선택하세요</option>
                  {snapshot.paragraphs.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={p.editability !== 'range-check-required'}
                    >
                      {p.id} ·{' '}
                      {p.displayText === null
                        ? '읽기 미확정'
                        : p.displayText.slice(0, 72) || '(빈 문단)'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                찾을 문자열
                <input
                  value={findText}
                  onChange={(e) => {
                    clearDownload();
                    setFindText(e.target.value);
                  }}
                />
              </label>
              <label>
                바꿀 문자열 · 비우면 삭제
                <input
                  value={replacement}
                  onChange={(e) => {
                    clearDownload();
                    setReplacement(e.target.value);
                  }}
                />
              </label>
              <label>
                새 파일 이름
                <input
                  value={outputName}
                  onChange={(e) => {
                    clearDownload();
                    setOutputName(e.target.value);
                  }}
                />
              </label>
              {snapshot.format === 'hwp5' && (
                <label className="hwpjs-cli-simulation-checkbox">
                  <input
                    type="checkbox"
                    checked={allowStaleLayout}
                    onChange={(e) => {
                      clearDownload();
                      setAllowStaleLayout(e.target.checked);
                    }}
                  />
                  저장된 줄 배치 무효화를 수용합니다 (--allow-stale-layout)
                </label>
              )}
              <p>
                표시 순서로 좌표를 만들지 않습니다. Native가 대상·보호 상태·유일한 일치를 다시
                검사합니다. 입력 원본은 변경하지 않습니다.
              </p>
              <button type="submit" disabled={!targetId || !findText}>
                수정본 만들기
              </button>
            </fieldset>
          </form>
        </>
      )}
      {download && (
        <div className="hwpjs-cli-simulation-download">
          <a href={download.url} download={download.filename}>
            수정본 다운로드 · {download.filename}
          </a>
          <p>
            SHA256: <code>{download.sha256}</code>
          </p>
          <p>실제 다운로드 위치와 같은 이름의 처리는 브라우저 설정을 따릅니다.</p>
        </div>
      )}
      {command && (
        <div className="hwpjs-cli-simulation-command">
          <h3>마지막 작업의 로컬 CLI 명령</h3>
          <p>
            원본 샘플을 같은 이름으로 내려받은 디렉터리에서 실행하세요. 새 CLI가 포함된 로컬
            패키지가 필요합니다.
          </p>
          <pre>
            <code>{command}</code>
          </pre>
        </div>
      )}
      {request && (
        <details className="hwpjs-cli-simulation-protocol">
          <summary>마지막 MCP tools/call 메시지 · 프로토콜 시뮬레이션</summary>
          <p>
            요청은 같은 작업의 로컬 서버 호출 예시입니다. 응답의 문서 결과는 위 브라우저 Native
            실행에서 생성했으며 실제 stdio 교환이나 로컬 파일 저장 영수증은 아닙니다.
          </p>
          <h4>요청</h4>
          <pre>{json(request)}</pre>
          {response && (
            <>
              <h4>결과</h4>
              <pre>{json(response)}</pre>
            </>
          )}
        </details>
      )}
    </section>
  );
}
