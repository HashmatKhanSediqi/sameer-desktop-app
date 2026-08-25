import { useTranslation } from 'react-i18next';
import type { CustomerListItem } from '@shared/types/customer';
import { BalanceAmount } from '../../../components/BalanceAmount';
import { CustomerAvatar } from './CustomerAvatar';

interface CustomerTableProps {
  customers: CustomerListItem[];
  currencyCodes: string[];
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (customer: CustomerListItem) => void;
}

export function CustomerTable({
  customers,
  currencyCodes,
  onView,
  onEdit,
  onDelete,
}: CustomerTableProps): JSX.Element {
  const { t } = useTranslation('customers');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="customer-card-grid">
      {customers.map((customer) => {
        const displayName = customer.name?.trim() ? customer.name : t('noName');
        return (
          <article key={customer.id} className="customer-card">
            <div className="customer-card-head">
              <CustomerAvatar
                customerId={customer.id}
                name={customer.name}
                hasPhoto={customer.hasPhoto}
              />
              <div className="customer-card-identity">
                <button type="button" className="link-button customer-card-name" onClick={() => onView(customer.id)}>
                  {displayName}
                </button>
                <p className="customer-card-number">{customer.customerNumber ?? tCommon('emptyValue')}</p>
              </div>
            </div>

            {currencyCodes.length > 0 ? (
              <dl className="customer-card-balances">
                {currencyCodes.map((code) => (
                  <div key={code} className="customer-card-balance">
                    <dt>{code}</dt>
                    <dd>
                      <BalanceAmount amount={customer.balances[code] ?? '0'} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="customer-card-actions">
              <button type="button" className="button button-secondary button-compact" onClick={() => onView(customer.id)}>
                {t('view')}
              </button>
              <button type="button" className="button button-secondary button-compact" onClick={() => onEdit(customer.id)}>
                {t('edit')}
              </button>
              <button type="button" className="button button-danger button-compact" onClick={() => onDelete(customer)}>
                {t('delete')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
