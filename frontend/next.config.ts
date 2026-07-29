import type { NextConfig } from "next";

// Next proxy /api/* sang FastAPI để UI + API dùng CHUNG một origin.
// Nhờ vậy deploy chỉ cần tunnel đúng 1 cổng (3000) và không phải build lại
// frontend mỗi lần URL backend đổi.
const API_TARGET = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_TARGET}/api/:path*` }];
  },
};

export default nextConfig;
