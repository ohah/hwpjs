import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as hwpjs from '@ohah/hwpjs';
import './App.css';

type TabType = 'markdown' | 'json';

function App() {
  const [markdown, setMarkdown] = useState<string>('');
  const [json, setJson] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('markdown');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processHwpFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setMarkdown('');
    setJson('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // 마크다운 변환 (이미지는 base64로 임베드됨)
      const markdownResult = hwpjs.parseHwpToMarkdown(data, {
        useHtml: true,
        includeVersion: true,
        includePageInfo: true,
      });
      setMarkdown(markdownResult.markdown);

      // JSON 변환
      const jsonString = hwpjs.parseHwp(data);
      setJson(jsonString);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'HWP 파일 파싱 실패';
      setError(errorMessage);
      console.error('Error parsing HWP file:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load default file on mount
  useEffect(() => {
    const loadDefaultFile = async () => {
      try {
        const response = await fetch('./noori.hwp');
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], 'noori.hwp', { type: 'application/x-hwp' });
          await processHwpFile(file);
        }
      } catch {
        // Default file not found, skipping...
      }
    };
    loadDefaultFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processHwpFile(file);
    }
  };

  const formatJson = (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>hwpjs</h1>
        <p className="subtitle">HWP 파일을 마크다운 또는 JSON으로 변환하여 보기</p>

        <div className="file-input-wrapper">
          <label htmlFor="hwp-file" className="file-input-label">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            HWP 파일 선택
          </label>
          <input
            id="hwp-file"
            type="file"
            accept=".hwp"
            onChange={handleFileSelect}
            className="file-input"
          />
        </div>
      </header>

      <main className="app-main">
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>HWP 파일을 파싱하는 중...</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>❌ {error}</p>
          </div>
        )}

        {(markdown || json) && !loading && (
          <div className="content-container">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'markdown' ? 'active' : ''}`}
                onClick={() => setActiveTab('markdown')}
              >
                마크다운 보기
              </button>
              <button
                className={`tab ${activeTab === 'json' ? 'active' : ''}`}
                onClick={() => setActiveTab('json')}
              >
                toJSON
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'markdown' && markdown && (
                <div className="markdown-container">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdown}
                  </ReactMarkdown>
                </div>
              )}

              {activeTab === 'json' && json && (
                <div className="json-container">
                  <pre className="json-content">{formatJson(json)}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {!markdown && !json && !loading && !error && (
          <div className="empty-state">
            <p>HWP 파일을 선택하거나 기본 파일을 기다리는 중...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
