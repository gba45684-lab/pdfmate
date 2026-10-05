import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
import {forbidden,sameOrigin} from "../../../../lib/guard";
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return forbidden();
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return NextResponse.json({error:"Cloud storage is not configured."},{status:503});
  const store=await cookies(); const response=NextResponse.next();
  const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:items=>items.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null); if(typeof body?.document_id!=="string")return NextResponse.json({error:"document_id is required"},{status:400});
  const {data:doc}=await supabase.from("documents").select("storage_path").eq("id",body.document_id).eq("user_id",user.id).single();
  if(!doc?.storage_path)return NextResponse.json({error:"Stored file not found"},{status:404});
  const {data,error}=await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET||"documents").createSignedUrl(doc.storage_path,300);
  if(error)return NextResponse.json({error:error.message},{status:500}); const out=NextResponse.json({url:data.signedUrl,expires_in:300},{headers:{"Cache-Control":"private, no-store"}}); for(const cookie of response.cookies.getAll()) out.cookies.set(cookie); return out;
}
