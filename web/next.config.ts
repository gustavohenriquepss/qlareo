import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app Next mora em `web/`, não na raiz do repositório. Fixar a raiz evita
  // que o Turbopack eleja um package-lock.json de uma pasta acima como
  // workspace root (e avise a cada build).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
