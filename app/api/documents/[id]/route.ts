import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const store=await cookies(); const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:items=>items.forEach(({name,value,options})=>request.headers.set("x-pdfmate-cookie-"+name,value))}});
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params; const {data:doc,error:getError}=await supabase.from("documents").select("id,storage_path").eq("id",id).eq("user_id",user.id).single();
  if(getError||!doc)return NextResponse.json({error:"Document not found"},{status:404});
  if(doc.storage_path) await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET||"documents").remove([doc.storage_path]);
  const {error}=await supabase.from("documents").delete().eq("id",id).eq("user_id",user.id);
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({ok:true});
}
