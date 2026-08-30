import type { NextConfig } from 'next';

const config: NextConfig = {
  // pg เป็นไลบรารีฝั่ง server ล้วน ห้ามให้ bundler แตะ
  serverExternalPackages: ['pg'],
  typedRoutes: true,
};

export default config;
