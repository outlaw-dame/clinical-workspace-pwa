export type SearchableRecordType = "secure_note";

export type LocalSearchMode = "lexical" | "semantic" | "hybrid";

export type LocalSearchMatchKind = "lexical" | "semantic" | "hybrid";

export type LocalSearchResult = {
  id: string;
  recordId: string;
  recordType: SearchableRecordType;
  title: string;
  preview: string;
  score: number;
  source: "local";
  matchKind: LocalSearchMatchKind;
  updatedAt: string;
};

export type LocalSearchOptions = {
  mode?: LocalSearchMode;
  limit?: number;
};

export type RankedSearchCandidate = {
  id: string;
  score: number;
};

export type SanitizedSearchQuery = {
  raw: string;
  normalized: string;
  tokens: string[];
};
