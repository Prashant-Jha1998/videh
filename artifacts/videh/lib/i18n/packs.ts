/** UI string packs — every locale must define the same keys as `en`. */

export { en } from "./en";
import { en } from "./en";
import { hi } from "./locales/hi";
import { bn } from "./locales/bn";
import { te } from "./locales/te";
import { mr } from "./locales/mr";
import { ta } from "./locales/ta";
import { gu } from "./locales/gu";
import { kn } from "./locales/kn";
import { pa } from "./locales/pa";
import { ur } from "./locales/ur";

export { hi, bn, te, mr, ta, gu, kn, pa, ur };

export const packs: Record<string, Record<string, string>> = {
  en,
  hi,
  bn,
  te,
  mr,
  ta,
  gu,
  kn,
  pa,
  ur,
};

export const SUPPORTED_UI_LOCALES = Object.keys(packs);
