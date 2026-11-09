import { adminUrl, emailLayout, escapeHtml, sendEmail } from "@forja/auth";
import { effectiveCostBrlMicros, formatBrlMicros, formatPercent, formatUsdMicros, PROVIDERS, type ProviderId } from "@forja/core";
import { fetchPtaxUsdBrl } from "@forja/core/server";
import {
  and,
  chaveDoSupabasePorId,
  eq,
  getPricingSettings,
  gte,
  inArray,
  isNull,
  lt,
  savePricingSettings,
  schema,
  segredo,
  sql,
  type Db,
} from "@forja/db";
import { metaDoBackup, situacaoDoBackup } from "./backup";
import { buscarCustoAnthropic, buscarCustoOpenAI } from "./provedores";
import { cambioComFolga, cambioVencido, chaveFalhando, conciliacao, diaUtc, provedorComErro, semanaIso } from "./regras";

const FX_META = "fx_meta";
export const FOLGA_PADRAO = 3;

type Alerta = { kind: string; severity: "aviso" | "critico"; title: string; detail: string; dedupeKey: string };

/** Registra o alerta se o mesmo problema não estiver aberto. Devolve true se é novo. */
export async function registrarAlerta(db: Db, a: Alerta) {
  const [novo] = await db.insert(schema.ownerAlerts).values(a).onConflictDoNothing().returning({ id: schema.ownerAlerts.id });
  return Boolean(novo);
}

// ---------------------------------------------------------------------------
// Câmbio: PTAX do Banco Central todo dia
// ---------------------------------------------------------------------------

export async function metaDoCambio(db: Db) {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, FX_META) });
  const v = (row?.value ?? {}) as { atualizadoEm?: string; ptax?: number; folga?: number; dataPtax?: string };
  return { atualizadoEm: v.atualizadoEm ? new Date(v.atualizadoEm) : null, ptax: v.ptax ?? null, folga: v.folga ?? FOLGA_PADRAO, dataPtax: v.dataPtax ?? null };
}

export async function atualizarCambio(db: Db, opts: { folgaPercent?: number; buscar?: typeof fetchPtaxUsdBrl } = {}) {
  const meta = await metaDoCambio(db);
  const folga = opts.folgaPercent ?? meta.folga;
  const { rate, date } = await (opts.buscar ?? fetchPtaxUsdBrl)();
  const atual = await getPricingSettings(db);
  const fx = cambioComFolga(rate, folga);
  await savePricingSettings(db, { ...atual, fxUsdBrl: fx });
  const valor = { atualizadoEm: new Date().toISOString(), ptax: rate, folga, dataPtax: date };
  await db
    .insert(schema.settings)
    .values({ key: FX_META, value: valor })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: valor } });
  return { ptax: rate, fx, folga };
}

// ---------------------------------------------------------------------------
// Verificações
// ---------------------------------------------------------------------------

async function nomeDaChave(db: Db, keyId: string) {
  const k = await db.query.providerKeys.findFirst({ where: eq(schema.providerKeys.id, keyId) });
  if (k) return `${PROVIDERS[k.providerId].name} · ${k.label} (${k.keyHint})`;
  const s = await chaveDoSupabasePorId(keyId);
  return s ? `${s.name} (Secrets do Supabase)` : `chave ${keyId.slice(0, 8)}`;
}

export async function verificarAlertas(db: Db, agora = new Date()) {
  const novos: Alerta[] = [];
  const registrar = async (a: Alerta) => {
    if (await registrarAlerta(db, a)) novos.push(a);
  };
  const umDia = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const semana = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1) câmbio (o alerta se resolve sozinho quando a PTAX volta a atualizar)
  const meta = await metaDoCambio(db);
  if (!cambioVencido(meta.atualizadoEm, agora)) {
    await db
      .update(schema.ownerAlerts)
      .set({ resolvedAt: agora })
      .where(and(eq(schema.ownerAlerts.dedupeKey, "cambio"), isNull(schema.ownerAlerts.resolvedAt)));
  } else {
    await registrar({
      kind: "cambio",
      severity: "critico",
      title: "Câmbio desatualizado",
      detail: meta.atualizadoEm
        ? `O câmbio não é atualizado desde ${meta.atualizadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. A cobrança usa a cotação antiga.`
        : "O câmbio nunca foi atualizado pela PTAX. Atualize em Câmbio e taxas.",
      dedupeKey: "cambio",
    });
  }

  // 1b) backup diário fora do Supabase (o alerta fecha sozinho com o próximo backup bom)
  const backup = await metaDoBackup(db);
  const sit = situacaoDoBackup(backup, agora);
  if (sit.tipo === "ok") {
    await db
      .update(schema.ownerAlerts)
      .set({ resolvedAt: agora })
      .where(and(sql`${schema.ownerAlerts.dedupeKey} like 'backup:%'`, isNull(schema.ownerAlerts.resolvedAt)));
  } else {
    await registrar({
      kind: "backup",
      severity: sit.tipo === "nao_configurado" ? "aviso" : "critico",
      title:
        sit.tipo === "nao_configurado"
          ? "Backup diário ainda não configurado"
          : sit.tipo === "falhou"
            ? "O backup diário falhou"
            : "O backup diário não roda há mais de 36 h",
      detail:
        sit.tipo === "nao_configurado"
          ? "Sem cópia fora do Supabase, um problema no projeto pode levar os dados. Configure o backup (doc 10): uma chave e uma variável no GitHub."
          : `${backup!.detalhe || "Sem detalhe."} Última tentativa: ${backup!.em.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.${backup!.execucao ? ` Log: ${backup!.execucao}` : ""}`,
      dedupeKey: `backup:${sit.tipo}`,
    });
  }

  // 2) provedores e chaves nas últimas 24 h
  const porProvedor = await db
    .select({
      providerId: schema.usageEvents.providerId,
      total: sql<number>`count(*)::int`,
      erros: sql<number>`count(*) filter (where ${schema.usageEvents.status} = 'error')::int`,
    })
    .from(schema.usageEvents)
    .where(gte(schema.usageEvents.createdAt, umDia))
    .groupBy(schema.usageEvents.providerId);
  for (const p of porProvedor) {
    if (provedorComErro(p.total, p.erros)) {
      await registrar({
        kind: "provedor",
        severity: "critico",
        title: `${PROVIDERS[p.providerId].name} com ${formatPercent((p.erros / p.total) * 100)} de erro`,
        detail: `${p.erros} de ${p.total} chamadas falharam nas últimas 24 h. Veja o status do provedor e se as chaves têm limite.`,
        dedupeKey: `provedor:${p.providerId}`,
      });
    }
  }
  const porChave = await db
    .select({
      keyId: schema.usageEvents.providerKeyId,
      total: sql<number>`count(*)::int`,
      erros: sql<number>`count(*) filter (where ${schema.usageEvents.status} = 'error')::int`,
      ultimoErro: sql<string | null>`max(${schema.usageEvents.errorMessage}) filter (where ${schema.usageEvents.status} = 'error')`,
    })
    .from(schema.usageEvents)
    .where(and(gte(schema.usageEvents.createdAt, umDia), sql`${schema.usageEvents.providerKeyId} is not null`))
    .groupBy(schema.usageEvents.providerKeyId);
  for (const k of porChave) {
    if (k.keyId && chaveFalhando(k.total, k.erros)) {
      await registrar({
        kind: "chave",
        severity: "critico",
        title: `Chave falhando: ${await nomeDaChave(db, k.keyId)}`,
        detail: `${k.erros} de ${k.total} chamadas com erro nas últimas 24 h.${k.ultimoErro ? ` Último erro: ${k.ultimoErro.slice(0, 200)}` : ""}`,
        dedupeKey: `chave:${k.keyId}`,
      });
    }
  }

  // 3) clientes com margem negativa (7 dias): o que foi cobrado não cobre o custo efetivo
  const settings = await getPricingSettings(db);
  const porOrg = await db
    .select({
      orgId: schema.usageEvents.orgId,
      nome: schema.organizations.name,
      custo: sql<string>`coalesce(sum(${schema.usageEvents.costUsdMicros}), 0)`,
      cobrado: sql<string>`coalesce(sum(${schema.usageEvents.chargeBrlMicros}), 0)`,
    })
    .from(schema.usageEvents)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.usageEvents.orgId))
    .where(gte(schema.usageEvents.createdAt, semana))
    .groupBy(schema.usageEvents.orgId, schema.organizations.name);
  for (const o of porOrg) {
    const custo = effectiveCostBrlMicros(Number(o.custo), settings);
    const margem = Number(o.cobrado) - custo;
    if (Number(o.custo) > 0 && margem < 0) {
      await registrar({
        kind: "margem",
        severity: "aviso",
        title: `Margem negativa: ${o.nome}`,
        detail: `Nos últimos 7 dias a Forja cobrou ${formatBrlMicros(Number(o.cobrado))} e gastou ${formatBrlMicros(custo)} com os provedores (${formatBrlMicros(margem)}). Confira o markup dos modelos usados e o câmbio.`,
        dedupeKey: `margem:${o.orgId}:${semanaIso(agora)}`,
      });
    }
  }
  return novos;
}

// ---------------------------------------------------------------------------
// Conciliação com os relatórios dos provedores (D-2: os relatórios atrasam)
// ---------------------------------------------------------------------------

export async function conciliarCustos(
  db: Db,
  dia: string,
  fetchers: { anthropic?: typeof buscarCustoAnthropic; openai?: typeof buscarCustoOpenAI } = {},
) {
  const inicio = new Date(`${dia}T00:00:00Z`);
  const fim = new Date(inicio.getTime() + 86_400_000);
  const registrado = await db
    .select({ providerId: schema.usageEvents.providerId, custo: sql<string>`coalesce(sum(${schema.usageEvents.costUsdMicros}), 0)` })
    .from(schema.usageEvents)
    .where(and(gte(schema.usageEvents.createdAt, inicio), lt(schema.usageEvents.createdAt, fim)))
    .groupBy(schema.usageEvents.providerId);
  const doDia = (p: ProviderId) => Number(registrado.find((r) => r.providerId === p)?.custo ?? 0);

  const [chaveAnthropic, workspace, chaveOpenAI, projeto] = await Promise.all([
    segredo("ANTHROPIC_ADMIN_KEY"),
    segredo("ANTHROPIC_WORKSPACE_ID"),
    segredo("OPENAI_ADMIN_KEY"),
    segredo("OPENAI_PROJECT_ID"),
  ]);
  const resultados: { providerId: ProviderId; status: string; diffPercent: number | null; registrado: number; relatorio: number | null; detalhe: string }[] = [];
  const conferir = async (providerId: ProviderId, buscar: (() => Promise<number>) | null, semChave: string) => {
    const reg = doDia(providerId);
    let relatorio: number | null = null;
    let detalhe = "";
    let status: string;
    if (!buscar) {
      status = "sem_relatorio";
      detalhe = semChave;
    } else {
      try {
        relatorio = await buscar();
        const c = conciliacao(reg, relatorio);
        status = c.status;
        detalhe = c.diffPercent === null ? "" : `diferença de ${c.diffPercent}%`;
      } catch (e) {
        status = "erro";
        detalhe = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      }
    }
    const c = conciliacao(reg, relatorio);
    await db
      .insert(schema.costReconciliations)
      .values({ day: dia, providerId, recordedUsdMicros: reg, reportedUsdMicros: relatorio, diffPercent: c.diffPercent === null ? null : Math.round(c.diffPercent * 100), status, detail: detalhe })
      .onConflictDoUpdate({
        target: [schema.costReconciliations.day, schema.costReconciliations.providerId],
        set: { recordedUsdMicros: reg, reportedUsdMicros: relatorio, diffPercent: c.diffPercent === null ? null : Math.round(c.diffPercent * 100), status, detail: detalhe },
      });
    resultados.push({ providerId, status, diffPercent: c.diffPercent, registrado: reg, relatorio, detalhe });
    if (status === "divergente") {
      await registrarAlerta(db, {
        kind: "conciliacao",
        severity: "critico",
        title: `Custo da ${PROVIDERS[providerId].name} não bate (${dia})`,
        detail: `Relatório do provedor: ${formatUsdMicros(relatorio ?? 0)}. Registrado pela Forja: ${formatUsdMicros(reg)} (${detalhe}). Pode ser chave usada fora da Forja, preço desatualizado no catálogo ou uso não medido.`,
        dedupeKey: `conciliacao:${providerId}:${dia}`,
      });
    }
    if (status === "erro") {
      await registrarAlerta(db, {
        kind: "conciliacao",
        severity: "aviso",
        title: `Não consegui ler o relatório da ${PROVIDERS[providerId].name}`,
        detail: detalhe,
        dedupeKey: `conciliacao-erro:${providerId}`,
      });
    }
  };
  await conferir(
    "anthropic",
    chaveAnthropic ? () => (fetchers.anthropic ?? buscarCustoAnthropic)(chaveAnthropic, dia, workspace) : null,
    "ANTHROPIC_ADMIN_KEY não configurada",
  );
  await conferir("openai", chaveOpenAI ? () => (fetchers.openai ?? buscarCustoOpenAI)(chaveOpenAI, dia, projeto) : null, "OPENAI_ADMIN_KEY não configurada");
  return resultados;
}

// ---------------------------------------------------------------------------
// E-mail para a equipe
// ---------------------------------------------------------------------------

export async function enviarAlertasPendentes(db: Db) {
  const pendentes = await db
    .select()
    .from(schema.ownerAlerts)
    .where(and(isNull(schema.ownerAlerts.notifiedAt), isNull(schema.ownerAlerts.resolvedAt)))
    .orderBy(schema.ownerAlerts.createdAt)
    .limit(30);
  if (!pendentes.length) return 0;
  const equipe = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.platformRole, "staff"));
  if (!equipe.length) return 0;
  const criticos = pendentes.filter((p) => p.severity === "critico").length;
  const assunto =
    pendentes.length === 1 ? `[Forja] ${pendentes[0]!.title}` : `[Forja] ${pendentes.length} alertas${criticos ? ` (${criticos} críticos)` : ""}`;
  const corpo = pendentes
    .map((p) => `<p><b>${p.severity === "critico" ? "🔴" : "🟡"} ${escapeHtml(p.title)}</b><br>${escapeHtml(p.detail)}</p>`)
    .join("");
  const html = emailLayout(assunto.replace("[Forja] ", ""), corpo, { label: "Abrir os alertas", url: `${adminUrl()}/alertas` });
  let enviados = 0;
  for (const { email } of equipe) {
    try {
      await sendEmail({ to: email, subject: assunto, html, link: `${adminUrl()}/alertas` });
      enviados++;
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "alerta do dono não enviado", err: String(err) }));
    }
  }
  if (enviados) {
    await db
      .update(schema.ownerAlerts)
      .set({ notifiedAt: new Date() })
      .where(inArray(schema.ownerAlerts.id, pendentes.map((p) => p.id)));
  }
  return enviados;
}

/** Rotina diária (junto com a da cobrança, no mesmo cron do Hobby). */
export async function rotinaDiariaDeOperacao(
  db: Db,
  agora = new Date(),
  deps: { buscarPtax?: typeof fetchPtaxUsdBrl; relatorios?: Parameters<typeof conciliarCustos>[2] } = {},
) {
  let cambio: Awaited<ReturnType<typeof atualizarCambio>> | { erro: string };
  try {
    cambio = await atualizarCambio(db, { buscar: deps.buscarPtax });
  } catch (e) {
    cambio = { erro: e instanceof Error ? e.message : String(e) };
  }
  const conciliacoes = await conciliarCustos(db, diaUtc(agora, 2), deps.relatorios).catch((e) => [{ erro: String(e) }]);
  const alertas = await verificarAlertas(db, agora);
  const emails = await enviarAlertasPendentes(db);
  return { cambio, conciliacoes, alertasNovos: alertas.length, emails };
}

/** "Pronto quando" da Sprint 4: um alerta de teste que chega por e-mail à equipe. */
export async function enviarAlertaDeTeste(db: Db, quem: string) {
  await registrarAlerta(db, {
    kind: "teste",
    severity: "aviso",
    title: "Alerta de teste",
    detail: `Pedido por ${quem} no painel. Se este e-mail chegou, os alertas estão funcionando.`,
    dedupeKey: `teste:${Date.now()}`,
  });
  return enviarAlertasPendentes(db);
}

export async function resolverAlerta(db: Db, id: string) {
  await db.update(schema.ownerAlerts).set({ resolvedAt: new Date() }).where(and(eq(schema.ownerAlerts.id, id), isNull(schema.ownerAlerts.resolvedAt)));
}
