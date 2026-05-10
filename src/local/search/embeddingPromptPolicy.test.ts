import { describe, expect, it } from "vitest";
import {
  createEmbeddingDocumentPrompt,
  createEmbeddingQueryPrompt
} from "./embeddingPromptPolicy";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";
import {
  deterministicLocalEmbeddingManifest,
  embeddingGemma300mCandidateManifest
} from "./localEmbeddingManifests";

describe("createEmbeddingQueryPrompt", () => {
  it("creates sanitized EmbeddingGemma query prompts", () => {
    expect(createEmbeddingQueryPrompt(embeddingGemma300mCandidateManifest, "  sleep\n\tstress  ")).toBe(
      "task: search result | query: sleep stress"
    );
  });

  it("bounds very large query fields after streaming sanitation", () => {
    const prompt = createEmbeddingQueryPrompt(embeddingGemma300mCandidateManifest, `${"a".repeat(20_000)} trailing`);

    expect(prompt).toBe(`task: search result | query: ${"a".repeat(8_000)}`);
  });

  it("preserves meaningful query text after long whitespace prefixes", () => {
    const prompt = createEmbeddingQueryPrompt(embeddingGemma300mCandidateManifest, `${" ".repeat(20_000)}trailing`);

    expect(prompt).toBe("task: search result | query: trailing");
  });

  it("rejects manifests without prompt policies", () => {
    expect(() => createEmbeddingQueryPrompt(deterministicLocalEmbeddingManifest, "sleep")).toThrow(
      LocalEmbeddingProviderError
    );
  });
});

describe("createEmbeddingDocumentPrompt", () => {
  it("creates sanitized EmbeddingGemma document prompts", () => {
    expect(
      createEmbeddingDocumentPrompt(embeddingGemma300mCandidateManifest, {
        title: " Intake\nPlan ",
        text: "Client\tmentioned sleep disruption."
      })
    ).toBe("title: Intake Plan | text: Client mentioned sleep disruption.");
  });

  it("uses a safe fallback title when a document title is missing", () => {
    expect(
      createEmbeddingDocumentPrompt(embeddingGemma300mCandidateManifest, {
        text: "Client mentioned sleep disruption."
      })
    ).toBe("title: none | text: Client mentioned sleep disruption.");
  });

  it("strips unsafe control characters before building prompts", () => {
    expect(
      createEmbeddingDocumentPrompt(embeddingGemma300mCandidateManifest, {
        title: "Initial\u0000Intake",
        text: "Follow\u0007up"
      })
    ).toBe("title: Initial Intake | text: Follow up");
  });

  it("bounds very large document fields after streaming sanitation", () => {
    const prompt = createEmbeddingDocumentPrompt(embeddingGemma300mCandidateManifest, {
      title: "Large note",
      text: `${"b".repeat(20_000)} trailing`
    });

    expect(prompt).toBe(`title: Large note | text: ${"b".repeat(8_000)}`);
  });

  it("preserves meaningful document text after long separator prefixes", () => {
    const prompt = createEmbeddingDocumentPrompt(embeddingGemma300mCandidateManifest, {
      title: "Large note",
      text: `${" \u0007".repeat(10_000)}trailing`
    });

    expect(prompt).toBe("title: Large note | text: trailing");
  });
});
