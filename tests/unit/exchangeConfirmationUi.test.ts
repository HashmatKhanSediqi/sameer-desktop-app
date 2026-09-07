import { describe, expect, it } from 'vitest';
import { buildConfirmationAction } from '../../src/shared/confirmationAction';

describe('exchange confirmation UI', () => {
  it('configures Confirm Exchange as a primary action and never Delete', () => {
    const action = buildConfirmationAction('Confirm Exchange', 'primary');
    expect(action).toEqual({ label: 'Confirm Exchange', className: 'button button-primary' });
    expect(action.label).not.toBe('Delete');
  });

  it('preserves the destructive Delete default for legitimate delete dialogs', () => {
    expect(buildConfirmationAction('Delete', 'danger')).toEqual({
      label: 'Delete', className: 'button button-danger',
    });
  });
});
