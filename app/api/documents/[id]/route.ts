import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
import {forbidden,sameOrigin} from "../../../../lib/guard";
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!sameOrigin(request))return forbidden();
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return NextResponse.json({error:"Cloud storage is not configured."},{status:503});
  const response=NextResponse.next(); const store=await cookies();
  const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:items=>items.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params; const {data:doc,error:getError}=await supabase.from("documents").select("id,storage_path").eq("id",id).eq("user_id",user.id).single();
  if(getError||!doc)return NextResponse.json({error:"Document not found"},{status:404});
  if(doc.storage_path) await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET||"documents").remove([doc.storage_path]);
  const {error}=await supabase.from("documents").delete().eq("id",id).eq("user_id",user.id);
  if(error)return NextResponse.json({error:error.message},{status:500});
  const out=NextResponse.json({ok:true}); for(const cookie of response.cookies.getAll())out.cookies.set(cookie); return out;
}