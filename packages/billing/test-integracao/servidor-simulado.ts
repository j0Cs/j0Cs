/** Sobe só o Stripe simulado (porta 12111), para testar o app rodando: `tsx test-integracao/servidor-simulado.ts`. */
import { iniciarStripeSimulado } from "./stripe-simulado";
const sim = await iniciarStripeSimulado(Number(process.env.PORTA ?? 12111));
console.log(`Stripe simulado em ${sim.url}`);
