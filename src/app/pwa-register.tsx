"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    let timer: number | undefined;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
        void registration.update();
        timer = window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      }).catch(() => undefined);
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, []);
  return null;
}
