"use client";

import { Button, Field, inputClass, Notice } from "@forja/ui";
import { useActionState } from "react";
import { confirmTwoFactorSetup, startTwoFactorSetup, type SetupState } from "../actions";

export function TwoFactorSetup() {
  const [setup, start, starting] = useActionState(startTwoFactorSetup, {} as SetupState);
  const [confirm, verify, verifying] = useActionState(confirmTwoFactorSetup, {} as SetupState);

  if (!setup.qr) {
    return (
      <form action={start} className="space-y-4">
        <Field label="Confirme sua senha">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        {setup.error ? <Notice tone="red">{setup.error}</Notice> : null}
        <Button type="submit" disabled={starting} className="w-full">
          {starting ? "Gerando…" : "Gerar QR code"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code para o app autenticador" width={220} height={220} />
        {setup.secret ? <code className="break-all text-center text-xs text-zinc-500">{setup.secret}</code> : null}
      </div>
      {setup.backupCodes?.length ? (
        <Notice tone="amber">
          <p className="mb-2 font-medium">Guarde estes códigos de backup num lugar seguro (cada um vale uma vez):</p>
          <p className="font-mono text-xs leading-6">{setup.backupCodes.join("  ·  ")}</p>
        </Notice>
      ) : null}
      <form action={verify} className="space-y-3">
        <Field label="Código de 6 dígitos do app">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputClass} text-center text-lg tracking-widest`} />
        </Field>
        {confirm.error ? <Notice tone="red">{confirm.error}</Notice> : null}
        <Button type="submit" disabled={verifying} className="w-full">
          {verifying ? "Verificando…" : "Ativar e entrar"}
        </Button>
      </form>
    </div>
  );
}
