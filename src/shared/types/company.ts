export interface CompanyProfile {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  hasLogo: boolean;
  configured: boolean;
  updatedAt: string | null;
}

export interface CompanyLogoData {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  dataBase64: string;
}

export interface CompanyUpdateInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  notes?: string | null;
  logoBase64?: string | null;
  removeLogo?: boolean;
}

export const MAX_COMPANY_NAME_LENGTH = 200;
export const MAX_COMPANY_PHONE_LENGTH = 50;
export const MAX_COMPANY_EMAIL_LENGTH = 120;
export const MAX_COMPANY_ADDRESS_LENGTH = 400;
export const MAX_COMPANY_WEBSITE_LENGTH = 200;
export const MAX_COMPANY_NOTES_LENGTH = 2000;
