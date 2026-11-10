// Empacota o processo principal e o preload num arquivo cada (sem node_modules no app final).
import { build } from "esbuild";

const comum = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  define: { __FORJA_URL__: JSON.stringify(process.env.FORJA_URL_DO_APP ?? "https://forja-web-rampin-tech.vercel.app") },
};

await build({ ...comum, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" });
await build({ ...comum, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" });
