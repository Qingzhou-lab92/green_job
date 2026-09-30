import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
for (const folder of ["cmaps", "standard_fonts"]) {
  const target = new URL(`public/pdfjs/${folder}/`, root);
  await mkdir(fileURLToPath(target), { recursive: true });
  await cp(
    fileURLToPath(new URL(`node_modules/pdfjs-dist/${folder}/`, root)),
    fileURLToPath(target),
    { recursive: true },
  );
}
console.log("Local PDF character maps and fonts are ready.");
