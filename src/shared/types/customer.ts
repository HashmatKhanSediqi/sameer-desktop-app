import type { GlobalCurrencyTotal } from './transaction';

export interface Customer {
  id: number;
  name: string | null;
  customerNumber: string | null;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerIdentity {
  id: number;
  name: string | null;
  customerNumber: string | null;
  hasPhoto: boolean;
}

export interface CustomerListItem extends CustomerIdentity {
  balances: Record<string, string>;
  cashInCount: number;
  cashOutCount: number;
}

export interface CreateCustomerInput {
  name?: string | null;
  customerNumber?: string | null;
  photoBase64?: string | null;
}

export interface UpdateCustomerInput {
  id: number;
  name?: string | null;
  customerNumber?: string | null;
  photoBase64?: string | null;
  removePhoto?: boolean;
}

export interface SearchCustomerInput {
  query: string;
}

export interface CustomerListQuery {
  page?: number;
  pageSize?: number;
  includeAccounting?: boolean;
}

export interface PaginatedCustomerListResult {
  customers: CustomerListItem[];
  totals: GlobalCurrencyTotal[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomerPhotoData {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  dataBase64: string;
}
