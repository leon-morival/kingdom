import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Les bases locales (jeu et essais) ne font jamais partie des artefacts à déployer.
  outputFileTracingExcludes: { '/*': ['.data/**/*'] },
  /* config options here */
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
}

export default nextConfig
