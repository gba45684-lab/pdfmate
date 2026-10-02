import {NextRequest,NextResponse} from "next/server";
export async function POST(request:NextRequest){
  const worker=process.env.PDF_WORKER_URL;
  const token=process.env.PDF_WORKER_TOKEN;
  const body=await request.json().catch(()=>null);
  if(!worker)return NextResponse.json({error:"Secure PDF worker is not configured."},{status:503});
  if(typeof body?.password!=="string"||body.password.length<8)return NextResponse.json({error:"Password must be at least 8 characters."},{status:400});
  const upstream=await fetch(worker,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify({action:"protect",password:body.password})});
  if(!upstream.ok)return NextResponse.json({error:"PDF worker failed."},{status:502});
  return new NextResponse(upstream.body,{status:upstream.status,headers:{"Content-Type":upstream.headers.get("content-type")||"application/pdf"}});
}
