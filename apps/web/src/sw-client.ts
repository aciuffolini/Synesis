import { registerSW } from "virtual:pwa-register";

export const initSW = (cb?: (m: string) => void) =>
  registerSW({
    onNeedRefresh(){ cb?.("Nueva versión disponible"); },
    onOfflineReady(){ cb?.("Listo offline"); }
  });

