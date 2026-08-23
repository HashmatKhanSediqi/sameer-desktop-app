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
    <div className="table-wrap">
      <table className="customer-table">
        <thead>
          <tr>
            <th className="col-photo">{t('list.photo')}</th>
            <th>{t('list.name')}</th>
            <th>{t('list.number')}</th>
            {currencyCodes.map((code) => (
              <th key={code} className="col-amount">
                {code}
              </th>
            ))}
            <th className="col-actions">{t('list.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td className="col-photo" data-label={t('list.photo')}>
                <CustomerAvatar
                  customerId={customer.id}
                  name={customer.name}
                  hasPhoto={customer.hasPhoto}
                />
              </td>
              <td data-label={t('list.name')}>
                <button type="button" className="link-button" onClick={() => onView(customer.id)}>
                  {customer.name?.trim() ? customer.name : t('noName')}
                </button>
              </td>
              <td data-label={t('list.number')}>{customer.customerNumber ?? tCommon('emptyValue')}</td>
              {currencyCodes.map((code) => (
                <td key={code} className="col-amount" data-label={code}>
                  <BalanceAmount amount={customer.balances[code] ?? '0'} />
                </td>
              ))}
              <td className="col-actions" data-label={t('list.actions')}>
                <button type="button" className="button button-secondary button-compact" onClick={() => onView(customer.id)}>
                  {t('view')}
                </button>
                <button type="button" className="button button-secondary button-compact" onClick={() => onEdit(customer.id)}>
                  {t('edit')}
                </button>
                <button
                  type="button"
                  className="button button-danger button-compact"
                  onClick={() => onDelete(customer)}
                >
                  {t('delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
