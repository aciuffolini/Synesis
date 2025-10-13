import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import RiskSimApp from "./RiskSimApp";
import InstallPrompt from "./InstallPrompt";
import { initSW } from "./sw-client";

function OnlineBadge(){
  const [on,setOn]=React.useState(navigator.onLine);
  React.useEffect(()=>{ const a=()=>setOn(true), b=()=>setOn(false);
    addEventListener("online",a); addEventListener("offline",b);
    return()=>{removeEventListener("online",a); removeEventListener("offline",b);}
  },[]);
  return <div className="fixed top-4 right-4 text-xs px-2 py-1 rounded-xl border border-neutral-700 bg-neutral-900 text-gray-200">
    {on?"Online":"Offline"}
  </div>;
}

function Root(){
  React.useEffect(()=>{ initSW(); },[]);
  return (<>
    <OnlineBadge />
    <RiskSimApp />
    <InstallPrompt />
  </>);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Root/></React.StrictMode>);
