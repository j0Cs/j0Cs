import { getAdminAuth } from "@forja/auth";

export const runtime = "nodejs";

export const GET = (request: Request) => getAdminAuth().handler(request);
export const POST = (request: Request) => getAdminAuth().handler(request);
