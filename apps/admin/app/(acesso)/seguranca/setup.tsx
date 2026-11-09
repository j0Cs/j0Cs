"use client";

import { AvisoAcesso, Button, CampoAcesso, inputAcessoClass } from "@forja/ui";
import { useActionState } from "react";
import { confirmTwoFactorSetup, startTwoFactorSetup, type SetupState } from "../actions";

export function TwoFactorSetup() {
  const [setup, start, starting] = useActionState(startTwoFactorSetup, {} as SetupState);
  const [confirm, verify, verifying] = useActionState(confirmTwoFactorSetup, {} as SetupState);

  if (!setup.qr) {
    return (
      <form action={start} className="space-y-5">
        <CampoAcesso label="Confirme sua senha">
          <input name="password" type="password" autoComplete="current-password" required className={inputAcessoClass} />
        </CampoAcesso>
        {setup.error ? <AvisoAcesso tom="erro">{setup.error}</AvisoAcesso> : null}
        <Button type="submit" variant="brasa" disabled={starting} className="w-full py-2.5 text-[15px]">
          {starting ? "Gerando…" : "Gerar QR code"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        {/* fundo branco: o QR precisa de contraste para a câmera */}
        <div className="rounded-md bg-white p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code para o app autenticador" width={200} height={200} />
        </div>
        {setup.secret ? <code className="break-all text-center font-mono text-xs text-aco-400">{setup.secret}</code> : null}
      </div>
      {setup.backupCodes?.length ? (
        <AvisoAcesso tom="atencao">
          <p className="mb-2 font-medium">Guarde estes códigos de backup num lugar seguro (cada um vale uma vez):</p>
          <p className="font-mono text-xs leading-6 text-aco-100">{setup.backupCodes.join("  ·  ")}</p>
        </AvisoAcesso>
      ) : null}
      <form action={verify} className="space-y-5">
        <CampoAcesso label="Código de 6 dígitos do app">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className={`${inputAcessoClass} text-center font-mono text-2xl tracking-[0.5em]`}
          />
        </CampoAcesso>
        {confirm.error ? <AvisoAcesso tom="erro">{confirm.error}</AvisoAcesso> : null}
        <Button type="submit" variant="brasa" disabled={verifying} className="w-full py-2.5 text-[15px]">
          {verifying ? "Verificando…" : "Ativar e entrar"}
        </Button>
      </form>
    </div>
  );
}
