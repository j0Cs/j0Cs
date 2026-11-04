import { getWebAuth } from "@forja/auth";

export const runtime = "nodejs";

export const GET = (request: Request) => getWebAuth().handler(request);
export const POST = (request: Request) => getWebAuth().handler(request);
