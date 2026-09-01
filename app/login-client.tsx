"use client";

import { FormEvent, useRef, useState } from "react";
import { KeyRound, LoaderCircle, LockKeyhole, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginClient({ setupRequired }: { setupRequired: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (setupRequired && password !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        setupRequired ? "/api/auth/bootstrap" : "/api/auth/login",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(
            setupRequired ? { email, password, activationCode } : { email, password },
          ),
        },
      );
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error ?? "Não foi possível entrar.");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
      requestAnimationFrame(() => emailRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f5f0e9] p-4">
      <div className="absolute -left-28 -top-28 size-80 rounded-full bg-[#c9472e]/10 blur-3xl" />
      <div className="absolute -bottom-36 -right-28 size-96 rounded-full bg-[#e5a35b]/15 blur-3xl" />
      <section className="relative w-full max-w-md rounded-[28px] border border-[#e5d9cd] bg-[#fffdf9] p-6 shadow-[0_24px_80px_rgba(85,55,37,.13)] sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#c9472e] text-white shadow-[0_10px_28px_rgba(201,71,46,.25)]">
            <Scale className="size-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#907b69]">Alê Pizzas</p>
            <h1 className="font-display text-2xl font-semibold text-[#352b24]">Controle de Mussarela</h1>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-2 text-[#8f3c2b]">
            {setupRequired ? <KeyRound className="size-4" /> : <LockKeyhole className="size-4" />}
            <p className="text-sm font-bold">
              {setupRequired ? "Configuração do primeiro acesso" : "Acesso ao sistema"}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#806f62]">
            {setupRequired
              ? "Defina a senha do supervisor usando o código único da migração."
              : "Entre com o e-mail cadastrado e a sua senha."}
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-semibold text-[#4b3e35]">
            E-mail
            <Input
              ref={emailRef}
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@exemplo.com"
              required
              className="h-11 bg-white"
            />
          </label>
          {setupRequired && (
            <label className="grid gap-1.5 text-sm font-semibold text-[#4b3e35]">
              Código de ativação
              <Input
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value)}
                autoComplete="one-time-code"
                required
                className="h-11 bg-white"
              />
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-semibold text-[#4b3e35]">
            {setupRequired ? "Nova senha" : "Senha"}
            <Input
              type="password"
              autoComplete={setupRequired ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={setupRequired ? 12 : undefined}
              maxLength={128}
              required
              className="h-11 bg-white"
            />
            {setupRequired && (
              <span className="text-xs font-normal text-[#8f7c6e]">
                Mínimo de 12 caracteres, contendo letra e número.
              </span>
            )}
          </label>
          {setupRequired && (
            <label className="grid gap-1.5 text-sm font-semibold text-[#4b3e35]">
              Confirmar nova senha
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={12}
                maxLength={128}
                required
                className="h-11 bg-white"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-[#f0c8c1] bg-[#fff1ef] px-4 py-3 text-sm text-[#a83827]">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="mt-1 h-11 bg-[#c9472e] hover:bg-[#ad3c28]">
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {loading ? "Processando..." : setupRequired ? "Ativar acesso" : "Entrar"}
          </Button>
        </form>
        {!setupRequired && (
          <p className="mt-5 text-center text-xs leading-5 text-[#8f7c6e]">
            Para redefinir a senha, solicite ao supervisor do sistema.
          </p>
        )}
      </section>
    </main>
  );
}

async function safeJson(response: Response): Promise<{ error?: string }> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return {};
  }
}
