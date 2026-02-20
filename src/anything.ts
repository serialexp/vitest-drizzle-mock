// ABOUTME: Provides a typed wildcard placeholder for structural matching callbacks.
// ABOUTME: Returns a value that satisfies any column type so users don't need 'as any' casts.

const ANYTHING = Symbol.for("vitest-drizzle-mock:anything");

export function anything(): any {
  return { [ANYTHING]: true };
}

export function partial<T extends Record<string, unknown>>(values: T): any {
  return values;
}

export function isAnything(value: unknown): boolean {
  return typeof value === "object" && value !== null && ANYTHING in value;
}
