import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O repositório tem dois package-lock.json (a raiz, que roda TypeScript sem
  // build, e este app Next). Sem isto o Turbopack elege a raiz como workspace
  // root e avisa a cada build. O app web é auto-contido: sua raiz é esta pasta.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
