export type SearchMode = "lexical" | "semantic";

export type SemanticStage =
  | "idle"
  | "embedding"
  | "vectorSearch"
  | "rerank"
  | "error";
