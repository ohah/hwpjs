'use client';

import React, { useEffect, useState } from 'react';
import { NoSSR } from '@rspress/core/runtime';

interface HwpDemoWrapperProps {
  hwpPath?: string;
}

export function HwpDemoWrapper({ hwpPath = '/hwpjs/demo/noori.hwp' }: HwpDemoWrapperProps) {
  const [HwpDemo, setHwpDemo] = useState<React.ComponentType<{ hwpPath?: string }> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 동적 import로 HwpDemo 컴포넌트 로드 (SSG 빌드 시 번들러가 의존성을 분석하지 않도록)
    import('./HwpDemo')
      .then((module) => {
        setHwpDemo(() => module.HwpDemo);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load HwpDemo component:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <NoSSR>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p>Loading demo component...</p>
        </div>
      </NoSSR>
    );
  }

  if (!HwpDemo) {
    return (
      <NoSSR>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p>Failed to load demo component.</p>
        </div>
      </NoSSR>
    );
  }

  return (
    <NoSSR>
      <HwpDemo hwpPath={hwpPath} />
    </NoSSR>
  );
}
