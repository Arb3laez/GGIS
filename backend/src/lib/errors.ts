/**
 * Errores de aplicación con su código HTTP. Los servicios lanzan estos errores y el middleware
 * de errores los traduce a respuestas JSON uniformes: { error: { code, message, details? } }.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} no existe.`);

export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unavailable = (message: string) => new AppError(503, 'unavailable', message);
