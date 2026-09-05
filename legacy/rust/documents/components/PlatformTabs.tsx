// @ts-expect-error - @theme is provided by Rspress at runtime
import { Tab, Tabs } from '@theme';
import React, { useMemo, Children, isValidElement } from 'react';
import './PlatformTabs.css';

type Platform = 'node' | 'web' | 'react-native';

interface PlatformTabsProps {
  children: React.ReactNode;
  defaultPlatform?: Platform;
}

// Platform icons as SVG
const PlatformIcons: Record<Platform, React.ReactNode> = {
  web: (
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
  ),
  'react-native': (
    <svg
      width="16"
      height="16"
      viewBox="0 0 112 102"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m56 61.832c5.891 0 10.667-4.776 10.667-10.667s-4.777-10.667-10.667-10.667-10.666 4.776-10.666 10.667 4.774 10.667 10.666 10.667z"
        fill="#61dafb"
      />
      <g stroke="#61dafb" strokeWidth="5.333">
        <path d="m56 75.165c29.455 0 53.333-10.745 53.333-24s-23.878-24-53.333-24-53.334 10.745-53.334 24 23.879 24 53.334 24z" />
        <path d="m35.215 63.165c14.728 25.509 35.972 40.815 47.451 34.188 11.48-6.628 8.846-32.68-5.882-58.188-14.727-25.51-35.972-40.816-47.45-34.188-11.48 6.627-8.846 32.679 5.881 58.188z" />
        <path d="m35.215 39.165c-14.727 25.509-17.36 51.56-5.882 58.188 11.48 6.627 32.724-8.68 47.451-34.188 14.728-25.51 17.362-51.56 5.883-58.188-11.48-6.628-32.724 8.679-47.452 34.188z" />
      </g>
    </svg>
  ),
  node: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 151 151"
      xmlns="http://www.w3.org/2000/svg"
      fillRule="evenodd"
      clipRule="evenodd"
      strokeLinejoin="round"
      strokeMiterlimit="1.414"
    >
      <g transform="translate(-247.408 -297.688)">
        <clipPath id="a">
          <path d="M318.707 302.139l-56.173 32.423a6.78 6.78 0 00-3.395 5.875v64.89a6.778 6.778 0 003.395 5.875l56.177 32.448a6.802 6.802 0 006.786 0l56.168-32.448a6.793 6.793 0 003.387-5.875v-64.89a6.778 6.778 0 00-3.4-5.875l-56.16-32.423a6.83 6.83 0 00-6.8 0" />
        </clipPath>
        <g clipPath="url(#a)">
          <path
            d="M441.817 329.057L283.531 251.47l-81.16 165.565 158.282 77.591 81.164-165.569z"
            fill="url(#_Linear2)"
            fillRule="nonzero"
          />
        </g>
      </g>
      <g transform="translate(-247.408 -297.688)">
        <clipPath id="b">
          <path d="M260.531 409.447a6.776 6.776 0 002 1.755l48.186 27.833 8.027 4.614a6.81 6.81 0 003.912.886 6.93 6.93 0 001.333-.244l59.246-108.48a6.742 6.742 0 00-1.579-1.253l-36.781-21.24-19.443-11.187a7.094 7.094 0 00-1.76-.706l-63.141 108.022z" />
        </clipPath>
        <g clipPath="url(#b)">
          <path
            d="M192.094 352.005l111.766 151.27 147.813-109.208L339.9 242.801 192.094 352.005z"
            fill="url(#_Linear4)"
            fillRule="nonzero"
          />
        </g>
      </g>
      <g transform="translate(-247.408 -297.688)">
        <clipPath id="c">
          <path d="M321.421 301.27a6.857 6.857 0 00-2.713.869l-56.013 32.33 60.4 110.013c.84-.12 1.666-.4 2.413-.832l56.173-32.448a6.805 6.805 0 003.28-4.635l-61.573-105.186a7.002 7.002 0 00-1.373-.136c-.187 0-.374.009-.56.026" />
        </clipPath>
        <g clipPath="url(#c)">
          <path
            fill="url(#_Linear6)"
            fillRule="nonzero"
            d="M262.694 301.245h122.244v143.24H262.694z"
          />
        </g>
      </g>
      <defs>
        <linearGradient
          id="_Linear2"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="userSpaceOnUse"
          gradientTransform="rotate(116.114 -6688.68 -10615.442) scale(184.375)"
        >
          <stop offset="0" stopColor="#3e863d" />
          <stop offset=".3" stopColor="#3e863d" />
          <stop offset=".5" stopColor="#55934f" />
          <stop offset=".8" stopColor="#5aad45" />
          <stop offset="1" stopColor="#5aad45" />
        </linearGradient>
        <linearGradient
          id="_Linear4"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="userSpaceOnUse"
          gradientTransform="rotate(-36.46 49722.99 -16285.163) scale(183.793)"
        >
          <stop offset="0" stopColor="#3e863d" />
          <stop offset=".57" stopColor="#3e863d" />
          <stop offset=".72" stopColor="#619857" />
          <stop offset="1" stopColor="#76ac64" />
        </linearGradient>
        <linearGradient
          id="_Linear6"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(262.803 29719.2) scale(122.226)"
        >
          <stop offset="0" stopColor="#6bbf47" />
          <stop offset=".16" stopColor="#6bbf47" />
          <stop offset=".38" stopColor="#79b461" />
          <stop offset=".47" stopColor="#75ac64" />
          <stop offset=".7" stopColor="#659e5a" />
          <stop offset=".9" stopColor="#3e863d" />
          <stop offset="1" stopColor="#3e863d" />
        </linearGradient>
      </defs>
    </svg>
  ),
};

export function PlatformTabs({ children, defaultPlatform = 'web' }: PlatformTabsProps) {
  const platforms: { key: Platform; label: string; icon: React.ReactNode }[] = [
    { key: 'web', label: 'Web', icon: PlatformIcons.web },
    { key: 'react-native', label: 'React Native', icon: PlatformIcons['react-native'] },
    { key: 'node', label: 'Node.js', icon: PlatformIcons.node },
  ];

  const platformContents = useMemo(() => {
    const contents: Record<Platform, React.ReactNode[]> = {
      web: [],
      'react-native': [],
      node: [],
    };

    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        const props = child.props as { 'data-platform'?: Platform };
        if (props['data-platform']) {
          const platform = props['data-platform'];
          if (platform in contents) {
            contents[platform].push(child);
          }
        }
      }
    });

    return contents;
  }, [children]);

  const availablePlatforms = platforms.filter((p) => platformContents[p.key].length > 0);

  const defaultIndex = useMemo(() => {
    const index = availablePlatforms.findIndex((p) => p.key === defaultPlatform);
    return index >= 0 ? index : 0;
  }, [availablePlatforms, defaultPlatform]);

  const tabValues = availablePlatforms.map((platform) => (
    <div
      key={platform.key}
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 15,
      }}
    >
      {platform.icon}
      <span style={{ marginLeft: 6, marginBottom: 2 }}>{platform.label}</span>
    </div>
  ));

  return (
    <Tabs groupId="platform" values={tabValues} defaultIndex={defaultIndex}>
      {availablePlatforms.map((platform) => (
        <Tab key={platform.key}>{platformContents[platform.key]}</Tab>
      ))}
    </Tabs>
  );
}
