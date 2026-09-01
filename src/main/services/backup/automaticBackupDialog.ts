import type { SupportedLocale } from '@shared/types/locale';
import { normalizeLocale } from '@shared/types/locale';

interface AutomaticBackupDialogCopy {
  title: string;
  buttonLabel: string;
}

const FOLDER_DIALOG_COPY: Record<SupportedLocale, AutomaticBackupDialogCopy> = {
  en: {
    title: 'Where should automatic backups be saved?',
    buttonLabel: 'Select Folder',
  },
  'fa-AF': {
    title: 'پشتیبان‌های خودکار در کجا ذخیره شوند؟',
    buttonLabel: 'انتخاب پوشه',
  },
  ps: {
    title: 'اتومات بیکاپونه باید چیرته ذخیره شي؟',
    buttonLabel: 'پوشه وټاکئ',
  },
};

export function automaticBackupFolderDialogCopy(language: string): AutomaticBackupDialogCopy {
  return FOLDER_DIALOG_COPY[normalizeLocale(language)];
}
