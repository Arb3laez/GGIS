import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from './errors';

/** Valida una entrada con zod y lanza 422 con el detalle de los campos inválidos. */
export function validate<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      422,
      'validation_error',
      'Los datos enviados no son válidos.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
