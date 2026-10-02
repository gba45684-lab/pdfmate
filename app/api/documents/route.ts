import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
async function client(response:NextResponse){
  const store=await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:(items)=>items.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
}
export async function GET(request:NextRequest){
  const response=NextResponse.json({documents:[]});
  const supabase=await client(response); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data,error}=await supabase.from("documents").select("id,name,size_bytes,storage_path,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
  if(error)return NextResponse.json({error:error.message},{status:500}); response.cookies.getAll().forEach(()=>{});
  return NextResponse.json({documents:data||[]},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:NextRequest){
  const response=NextResponse.json({document:null},{status:201});
  const supabase=await client(response); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.includes("application/json"))return NextResponse.json({error:"JSON required"},{status:415});
  const body=await request.json().catch(()=>null);
  if(!body?.name||typeof body.name!=="string")return NextResponse.json({error:"name is required"},{status:400});
  const {data,error}=await supabase.from("documents").insert({user_id:user.id,name:body.name.trim().slice(0,200),size_bytes:Math.max(0,Number(body.size_bytes)||0),storage_path:body.storage_path?String(body.storage_path).slice(0,500):null}).select("id,name,size_bytes,storage_path,created_at").single();
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({document:data},{status:201});
}