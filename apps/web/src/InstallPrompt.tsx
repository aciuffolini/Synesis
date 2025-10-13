import { useEffect, useRef, useState } from "react";

export default function InstallPrompt(){
  const [can,setCan]=useState(false);
  const evt=useRef<any>(null);

  useEffect(()=>{
    const h=(e:any)=>{ e.preventDefault(); evt.current=e; setCan(true); };
    window.addEventListener("beforeinstallprompt",h);
    return ()=> window.removeEventListener("beforeinstallprompt",h);
  },[]);

  if(!can) return null;

  return (
    <button
      onClick={async()=>{ await evt.current?.prompt(); setCan(false); }}
      className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl">
      Instalar app
    </button>
  );
}
