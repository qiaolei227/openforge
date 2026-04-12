'use client';

import { useAreaContext } from '@/components/layout/area-context';

export function useArea() {
  return useAreaContext().area;
}
