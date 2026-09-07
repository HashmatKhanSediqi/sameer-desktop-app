export interface ConfirmationAction {
  label: string;
  className: 'button button-primary' | 'button button-danger';
}

export function buildConfirmationAction(label: string, tone: 'danger' | 'primary'): ConfirmationAction {
  return {
    label,
    className: tone === 'primary' ? 'button button-primary' : 'button button-danger',
  };
}
