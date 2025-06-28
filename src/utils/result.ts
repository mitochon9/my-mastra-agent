// Result type for Railway Oriented Programming
export type Result<T, E> = Ok<T> | Err<E>;

export type Ok<T> = {
  readonly kind: "ok";
  readonly value: T;
};

export type Err<E> = {
  readonly kind: "err";
  readonly error: E;
};

// Constructor functions
export function ok<T>(value: T): Ok<T> {
  return { kind: "ok", value };
}

export function err<E>(error: E): Err<E> {
  return { kind: "err", error };
}

// Type guards
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.kind === "ok";
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.kind === "err";
}

// Utility functions for Result
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

export async function andThenAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

// Common error types
export type ValidationError = {
  readonly kind: "validation";
  readonly message: string;
  readonly field?: string;
};

export type NotFoundError = {
  readonly kind: "not-found";
  readonly message: string;
  readonly resource: string;
  readonly id?: string;
};

export type InfrastructureError = {
  readonly kind: "infrastructure";
  readonly message: string;
  readonly cause?: unknown;
};

export type WeatherAPIError = {
  readonly kind: "weather-api";
  readonly message: string;
  readonly statusCode?: number;
};

export type AppError =
  | ValidationError
  | NotFoundError
  | InfrastructureError
  | WeatherAPIError;

// Error constructors
export const errors = {
  validation: (message: string, field?: string): ValidationError => ({
    kind: "validation",
    message,
    field,
  }),
  notFound: (resource: string, id?: string): NotFoundError => ({
    kind: "not-found",
    message: id ? `${resource} '${id}' not found` : `${resource} not found`,
    resource,
    id,
  }),
  infrastructure: (message: string, cause?: unknown): InfrastructureError => ({
    kind: "infrastructure",
    message,
    cause,
  }),
  weatherAPI: (message: string, statusCode?: number): WeatherAPIError => ({
    kind: "weather-api",
    message,
    statusCode,
  }),
};

// Utility functions
export function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapError: (error: unknown) => E
): Promise<Result<T, E>> {
  return promise
    .then((value) => ok<T>(value) as Result<T, E>)
    .catch((error) => err<E>(mapError(error)) as Result<T, E>);
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(`Called unwrap on Err value: ${(result as Err<E>).error}`);
}

export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (isErr(result)) {
    return result.error;
  }
  throw new Error("Called unwrapErr on Ok value");
}

// Note: Chain pattern is omitted to avoid complex type recursion issues.
// Use the basic Result functions (isOk, isErr, unwrap, etc.) for error handling.
