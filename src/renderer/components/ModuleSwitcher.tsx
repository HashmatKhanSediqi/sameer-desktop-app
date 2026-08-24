import { useTranslation } from 'react-i18next';

export type AppModule = 'select' | 'accounting' | 'teller';

interface ModuleSwitcherProps {
  current: 'accounting' | 'teller';
  onSwitch: (module: AppModule) => void;
}

export function ModuleSwitcher({ current, onSwitch }: ModuleSwitcherProps): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <div className="module-switcher" role="group" aria-label={t('modules.switchLabel')}>
      <button
        type="button"
        className={current === 'accounting' ? 'module-switcher-btn is-active' : 'module-switcher-btn'}
        onClick={() => onSwitch('accounting')}
        aria-pressed={current === 'accounting'}
      >
        {t('modules.switchToAccounting')}
      </button>
      <span className="module-switcher-sep" aria-hidden="true">
        ↕
      </span>
      <button
        type="button"
        className={current === 'teller' ? 'module-switcher-btn is-active' : 'module-switcher-btn'}
        onClick={() => onSwitch('teller')}
        aria-pressed={current === 'teller'}
      >
        {t('modules.switchToTeller')}
      </button>
      <button type="button" className="button-link module-switcher-all" onClick={() => onSwitch('select')}>
        {t('modules.chooseModule')}
      </button>
    </div>
  );
}
