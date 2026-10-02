import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
export async function POST(request:NextRequest){
  const worker=process.env.PDF_WORKER_URL, token=process.env.PDF_WORKER_TOKEN;
  if(!worker)return NextResponse.json({error:"Secure PDF worker is not configured."},{status:503});
  const incoming=await request.formData().catch(()=>null); const file=incoming?.get("file"); const action=incoming?.get("action");
  if(!(file instanceof File))return NextResponse.json({error:"PDF file is required."},{status:400});
  if(action!=="compress" && action!=="office-to-pdf")return NextResponse.json({error:"Unsupported worker action."},{status:400});
  const form=new FormData(); form.append("file",file,file.name||"input.pdf"); form.append("action",action);
  const upstream=await fetch(worker,{method:"POST",headers:token?{Authorization:"Bearer "+token}:undefined,body:form});
  if(!upstream.ok)return NextResponse.json({error:"PDF worker failed."},{status:502});
  return new NextResponse(upstream.body,{status:upstream.status,headers:{"Content-Type":upstream.headers.get("content-type")||"application/pdf","Content-Disposition":upstream.headers.get("content-disposition")||"attachment; filename=\"pdfmate-optimized.pdf\""}});
}
