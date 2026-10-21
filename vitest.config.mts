import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Même alias que dans tsconfig.json : « @/ » désigne le répertoire src/.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // Les tests s'exécutent dans Node.js, sans navigateur simulé.
    environment: 'node',
    // Seuls les fichiers de test placés dans src/ sont exécutés.
    include: ['src/**/*.test.ts'],
    // Chaque fichier démarre une base PGlite : limiter la concurrence évite de saturer
    // la machine et de faire expirer les migrations avant le début des tests.
    maxWorkers: 4,
    // Le démarrage de plusieurs bases PGlite en parallèle peut dépasser cinq secondes.
    testTimeout: 20_000,
    hookTimeout: 15_000,
    // Les tests s'exécutent toujours dans un environnement de test, y compris lorsqu'ils
    // sont lancés par la construction Vercel, où NODE_ENV vaut « production ».
    env: { NODE_ENV: 'test' },
  },
})
