import {NextRequest,NextResponse} from "next/server";

export const runtime = "nodejs";

export async function POST(request:NextRequest){
  const worker=process.env.PDF_WORKER_URL;
  const token=process.env.PDF_WORKER_TOKEN;
  if(!worker)return NextResponse.json({error:"Secure PDF worker is not configured."},{status:503});
  const incoming=await request.formData().catch(()=>null);
  const file=incoming?.get("file");
  const password=incoming?.get("password");
  if(!(file instanceof File))return NextResponse.json({error:"PDF file is required."},{status:400});
  if(typeof password!=="string"||password.length<8)return NextResponse.json({error:"Password must be at least 8 characters."},{status:400});
  const form=new FormData(); form.append("file",file,file.name||"input.pdf"); form.append("password",password); form.append("action","protect");
  const upstream=await fetch(worker,{method:"POST",headers:token?{Authorization:"Bearer "+token}:undefined,body:form});
  if(!upstream.ok)return NextResponse.json({error:"PDF worker failed."},{status:502});
  return new NextResponse(upstream.body,{status:upstream.status,headers:{"Content-Type":upstream.headers.get("content-type")||"application/pdf","Content-Disposition":upstream.headers.get("content-disposition")||'attachment; filename="protected.pdf"'}});
}
