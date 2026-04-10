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
  tErrors: (key: string) => string,
  fallback: string,
): string {
  const errorCode = err?.response?.data?.errorCode;
  if (errorCode) {
    try {
      const mapped = tErrors(errorCode);
      // next-intl returns the key itself if not found in some configs
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
