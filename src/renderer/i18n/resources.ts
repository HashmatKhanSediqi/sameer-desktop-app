import type { Resource } from 'i18next';
import { I18N_NAMESPACES } from './namespaces';
import authEn from './locales/en/auth.json';
import backupEn from './locales/en/backup.json';
import commonEn from './locales/en/common.json';
import customersEn from './locales/en/customers.json';
import errorsEn from './locales/en/errors.json';
import importEn from './locales/en/import.json';
import reportsEn from './locales/en/reports.json';
import settingsEn from './locales/en/settings.json';
import transactionsEn from './locales/en/transactions.json';
import authFa from './locales/fa-AF/auth.json';
import backupFa from './locales/fa-AF/backup.json';
import commonFa from './locales/fa-AF/common.json';
import customersFa from './locales/fa-AF/customers.json';
import errorsFa from './locales/fa-AF/errors.json';
import importFa from './locales/fa-AF/import.json';
import reportsFa from './locales/fa-AF/reports.json';
import settingsFa from './locales/fa-AF/settings.json';
import transactionsFa from './locales/fa-AF/transactions.json';
import authPs from './locales/ps/auth.json';
import backupPs from './locales/ps/backup.json';
import commonPs from './locales/ps/common.json';
import customersPs from './locales/ps/customers.json';
import errorsPs from './locales/ps/errors.json';
import importPs from './locales/ps/import.json';
import reportsPs from './locales/ps/reports.json';
import settingsPs from './locales/ps/settings.json';
import transactionsPs from './locales/ps/transactions.json';

export const i18nResources: Resource = {
  en: {
    common: commonEn,
    auth: authEn,
    customers: customersEn,
    transactions: transactionsEn,
    reports: reportsEn,
    settings: settingsEn,
    import: importEn,
    backup: backupEn,
    errors: errorsEn,
  },
  'fa-AF': {
    common: commonFa,
    auth: authFa,
    customers: customersFa,
    transactions: transactionsFa,
    reports: reportsFa,
    settings: settingsFa,
    import: importFa,
    backup: backupFa,
    errors: errorsFa,
  },
  ps: {
    common: commonPs,
    auth: authPs,
    customers: customersPs,
    transactions: transactionsPs,
    reports: reportsPs,
    settings: settingsPs,
    import: importPs,
    backup: backupPs,
    errors: errorsPs,
  },
};

export { I18N_NAMESPACES };
