import type { AdminIdentity } from "../lib/adminSession";
import type { DeveloperApiAccount } from "../lib/developerApiAuth";

declare global {
  namespace Express {
    interface Request {
      admin?: AdminIdentity;
      developerAccount?: DeveloperApiAccount;
    }
  }
}

export {};
