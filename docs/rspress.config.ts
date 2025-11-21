import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: 'docs',
  title: 'HWPJS',
  description: 'HWP file reader library for React Native and Node.js',
  icon: '/favicon.ico',
  logo: {
    light: '/logo-light.png',
    dark: '/logo-dark.png',
  },
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/guide',
      },
      {
        text: 'API',
        link: '/api',
      },
    ],
    sidebar: {
      '/': [
        {
          text: 'Introduction',
          link: '/',
        },
      ],
    },
  },
});

