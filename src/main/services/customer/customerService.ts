import type Database from 'better-sqlite3';
import { CustomerRepository, type CustomerRecord } from '../../database/repositories/customerRepository';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import { DEFAULT_PAGE_SIZE, resolvePagination } from '@shared/pagination';
import type {
  CreateCustomerInput,
  Customer,
  CustomerIdentity,
  CustomerListItem,
  CustomerPhotoData,
  PaginatedCustomerListResult,
  UpdateCustomerInput,
} from '@shared/types/customer';
import type { GlobalCurrencyTotal } from '@shared/types/transaction';
import { CustomerPhotoService } from './customerPhotoService';
import {
  escapeLikePattern,
  normalizeOptionalCustomerNumber,
  normalizeOptionalName,
  parsePositiveIntegerId,
} from './customerValidation';

export class CustomerService {
  private readonly repository: CustomerRepository;

  constructor(
    db: Database.Database,
    private readonly photoService: CustomerPhotoService,
    private readonly logger: Logger,
  ) {
    this.repository = new CustomerRepository(db);
  }

  list(): CustomerIdentity[] {
    return this.repository.listCustomers().map(toListItem);
  }

  count(): number {
    return this.repository.countCustomers();
  }

  listPage(
    pageInput: number | undefined,
    pageSizeInput: number | undefined,
    enrich: (customers: CustomerIdentity[]) => {
      customers: CustomerListItem[];
      totals: GlobalCurrencyTotal[];
    },
  ): PaginatedCustomerListResult {
    return this.listPageWithLimit(pageInput, pageSizeInput, enrich, DEFAULT_PAGE_SIZE, true);
  }

  /**
   * Main-process chunked iteration for reports. Allows larger batches than UI MAX_PAGE_SIZE
   * so all-customer reports do not under-count when paging.
   */
  listPageForReport(
    pageInput: number,
    pageSizeInput: number,
    enrich: (customers: CustomerIdentity[]) => {
      customers: CustomerListItem[];
      totals: GlobalCurrencyTotal[];
    },
  ): PaginatedCustomerListResult {
    return this.listPageWithLimit(pageInput, pageSizeInput, enrich, pageSizeInput, false);
  }

  private listPageWithLimit(
    pageInput: number | undefined,
    pageSizeInput: number | undefined,
    enrich: (customers: CustomerIdentity[]) => {
      customers: CustomerListItem[];
      totals: GlobalCurrencyTotal[];
    },
    defaultPageSize: number,
    clampToUiMax: boolean,
  ): PaginatedCustomerListResult {
    const totalCount = this.repository.countCustomers();
    const pagination = clampToUiMax
      ? resolvePagination(pageInput, pageSizeInput, totalCount, defaultPageSize)
      : resolveReportPagination(pageInput, pageSizeInput, totalCount, defaultPageSize);
    const records = this.repository.listCustomersPaginated(
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    );
    const identities = records.map(toListItem);
    const enriched = enrich(identities);
    return {
      customers: enriched.customers,
      totals: enriched.totals,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
    };
  }

  searchPage(
    query: unknown,
    pageInput: number | undefined,
    pageSizeInput: number | undefined,
    enrich: (customers: CustomerIdentity[]) => {
      customers: CustomerListItem[];
      totals: GlobalCurrencyTotal[];
    },
  ): PaginatedCustomerListResult {
    const exactNumber = this.parseExactCustomerNumberQuery(query);
    if (exactNumber !== null) {
      const totalCount = this.repository.countCustomersByExactNumber(exactNumber);
      const pagination = resolvePagination(pageInput, pageSizeInput, totalCount, DEFAULT_PAGE_SIZE);
      const records = this.repository.listCustomersByExactNumberPaginated(
        exactNumber,
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      );
      const identities = records.map(toListItem);
      const enriched = enrich(identities);
      return {
        customers: enriched.customers,
        totals: enriched.totals,
        totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: pagination.totalPages,
      };
    }

    const pattern = this.buildSearchPattern(query);
    if (pattern === null) {
      return this.listPage(pageInput, pageSizeInput, enrich);
    }

    const totalCount = this.repository.countSearchCustomers(pattern);
    const pagination = resolvePagination(pageInput, pageSizeInput, totalCount, DEFAULT_PAGE_SIZE);
    const records = this.repository.searchCustomersPaginated(
      pattern,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    );
    const identities = records.map(toListItem);
    const enriched = enrich(identities);
    return {
      customers: enriched.customers,
      totals: enriched.totals,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
    };
  }

  search(query: unknown): CustomerIdentity[] {
    const pattern = this.buildSearchPattern(query);
    if (pattern === null) {
      return this.list();
    }

    return this.repository.searchCustomers(pattern).map(toListItem);
  }

  private buildSearchPattern(query: unknown): string | null {
    if (query === undefined || query === null) {
      return null;
    }

    if (typeof query !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return null;
    }

    return `%${escapeLikePattern(trimmed)}%`;
  }

  private parseExactCustomerNumberQuery(query: unknown): string | null {
    if (typeof query !== 'string') {
      return null;
    }
    const trimmed = query.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      return null;
    }
    if (!/^C-\d+$/i.test(trimmed) && !/^RARE-\d+$/i.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  getById(id: unknown): Customer {
    const customerId = parsePositiveIntegerId(id);
    const record = this.repository.getCustomerById(customerId);
    if (!record) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
    }
    return toCustomer(record);
  }

  create(input: CreateCustomerInput): Customer {
    const name = normalizeOptionalName(input.name);
    const customerNumber = normalizeOptionalCustomerNumber(input.customerNumber);
    const photo = this.decodeOptionalPhoto(input.photoBase64);

    const id = this.repository.createCustomer({ name, customerNumber });

    try {
      if (photo) {
        const filename = this.photoService.save(id, photo);
        this.repository.updatePhotoFilename(id, filename);
      }
    } catch (error) {
      this.repository.deleteCustomer(id);
      throw error;
    }

    this.logger.info('Customer created', { customerId: id });
    return this.getById(id);
  }

  update(input: UpdateCustomerInput): Customer {
    const id = parsePositiveIntegerId(input.id);
    const existing = this.repository.getCustomerById(id);
    if (!existing) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
    }

    const name = Object.prototype.hasOwnProperty.call(input, 'name')
      ? normalizeOptionalName(input.name)
      : existing.name;
    const customerNumber = Object.prototype.hasOwnProperty.call(input, 'customerNumber')
      ? normalizeOptionalCustomerNumber(input.customerNumber)
      : existing.customer_number;

    const replacementPhoto = this.decodeOptionalPhoto(input.photoBase64);
    const removePhoto = input.removePhoto === true && !replacementPhoto;

    this.repository.updateCustomer(id, { name, customerNumber });

    if (replacementPhoto) {
      const filename = this.photoService.save(id, replacementPhoto);
      if (existing.photo_filename && existing.photo_filename !== filename) {
        this.photoService.deleteByFilename(existing.photo_filename);
      }
      this.repository.updatePhotoFilename(id, filename);
    } else if (removePhoto) {
      this.photoService.deleteByFilename(existing.photo_filename);
      this.repository.updatePhotoFilename(id, null);
    }

    this.logger.info('Customer updated', { customerId: id });
    return this.getById(id);
  }

  delete(id: unknown): { success: true } {
    const customerId = parsePositiveIntegerId(id);
    const existing = this.repository.getCustomerById(customerId);
    if (!existing) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
    }

    const deleted = this.repository.deleteCustomer(customerId);
    if (!deleted) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
    }

    this.photoService.deleteByFilename(existing.photo_filename);
    this.logger.info('Customer deleted', { customerId });
    return { success: true };
  }

  getPhoto(id: unknown): CustomerPhotoData | null {
    const customerId = parsePositiveIntegerId(id);
    const record = this.repository.getCustomerById(customerId);
    if (!record) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
    }

    if (!record.photo_filename) {
      return null;
    }

    try {
      const photo = this.photoService.read(record.photo_filename);
      return {
        mimeType: photo.mimeType,
        dataBase64: photo.buffer.toString('base64'),
      };
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_PHOTO') {
        this.logger.warn('Customer photo unavailable', { customerId });
        return null;
      }
      throw error;
    }
  }

  private decodeOptionalPhoto(photoBase64: string | null | undefined): ReturnType<
    CustomerPhotoService['decodeAndValidate']
  > | null {
    if (photoBase64 === undefined || photoBase64 === null) {
      return null;
    }

    if (typeof photoBase64 !== 'string') {
      throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
    }

    if (photoBase64.trim().length === 0) {
      return null;
    }

    return this.photoService.decodeAndValidate(photoBase64);
  }
}

function toListItem(record: CustomerRecord): CustomerIdentity {
  return {
    id: record.id,
    name: record.name,
    customerNumber: record.customer_number,
    hasPhoto: Boolean(record.photo_filename),
  };
}

const REPORT_MAX_PAGE_SIZE = 2000;

function resolveReportPagination(
  pageInput: number | undefined,
  pageSizeInput: number | undefined,
  totalCount: number,
  defaultPageSize: number,
): { page: number; pageSize: number; totalPages: number } {
  const rawSize = pageSizeInput ?? defaultPageSize;
  const pageSize = Math.min(REPORT_MAX_PAGE_SIZE, Math.max(1, Math.floor(rawSize)));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, pageInput ?? 1), totalPages);
  return { page, pageSize, totalPages };
}

function toCustomer(record: CustomerRecord): Customer {
  return {
    id: record.id,
    name: record.name,
    customerNumber: record.customer_number,
    hasPhoto: Boolean(record.photo_filename),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
