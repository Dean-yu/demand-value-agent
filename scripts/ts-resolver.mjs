// Node import hook: when a bare relative import is missing an extension,
// try adding .ts / .tsx / index.ts / index.tsx so we can run the source as-is.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.(m?[jt]sx?|json)$/i.test(specifier)
  ) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const baseDir = dirname(parent);
    const base = pathResolve(baseDir, specifier);
    for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (existsSync(cand)) {
        return nextResolve(cand, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
