// Types for _cr-parse.js (plain JS so the build script can use it too).
export interface ParsedCr {
  effective: string;
  source: string;
  fetched: string;
  rules: Record<string, string>;
  sections: Record<string, string>;
  glossary: Record<string, string>;
}
export function crUrl(): Promise<string>;
export function decodeCr(buf: ArrayBuffer): string;
export function parseCr(text: string, source: string): ParsedCr;
