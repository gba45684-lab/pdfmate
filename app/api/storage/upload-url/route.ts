import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
export async function POST(request:NextRequest){
  const bucket=process.env.SUPABASE_STORAGE_BUCKET||"documents";
  const response=NextResponse.json({error:"Upload URL unavailable"},{status:500});
  const store=await cookies();
  const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:(items)=>items.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null); const name=typeof body?.name==="string"?body.name.trim():"";
  if(!name)return NextResponse.json({error:"name is required"},{status:400});
  const safe=name.replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,160)||"document.pdf";
  const path=user.id+"/"+crypto.randomUUID()+"-"+safe;
  const {data,error}=await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({bucket,path,token:data.token},{headers:{"Cache-Control":"no-store"}});
}