import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as hwpjs from '@ohah/hwpjs';
import './App.css';

function App() {
  const [markdown, setMarkdown] = useState<string>('');
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processHwpFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setMarkdown('');
    setImages(new Map());

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      const result = hwpjs.parseHwpToMarkdown(data, {
        useHtml: true,
        includeVersion: true,
        includePageInfo: true,
      });

      // Create Blob URLs for images
      const blobUrls = new Map<string, string>();
      let processedMarkdown = result.markdown;

      // <br> 태그를 개행으로 변환
      processedMarkdown = processedMarkdown.replace(/<br\s*\/?>/gi, '\n');

      result.images.forEach((img) => {
        // SharedArrayBuffer를 피하기 위해 복사본 생성
        const imageData = new Uint8Array(img.data);
        const mimeType =
          img.format === 'jpg' || img.format === 'jpeg'
            ? 'image/jpeg'
            : img.format === 'png'
              ? 'image/png'
              : img.format === 'gif'
                ? 'image/gif'
                : img.format === 'bmp'
                  ? 'image/bmp'
                  : `image/${img.format}`;

        const blob = new Blob([imageData], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.set(img.id, blobUrl);

        // Markdown 텍스트에서 이미지 참조를 Blob URL로 직접 교체
        // 여러 패턴 시도
        const escapedId = img.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patterns = [
          // 기본 패턴: ![이미지](image-0)
          new RegExp(`!\\[이미지\\]\\(${escapedId}\\)`, 'g'),
          // alt 텍스트가 있는 경우: ![alt](image-0)
          new RegExp(`!\\[([^\\]]*)\\]\\(${escapedId}\\)`, 'g'),
          // 괄호 없이: ![이미지]image-0 (드물지만 가능)
          new RegExp(`!\\[이미지\\]${escapedId}`, 'g'),
        ];

        let replaced = false;
        patterns.forEach((pattern) => {
          if (pattern.test(processedMarkdown)) {
            processedMarkdown = processedMarkdown.replace(pattern, (_match, alt) => {
              replaced = true;
              return `![${alt || '이미지'}](${blobUrl})`;
            });
          }
        });

        // 디버깅
        if (!replaced) {
          console.warn(`Image ID ${img.id} not found in markdown. Searching for patterns...`);
          // 실제로 어떤 패턴이 있는지 확인
          const imagePatterns = processedMarkdown.match(
            new RegExp(`!\\[.*?\\]\\(.*?${img.id}.*?\\)`, 'g')
          );
          if (imagePatterns) {
            console.log('Found potential image patterns:', imagePatterns);
          }
        } else {
          console.log(`✓ Replaced ${img.id} with blob URL`);
        }
      });

      console.log('Processed markdown preview:', processedMarkdown.substring(0, 500));
      console.log('Blob URLs:', Array.from(blobUrls.entries()));

      setMarkdown(processedMarkdown);
      setImages(blobUrls);
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

  // Cleanup Blob URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processHwpFile(file);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>HWP to Markdown Viewer</h1>
        <p className="subtitle">HWP 파일을 마크다운으로 변환하여 보기</p>

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

        {markdown && !loading && (
          <div className="markdown-container">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt }) => {
                  // 디버깅
                  console.log('Rendering image with src:', src);

                  if (!src) {
                    console.warn('Image src is undefined');
                    return null;
                  }

                  // Markdown 텍스트에서 이미 Blob URL로 교체되었으므로
                  // 단순히 렌더링만 하면 됨
                  return (
                    <img
                      src={src}
                      alt={alt || '이미지'}
                      className="markdown-image"
                      onLoad={() => {
                        console.log('Image loaded successfully:', src);
                      }}
                      onError={(e) => {
                        console.error('Image load error:', src, e);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  );
                },
              }}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        )}

        {!markdown && !loading && !error && (
          <div className="empty-state">
            <p>HWP 파일을 선택하거나 기본 파일을 기다리는 중...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
