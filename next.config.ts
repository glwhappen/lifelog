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
          // 个人数据站不要被嵌进任何 iframe（含 clickjacking 防护）
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
          // 用不到的浏览器能力一律关掉
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' },
        ],
      },
      {
        // API 只应被同源页面或带密钥的客户端调用
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Vary', value: 'Authorization, Cookie' },
        ],
      },
    ];
  },
};

export default nextConfig;
