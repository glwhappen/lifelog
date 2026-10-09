import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Semi Design 的 CSS 需要在客户端加载，服务端渲染时忽略其样式解析告警
  transpilePackages: ['@douyinfe/semi-ui', '@douyinfe/semi-icons'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
