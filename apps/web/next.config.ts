import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@openforge/shared', '@openforge/ui', '@openforge/render-engine'],
};

export default withNextIntl(nextConfig);
