/** D-Fence — shared gateway types. Stereotype: <<boundary>>. */
export type RawPayload = { retrievedAt: Date; body: unknown };
export type ParsedBatch = { retrievedAt: Date; records: unknown[] };
