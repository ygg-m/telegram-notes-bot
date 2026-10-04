import { en, type Strings } from "./en.js";

export { esc } from "./en.js";
export type { Strings };

const languages: Record<string, Strings> = { en };

export function strings(lang = "en"): Strings {
  return languages[lang] ?? en;
}
