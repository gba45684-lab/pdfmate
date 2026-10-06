#!/usr/bin/env bash
# Creates the sample files the e2e suites use in /tmp/e2e. Needs: python3 + Pillow, node (pdf-lib from node_modules), soffice (optional, for the docx).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p /tmp/e2e && cd /tmp/e2e
python3 - <<'PY'
from PIL import Image, ImageDraw, ImageFont
Image.new("RGB",(640,480),(200,40,90)).save("a.png"); Image.new("RGB",(300,500),(20,120,200)).save("b.jpg")
im=Image.new("RGB",(1400,380),"white"); d=ImageDraw.Draw(im); f=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",70)
d.text((60,60),"Hello PDFMate offline",font=f,fill="black"); d.text((60,200),"OCR test 12345",font=f,fill="black"); im.save("scan.pdf",resolution=150)
PY
( cd "$ROOT" && node -e '
const {PDFDocument,StandardFonts,rgb}=require("pdf-lib");const fs=require("fs");(async()=>{
const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);
for(let i=1;i<=3;i++){const p=d.addPage([595,842]);p.drawText("Page "+i+" PDFMate sample",{x:60,y:760,size:28,font:f});p.drawRectangle({x:60,y:500,width:200,height:100,color:rgb(.8,.9,1)})}
fs.writeFileSync("/tmp/e2e/sample.pdf",await d.save());
const f2=await PDFDocument.create();const pg=f2.addPage([400,300]);f2.getForm().createTextField("fullname").addToPage(pg,{x:50,y:200,width:200,height:24});
fs.writeFileSync("/tmp/e2e/form.pdf",await f2.save())})()' )
python3 -c "d=open('/tmp/e2e/sample.pdf','rb').read(); open('/tmp/e2e/big.pdf','wb').write(d+b'\n%'+b'A'*6_500_000+b'\n')"
printf 'Hello from a Word document.\nSecond line.\n' > hello.txt
soffice --headless --convert-to docx --outdir /tmp/e2e hello.txt >/dev/null 2>&1 || echo "soffice missing: the office test will fail"
echo "fixtures ready in /tmp/e2e"
