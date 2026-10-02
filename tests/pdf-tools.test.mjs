import test from "node:test"; import assert from "node:assert/strict"; import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../lib/pdf-tools.ts",import.meta.url),"utf8");
test("core PDF operations exist",()=>{for(const name of ["mergePdfs","extractPages","deletePages","rotatePages","compressPdf","redactPages","inspectPdf"])assert.match(source,new RegExp("export async function "+name));});
test("inspection does not claim unverifiable encryption status",()=>assert.doesNotMatch(source,/encrypted:\s*false/));
