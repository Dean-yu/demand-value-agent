/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist 含 canvas / DOM Mock 等 Node 原生依赖，
  // 必须让 Next.js 把它当外部包，否则 webpack 打包会报 "Module not found: canvas"。
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb"
    }
  }
};

module.exports = nextConfig;
