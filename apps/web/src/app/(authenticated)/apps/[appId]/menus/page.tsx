'use client';

import { useParams, redirect } from 'next/navigation';

/** Redirect legacy /apps/:appId/menus to the unified app detail page */
export default function AppMenusPage() {
  const params = useParams();
  redirect(`/apps/${params.appId}`);
}
