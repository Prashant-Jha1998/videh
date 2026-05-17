import type { AdminIdentity } from "../lib/adminSession";

declare global {
  namespace Express {
    interface Request {
      admin?: AdminIdentity;
    }
  }
}

export {};
