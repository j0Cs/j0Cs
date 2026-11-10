"use client";

import { AvisoAcesso, Button, CampoAcesso, inputAcessoClass } from "@forja/ui";
import { useActionState } from "react";
import { confirmarDuasEtapasAction, desligarDuasEtapasAction, iniciarDuasEtapasAction, type Estado2FA } from "@/app/(auth)/conta/seguranca/actions";

/** Liga a verificação em duas etapas: senha → QR code e códigos de backup → código do app. */
export function LigarDuasEtapas({ depois }: { depois?: string }) {
  const [inicio, iniciar, iniciando] = useActionState(iniciarDuasEtapasAction, {} as Estado2FA);
  const [confirmacao, confirmar, confirmando] = useActionState(confirmarDuasEtapasAction, {} as Estado2FA);

  if (!inicio.qr) {
    return (
      <form action={iniciar} className="space-y-5">
        <CampoAcesso label="Confirme sua senha" hint="Entrou por link ou pelo GitHub? Crie uma senha em Esqueci a senha antes.">
          <input name="password" type="password" autoComplete="current-password" required className={inputAcessoClass} />
        </CampoAcesso>
        {inicio.error ? <AvisoAcesso tom="erro">{inicio.error}</AvisoAcesso> : null}
        <Button type="submit" variant="brasa" disabled={iniciando} className="w-full py-2.5 text-[15px]">
          {iniciando ? "Gerando…" : "Gerar o QR code"}
        </Button>
      </form>
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-aco-300">Abra o Google Authenticator, o Microsoft Authenticator ou o 1Password e leia o QR code.</p>
      <div className="flex flex-col items-center gap-3">
        {/* fundo branco: o QR precisa de contraste para a câmera */}
        <div className="rounded-md bg-white p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={inicio.qr} alt="QR code para o app autenticador" width={200} height={200} />
        </div>
        {inicio.secret ? <code className="break-all text-center font-mono text-xs text-aco-300">{inicio.secret}</code> : null}
      </div>
      {inicio.backupCodes?.length ? (
        <AvisoAcesso tom="atencao">
          <p className="mb-2 font-medium">Guarde estes códigos de backup. Cada um vale uma vez e serve se você ficar sem o celular:</p>
          <p className="font-mono text-xs leading-6 text-aco-100">{inicio.backupCodes.join("  ·  ")}</p>
        </AvisoAcesso>
      ) : null}
      <form action={confirmar} className="space-y-5">
        {depois ? <input type="hidden" name="depois" value={depois} /> : null}
        <CampoAcesso label="Código de 6 dígitos do app">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputAcessoClass} text-center font-mono text-2xl tracking-[0.4em]`} />
        </CampoAcesso>
        {confirmacao.error ? <AvisoAcesso tom="erro">{confirmacao.error}</AvisoAcesso> : null}
        <Button type="submit" variant="brasa" disabled={confirmando} className="w-full py-2.5 text-[15px]">
          {confirmando ? "Verificando…" : "Ativar a verificação"}
        </Button>
      </form>
    </div>
  );
}

export function DesligarDuasEtapas() {
  const [estado, desligar, desligando] = useActionState(desligarDuasEtapasAction, {} as Estado2FA);
  return (
    <form action={desligar} className="space-y-5">
      <CampoAcesso label="Confirme sua senha para desligar">
        <input name="password" type="password" autoComplete="current-password" required className={inputAcessoClass} />
      </CampoAcesso>
      {estado.error ? <AvisoAcesso tom="erro">{estado.error}</AvisoAcesso> : null}
      <Button type="submit" variant="aco" disabled={desligando} className="w-full py-2.5 text-[15px]">
        {desligando ? "Desligando…" : "Desligar a verificação em duas etapas"}
      </Button>
    </form>
  );
}
