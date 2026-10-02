import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import Busboy from "busboy";
const exec=promisify(execFile);
const PORT=Number(process.env.PORT||8080);
const TOKEN=process.env.PDF_WORKER_TOKEN||"";
const MAX_BYTES=Number(process.env.MAX_FILE_BYTES||50*1024*1024);

function send(res,status,type,body,headers={}){res.writeHead(status,{"Content-Type":type,...headers});res.end(body);}
async function parse(req){
  return await new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{fileSize:MAX_BYTES,files:1,fields:8}});
    let file=null,password="";
    bb.on("file",(name,stream,info)=>{
      const chunks=[]; let size=0;
      stream.on("data",b=>{size+=b.length;if(size<=MAX_BYTES)chunks.push(b);});
      stream.on("limit",()=>reject(new Error("File too large.")));
      stream.on("end",()=>{if(name==="file")file={buffer:Buffer.concat(chunks),name:info.filename||"input.pdf"};});
    });
    bb.on("field",(name,value)=>{if(name==="password")password=value;});
    bb.on("error",reject); bb.on("finish",()=>resolve({file,password}));
    req.pipe(bb);
  });
}
async function runQpdf(input,output,password){
  await exec("qpdf",["--encrypt","",password,"256","--",input,output,"--replace-input"],{maxBuffer:1024*1024});
}
async function main(req,res){
  if(req.method!=="POST")return send(res,405,"text/plain","Method Not Allowed");
  if(TOKEN && req.headers.authorization!=="Bearer "+TOKEN)return send(res,401,"application/json",JSON.stringify({error:"Unauthorized"}));
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"pdfmate-"));
  try{
    const {file,password}=await parse(req);
    if(!file)return send(res,400,"application/json",JSON.stringify({error:"file is required"}));
    if(!password || password.length<8)return send(res,400,"application/json",JSON.stringify({error:"password must be at least 8 characters"}));
    const input=path.join(tmp,"input.pdf"), output=path.join(tmp,"protected.pdf");
    await fs.writeFile(input,file.buffer);
    await exec("qpdf",["--check",input],{maxBuffer:1024*1024});
    await exec("qpdf",["--encrypt","",password,"256","--",input,output],{maxBuffer:1024*1024});
    const result=await fs.readFile(output);
    send(res,200,"application/pdf",result,{"Content-Disposition":'attachment; filename="pdfmate-protected.pdf"',"Cache-Control":"no-store"});
  }catch(error){send(res,422,"application/json",JSON.stringify({error:error instanceof Error?error.message:"Worker failed"}));}
  finally{await fs.rm(tmp,{recursive:true,force:true});}
}
http.createServer((req,res)=>main(req,res).catch(e=>send(res,500,"application/json",JSON.stringify({error:e.message||"Worker error"})))).listen(PORT,"0.0.0.0",()=>console.log("PDFMate worker listening on "+PORT));