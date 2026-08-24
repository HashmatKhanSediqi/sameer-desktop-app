export const I18N_NAMESPACES = [
  'common',
  'auth',
  'customers',
  'transactions',
  'reports',
  'settings',
  'import',
  'backup',
  'errors',
  'teller',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];
