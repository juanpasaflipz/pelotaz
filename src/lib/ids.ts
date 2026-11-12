const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from URLs and client calls; check the shape before it reaches a uuid column. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);
