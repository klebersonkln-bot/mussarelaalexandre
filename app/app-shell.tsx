"use client";

import { useEffect, useState } from "react";
import DashboardClient from "./dashboard-client";
import LoginClient from "./login-client";

type AuthState =
  | { status: "loading" }
  | { status: "authenticated" }
  | { status: "anonymous"; setupRequired: boolean };

export default function AppShell() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/auth/status", {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao verificar o acesso.");
        return (await response.json()) as {
          authenticated: boolean;
          setupRequired: boolean;
        };
      })
      .then((result) =>
        setState(
          result.authenticated
            ? { status: "authenticated" }
            : { status: "anonymous", setupRequired: result.setupRequired },
        ),
      )
      .catch(() => setState({ status: "anonymous", setupRequired: false }));
  }, []);

  if (state.status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f0e9]">
        <p className="text-sm font-medium text-[#806f62]">Carregando acesso...</p>
      </main>
    );
  }
  if (state.status === "anonymous") {
    return <LoginClient setupRequired={state.setupRequired} />;
  }
  return <DashboardClient />;
}
