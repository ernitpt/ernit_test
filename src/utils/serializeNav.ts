export function serializeNav<T>(value: T): T {
  return serializeValue(value) as T;
}

function serializeValue(value: unknown): unknown {
  if (value == null) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as Record<string, unknown>).toDate === 'function') {
    const date = (value as { toDate: () => unknown }).toDate();
    return date instanceof Date ? date.toISOString() : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(val);
    }
    return out;
  }

  return value;
}
