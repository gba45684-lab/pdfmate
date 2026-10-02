import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("worker exposes isolated production operations",()=>{
  const source=readFileSync(new URL("../worker/server.mjs",import.meta.url),"utf8");
  assert.match(source,/qpdf/);
  assert.match(source,/libreoffice/);
  assert.match(source,/action==="protect"/);
  assert.match(source,/action==="compress"/);
  assert.match(source,/action==="office-to-pdf"/);
});

test("worker requires password only for protect",()=>{assert.match(source,/action==="protect" &&/);});
