"use client";

import { useEffect } from "react";

export function AdminInviteRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has("access_token") && params.has("refresh_token")) {
      window.location.replace(`/admin/nueva-clave${window.location.hash}`);
    }
  }, []);

  return null;
}
