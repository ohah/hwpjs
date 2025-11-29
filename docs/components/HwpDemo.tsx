import { NoSSR } from '@rspress/core/runtime';

import React, { useEffect, useState, useCallback } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './HwpDemo.css';

type TabType = 'markdown' | 'json';

interface HwpDemoProps {
  hwpPath?: string;
}

export function HwpDemo({ hwpPath = '/hwpjs/demo/noori.hwp' }: HwpDemoProps) {
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
      // 동적 import로 hwpjs 로드 (SSG 빌드 시 문제 방지)
      const hwpjs = await import('@ohah/hwpjs');

      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      // Web 환경에서 Buffer 타입으로 변환 (napi-rs WASM 호환)
      const buffer = data as unknown as Buffer;

      // 마크다운 변환 (이미지는 base64로 임베드됨)
      const markdownResult = hwpjs.toMarkdown(buffer, {
        image: 'base64',
        useHtml: false,
        includeVersion: false,
        includePageInfo: false,
      });
      setMarkdown(markdownResult.markdown);

      // JSON 변환
      const jsonString = hwpjs.toJson(buffer);
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
        const response = await fetch(hwpPath);
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
  }, [hwpPath]);

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

  // urlTransform to allow data: URLs (base64 images) to pass through
  const urlTransform = (url: string) => {
    return url.startsWith('data:') ? url : defaultUrlTransform(url);
  };

  return (
    <NoSSR>
      <div className="hwp-demo">
        <div className="hwp-demo-header">
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
        </div>

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
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={urlTransform}
                    components={{
                      img: ({ src, alt, ...props }) => {
                        if (src) {
                          return (
                            <img
                              src={src}
                              alt={alt || 'Image'}
                              className="markdown-image"
                              {...props}
                            />
                          );
                        }
                        return null;
                      },
                    }}
                  >
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
      </div>
    </NoSSR>
  );
}
