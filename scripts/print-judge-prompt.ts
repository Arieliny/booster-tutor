/** Prints the judge's system prompt as the live judge gets it (for running the test set by hand). */
import { judgePrompt } from "../api/_judge-prompt.js";
import { loadCr } from "../api/_cr.js";
console.log(judgePrompt((await loadCr())?.effective ?? null));
