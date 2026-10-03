import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg", "mammoth", "unpdf", "docx", "nodemailer", "@contentauth/c2pa-node", "exifr"],
  // The C2PA SDK loads its native binary with a dynamic require that file tracing can't follow.
  outputFileTracingIncludes: {
    "/api/detect/image": ["./node_modules/@contentauth/c2pa-node/dist/index.node"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
