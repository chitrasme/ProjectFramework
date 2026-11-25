import type { NextConfig } from "next";

const maxMb = Number(process.env.MAX_UPLOAD_MB || 25);

const nextConfig: NextConfig = {
  // Uploads go through server actions; allow the configured file size plus form overhead.
  experimental: { serverActions: { bodySizeLimit: `${maxMb + 2}mb` } },
  serverExternalPackages: ["exceljs", "pdf-lib"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
