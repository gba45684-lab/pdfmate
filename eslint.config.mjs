import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  // Blob/object-URL page previews cannot use next/image.
  { rules: { "@next/next/no-img-element": "off" } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "android/**", "www/**", "mobile/**"])
]);
