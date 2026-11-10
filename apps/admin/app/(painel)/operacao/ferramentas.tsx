"use client";

import { Button, inputClass, Notice } from "@forja/ui";
import { Check, Copy } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { gerarAcessoDoBackupAction, gerarChaveDeCriptografiaAction, gerarChavesDoBackupAction, recifrarAction, trocarSenhaAction } from "./actions";

export function TrocarSenha() {
  const [estado, enviar, enviando] = useActionState(trocarSenhaAction, {});
  return (
    <form action={enviar} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600">Senha atual</span>
        <input name="atual" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600">Senha nova (14 caracteres ou mais)</span>
        <input name="nova" type="password" autoComplete="new-password" minLength={14} required className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600">Repita a senha nova</span>
        <input name="confirmacao" type="password" autoComplete="new-password" minLength={14} required className={inputClass} />
      </label>
      <Button type="submit" variant="secondary" size="sm" disabled={enviando}>
        {enviando ? "Trocando…" : "Trocar a senha"}
      </Button>
      {estado.erro ? <Notice tone="red">{estado.erro}</Notice> : null}
      {estado.ok ? <Notice tone="blue">{estado.ok}</Notice> : null}
    </form>
  );
}

/** Segredo aleatório gerado no próprio navegador (não passa pelo servidor). */
export function GerarSegredo() {
  const [valor, setValor] = useState<string | null>(null);
  return valor ? (
    <Copiavel rotulo="Segredo aleatório (32 bytes, base64): cole direto na Vercel" valor={valor} segredo />
  ) : (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        const b = crypto.getRandomValues(new Uint8Array(32));
        setValor(btoa(String.fromCharCode(...b)));
      }}
    >
      Gerar um segredo aleatório
    </Button>
  );
}

function Copiavel({ rotulo, valor, segredo }: { rotulo: string; valor: string; segredo?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-600">{rotulo}</div>
      <div className="flex items-start gap-2">
        <code className={`min-w-0 flex-1 break-all rounded-lg px-3 py-2 text-xs ${segredo ? "bg-amber-50 text-amber-900" : "bg-zinc-100 text-zinc-800"}`}>{valor}</code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(valor);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          aria-label={`Copiar ${rotulo}`}
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
        </Button>
      </div>
    </div>
  );
}

export function GerarChavesDoBackup() {
  const [chaves, setChaves] = useState<{ publica: string; privada: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (chaves) {
    return (
      <div className="space-y-3">
        <Notice tone="red">
          A chave privada aparece <b>só agora</b> e não fica guardada em lugar nenhum. Salve no seu gerenciador de senhas (e numa segunda cópia fora do
          computador). Sem ela, nenhum backup abre.
        </Notice>
        <Copiavel rotulo="Chave privada (guarde com você; nunca no GitHub nem no Supabase)" valor={chaves.privada} segredo />
        <Copiavel rotulo="Chave pública: no GitHub, Settings → Secrets and variables → Actions → Variables → BACKUP_AGE_RECIPIENT" valor={chaves.publica} />
      </div>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={ocupado}
      onClick={() =>
        iniciar(async () => {
          if (!window.confirm("Gerar um par de chaves novo? Backups antigos continuam abrindo só com a chave privada antiga.")) return;
          setChaves(await gerarChavesDoBackupAction());
        })
      }
    >
      Gerar par de chaves do backup
    </Button>
  );
}

export function GerarAcessoDoBackup() {
  const [r, setR] = useState<{ url?: string; erro?: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (r?.url) {
    return (
      <div className="space-y-3">
        <Copiavel rotulo="No GitHub: Settings → Secrets and variables → Actions → Secrets → BACKUP_DATABASE_URL (mostrada uma vez)" valor={r.url} segredo />
        <p className="text-xs text-zinc-600">Este acesso só lê as tabelas da Forja e grava o resultado do backup. Gerar de novo troca a senha.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            if (!window.confirm("Gerar o acesso do backup ao banco? Se já existir, a senha antiga para de funcionar.")) return;
            setR(await gerarAcessoDoBackupAction());
          })
        }
      >
        Gerar o acesso do backup ao banco
      </Button>
      {r?.erro ? <Notice tone="red">{r.erro}</Notice> : null}
    </div>
  );
}

export function GerarChaveDeCriptografia() {
  const [chave, setChave] = useState<{ nome: string; valor: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (chave) {
    return (
      <div className="space-y-3">
        <Copiavel rotulo={`Valor de ${chave.nome} (mostrado uma vez)`} valor={chave.valor} segredo />
        <p className="text-xs text-zinc-600">
          Na Vercel, crie <b>{chave.nome}</b> com este valor (tipo Sensitive, Production) nos <b>dois</b> projetos, forja-web e forja-admin, e faça o Redeploy
          dos dois. Depois volte aqui e clique em Recifrar.
        </p>
      </div>
    );
  }
  return (
    <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => iniciar(async () => setChave(await gerarChaveDeCriptografiaAction()))}>
      Gerar a próxima chave
    </Button>
  );
}

export function Recifrar() {
  const [r, setR] = useState<Awaited<ReturnType<typeof recifrarAction>> | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        variant="brand"
        size="sm"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            if (!window.confirm("Recifrar todos os segredos com a chave ativa? Confirme antes que a chave nova está nos dois projetos da Vercel.")) return;
            setR(await recifrarAction());
          })
        }
      >
        {ocupado ? "Recifrando…" : "Recifrar com a chave ativa"}
      </Button>
      {r && !r.ok ? <Notice tone="red">{r.erro}</Notice> : null}
      {r && r.ok ? (
        <Notice tone={r.falhas.length ? "amber" : "blue"}>
          Chave {r.ativa}: {r.recifrados} segredo(s) recifrado(s), {r.jaNaAtiva} já estavam nela.
          {r.falhas.length ? ` ${r.falhas.length} não abriram (${r.falhas[0]!.erro}). Eles continuam como estavam.` : " Já pode apagar a variável antiga na Vercel."}
        </Notice>
      ) : null}
    </div>
  );
}
