import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Better Auth endpoints: /api/auth/sign-in/email, /api/auth/sign-up/email,
// /api/auth/sign-in/social, /api/auth/sign-out, /api/auth/get-session, ...
const handler = (req: Request) => getAuth().handler(req);
export const { GET, POST } = toNextJsHandler(handler);
