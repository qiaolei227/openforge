import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract error message from API error response, using i18n errorCode mapping.
 * @param err - axios error object
 * @param tErrors - useTranslations('errorCodes') function
 * @param fallback - fallback message when no errorCode or no mapping
 */
export function getApiErrorMessage(
  err: any,
  tErrors: (key: string, values?: Record<string, any>) => string,
  fallback: string,
): string {
  const data = err?.response?.data;
  const errorCode = data?.errorCode;
  if (errorCode) {
    try {
      const mapped = tErrors(errorCode);
      const base = mapped && mapped !== errorCode ? mapped : fallback;

      // DATA_VALIDATION_FAILED: message contains JSON array of field errors
      if (errorCode === 'DATA_VALIDATION_FAILED' && data?.message) {
        try {
          const fieldErrors = JSON.parse(data.message);
          if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
            const details = fieldErrors.map((e: any) => {
              // New format: { field, code, name } — translate via validation.{code}
              if (e.code && e.name) {
                const key = `validation.${e.code}`;
                const translated = tErrors(key, { name: e.name });
                // If the key maps correctly, use it; otherwise fallback to code + name
                return translated && translated !== key ? translated : `${e.name}: ${e.code}`;
              }
              // Legacy format: { field, message }
              return e.message ?? e.field;
            }).join('; ');
            return `${base}: ${details}`;
          }
        } catch {
          // message is not JSON, fall through
        }
      }

      if (mapped && mapped !== errorCode) return mapped;
    } catch {
      // key not found, fall through
    }
  }
  return fallback;
}

/**
 * Extract errorCode from API error response.
 */
export function getApiErrorCode(err: any): string | undefined {
  return err?.response?.data?.errorCode;
}
