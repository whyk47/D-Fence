/**
 * D-Fence — data crossing the ingestion boundary.
 * Layer: ports. Depends on nothing; importable by every layer.
 */
export type RawPayload = { retrievedAt: Date; body: unknown };
export type ParsedBatch = { retrievedAt: Date; records: unknown[] };
