import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // El dominio es código fuente TS del monorepo: se empaqueta dentro del bundle.
  noExternal: ['@ggis/domain'],
  // Conservar "node:sqlite": sin el prefijo, Node lo busca como paquete de npm y falla.
  removeNodeProtocol: false,
});
