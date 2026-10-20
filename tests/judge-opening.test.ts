import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs } from "./helpers/browser-stubs";

type J = typeof import("../src/lib/judge");
let judge: J;

beforeEach(async () => {
  vi.resetModules();
  installBrowserStubs();
  judge = await import("../src/lib/judge");
});

describe("what the Judge opens on", () => {
  it("is a blank question, even with an old conversation saved", () => {
    judge.saveConversation({ messages: [{ role: "user", content: "Old question" }], cards: ["Lightning Bolt"], threadId: "t1" });
    expect(judge.openingConversation()).toEqual({ messages: [], cards: [] });
  });

  it("brings the card from 'Ask the judge about this card', once", () => {
    judge.startQuestionAbout("Counterspell");
    // Asked twice, like React's strict mode does with a state initializer.
    expect(judge.openingConversation()).toMatchObject({ messages: [], cards: ["Counterspell"] });
    expect(judge.openingConversation()).toMatchObject({ cards: ["Counterspell"] });
    judge.tookHandOff();
    expect(judge.openingConversation()).toEqual({ messages: [], cards: [] });
  });
});
