import { NoSSR } from '@rspress/core/runtime';
// @ts-expect-error - @theme is provided by Rspress at runtime
import { Tab, Tabs } from '@theme';

import React, { useEffect, useState, useCallback } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './HwpDemo.css';

interface HwpDemoProps {
  hwpPath?: string;
}

export function HwpDemo({ hwpPath = '/hwpjs/demo/noori.hwp' }: HwpDemoProps) {
  const [markdown, setMarkdown] = useState<string>('');
  const [json, setJson] = useState<string>('');
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processHwpFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setMarkdown('');
    setJson('');
    setHtml('');

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

      // HTML 변환 (이미지는 base64로 임베드됨)
      const htmlString = hwpjs.toHtml(buffer, {
        includeVersion: false,
        includePageInfo: false,
      });
      setHtml(htmlString);
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

        {(markdown || json || html) && !loading && (
          <div className="content-container">
            <Tabs
              groupId="demo-view"
              values={[
                <div
                  key="html"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 15,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16"></path>
                  </svg>
                  <span style={{ marginLeft: 6, marginBottom: 2 }}>HTML</span>
                </div>,
                <div
                  key="json"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 15,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    className="platform-icon-web"
                  >
                    <path
                      d="M20.501 6.028V6h-.02A10.28 10.28 0 0 0 4.519 6H4.5v.028a10.262 10.262 0 0 0 0 12.944V19h.02a10.28 10.28 0 0 0 15.962 0h.021v-.028a10.262 10.262 0 0 0 0-12.944zM13 6V3.272A4.533 4.533 0 0 1 15.54 6zm2.935 1a16.827 16.827 0 0 1 .853 5H13V7zM12 3.272V6H9.46A4.533 4.533 0 0 1 12 3.272zM12 7v5H8.212a16.827 16.827 0 0 1 .853-5zm-4.787 5H3.226a9.234 9.234 0 0 1 1.792-5h2.984a17.952 17.952 0 0 0-.79 5zm0 1a17.952 17.952 0 0 0 .789 5H5.018a9.234 9.234 0 0 1-1.792-5zm1 0H12v5H9.065a16.827 16.827 0 0 1-.853-5zM12 19v2.728A4.533 4.533 0 0 1 9.46 19zm1 2.728V19h2.54A4.533 4.533 0 0 1 13 21.728zM13 18v-5h3.788a16.827 16.827 0 0 1-.853 5zm4.787-5h3.987a9.234 9.234 0 0 1-1.792 5h-2.984a17.952 17.952 0 0 0 .79-5zm0-1a17.952 17.952 0 0 0-.789-5h2.984a9.234 9.234 0 0 1 1.792 5zm1.352-6h-2.501a8.524 8.524 0 0 0-1.441-2.398A9.306 9.306 0 0 1 19.139 6zM9.803 3.602A8.524 8.524 0 0 0 8.363 6H5.86a9.306 9.306 0 0 1 3.942-2.398zM5.861 19h2.501a8.524 8.524 0 0 0 1.441 2.398A9.306 9.306 0 0 1 5.861 19zm9.336 2.398A8.524 8.524 0 0 0 16.637 19h2.502a9.306 9.306 0 0 1-3.942 2.398z"
                      fill="currentColor"
                    />
                  </svg>
                  <span style={{ marginLeft: 6, marginBottom: 2 }}>JSON</span>
                </div>,
                <div
                  key="markdown"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 15,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    className="platform-icon-web"
                  >
                    <path
                      d="M20.501 6.028V6h-.02A10.28 10.28 0 0 0 4.519 6H4.5v.028a10.262 10.262 0 0 0 0 12.944V19h.02a10.28 10.28 0 0 0 15.962 0h.021v-.028a10.262 10.262 0 0 0 0-12.944zM13 6V3.272A4.533 4.533 0 0 1 15.54 6zm2.935 1a16.827 16.827 0 0 1 .853 5H13V7zM12 3.272V6H9.46A4.533 4.533 0 0 1 12 3.272zM12 7v5H8.212a16.827 16.827 0 0 1 .853-5zm-4.787 5H3.226a9.234 9.234 0 0 1 1.792-5h2.984a17.952 17.952 0 0 0-.79 5zm0 1a17.952 17.952 0 0 0 .789 5H5.018a9.234 9.234 0 0 1-1.792-5zm1 0H12v5H9.065a16.827 16.827 0 0 1-.853-5zM12 19v2.728A4.533 4.533 0 0 1 9.46 19zm1 2.728V19h2.54A4.533 4.533 0 0 1 13 21.728zM13 18v-5h3.788a16.827 16.827 0 0 1-.853 5zm4.787-5h3.987a9.234 9.234 0 0 1-1.792 5h-2.984a17.952 17.952 0 0 0 .79-5zm0-1a17.952 17.952 0 0 0-.789-5h2.984a9.234 9.234 0 0 1 1.792 5zm1.352-6h-2.501a8.524 8.524 0 0 0-1.441-2.398A9.306 9.306 0 0 1 19.139 6zM9.803 3.602A8.524 8.524 0 0 0 8.363 6H5.86a9.306 9.306 0 0 1 3.942-2.398zM5.861 19h2.501a8.524 8.524 0 0 0 1.441 2.398A9.306 9.306 0 0 1 5.861 19zm9.336 2.398A8.524 8.524 0 0 0 16.637 19h2.502a9.306 9.306 0 0 1-3.942 2.398z"
                      fill="currentColor"
                    />
                  </svg>
                  <span style={{ marginLeft: 6, marginBottom: 2 }}>마크다운</span>
                </div>,
              ]}
              defaultIndex={0}
            >
              <Tab>
                {html && (
                  <div className="html-container">
                    <iframe
                      srcDoc={html}
                      title="HTML Preview"
                      className="html-iframe"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </Tab>
              <Tab>
                {json && (
                  <div className="json-container">
                    <pre className="json-content">{formatJson(json)}</pre>
                  </div>
                )}
              </Tab>
              <Tab>
                {markdown && (
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
              </Tab>
            </Tabs>
          </div>
        )}

        {!markdown && !json && !html && !loading && !error && (
          <div className="empty-state">
            <p>HWP 파일을 선택하거나 기본 파일을 기다리는 중...</p>
          </div>
        )}
      </div>
    </NoSSR>
  );
}
