/** Prints the judge's system prompt as the live judge gets it (for running the test set by hand). */
import { judgePrompt } from "../api/_judge-prompt.js";
import { crIndex, loadCr } from "../api/_cr.js";
const cr = await loadCr();
console.log(judgePrompt(cr?.effective ?? null, cr ? crIndex(cr) : undefined));
