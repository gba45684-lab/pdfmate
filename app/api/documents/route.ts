import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
import {forbidden,sameOrigin} from "../../../lib/guard";
async function client(response:NextResponse){
  const store=await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:(items)=>items.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
}
function withCookies(source:NextResponse, target:NextResponse){for(const cookie of source.cookies.getAll())target.cookies.set(cookie);return target;}
export async function GET(){
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return NextResponse.json({error:"Cloud storage is not configured."},{status:503});
  const response=NextResponse.next(); const supabase=await client(response);
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data,error}=await supabase.from("documents").select("id,name,size_bytes,storage_path,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return withCookies(response,NextResponse.json({documents:data||[]},{headers:{"Cache-Control":"private, no-store"}}));
}
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return forbidden();
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return NextResponse.json({error:"Cloud storage is not configured."},{status:503});
  const response=NextResponse.next(); const supabase=await client(response);
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!(request.headers.get("content-type")||"").includes("application/json"))return NextResponse.json({error:"JSON required"},{status:415});
  const body=await request.json().catch(()=>null);
  if(!body?.name||typeof body.name!=="string")return NextResponse.json({error:"name is required"},{status:400});
  const storagePath=typeof body.storage_path==="string"&&body.storage_path?body.storage_path:null;
  if(storagePath&&(!storagePath.startsWith(user.id+"/")||storagePath.split("/").some((part:string)=>part===".."||part===".")||storagePath.length>500))return NextResponse.json({error:"Invalid storage path"},{status:400});
  const name=body.name.trim().slice(0,200); if(!name)return NextResponse.json({error:"name is required"},{status:400});
  const {data,error}=await supabase.from("documents").insert({user_id:user.id,name,size_bytes:Math.min(Math.max(0,Math.floor(Number(body.size_bytes))||0),5*1024**3),storage_path:storagePath}).select("id,name,size_bytes,storage_path,created_at").single();
  if(error)return NextResponse.json({error:error.message},{status:500});
  return withCookies(response,NextResponse.json({document:data},{status:201}));
}