import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INITIAL_WORKSHEET_ROWS, suggestTellerDailyExportFileName } from '@shared/teller/worksheetRows';
import { isPrimaryTellerCurrency, tellerDayAction } from '@shared/teller/sessionState';
import type { CompanyProfile } from '@shared/types/company';
import type { Currency } from '@shared/types/currency';
import type { TellerSheet } from '@shared/types/teller';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ModuleSwitcher, type AppModule } from '../../components/ModuleSwitcher';
import { useAuth } from '../../context/AuthContext';
import { TellerCurrencyForm } from './components/TellerCurrencyForm';
import { TellerCurrencyEditor } from './components/TellerCurrencyEditor';
import { TellerSheetPage } from './TellerSheetPage';

interface TellerShellProps {
  onSwitchModule: (module: AppModule) => void;
}

export function TellerShell({ onSwitchModule }: TellerShellProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { username, logout, sessionId } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyCode, setCurrencyCode] = useState<string | null>(null);
  const [sheet, setSheet] = useState<TellerSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pendingRows, setPendingRows] = useState<number | null>(null);
  const [pendingReset, setPendingReset] = useState(false);
  const [worksheetRows, setWorksheetRows] = useState(INITIAL_WORKSHEET_ROWS);
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [showCurrencyEditor, setShowCurrencyEditor] = useState(false);
  const [openSessionCount, setOpenSessionCount] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.company.get({ sessionId }).then((result) => {
      if (result.ok) {
        setCompany(result.data);
      }
    });
    void window.api.company.getLogo({ sessionId }).then((result) => {
      if (result.ok && result.data) {
        setLogoSrc(`data:${result.data.mimeType};base64,${result.data.dataBase64}`);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.api.tellerCurrencies.list({ sessionId }).then((result) => {
      if (result.ok) {
        const active = result.data.currencies.filter((item) => item.isActive);
        setCurrencies(active);
        setCurrencyCode((current) => current ?? active[0]?.code ?? null);
      }
    });
    void window.api.teller.currentSession({ sessionId }).then((result) => {
      if (result.ok) {
        setOpenSessionCount(result.data.sessions.length);
      }
    });
  }, [sessionId, refreshKey]);

  useEffect(() => {
    if (!sessionId || !currencyCode) {
      setSheet(null);
      return;
    }
    void window.api.teller.getSheet({ sessionId, currencyCode }).then((result) => {
      if (result.ok) {
        setSheet(result.data);
        setError(null);
      } else {
        setError(tErrors(result.errorCode));
      }
    });
  }, [sessionId, currencyCode, refreshKey, tErrors]);

  function bump(): void {
    setRefreshKey((value) => value + 1);
  }

  function selectCurrency(code: string): void {
    setCurrencyCode(code);
    setSheet(null);
    setError(null);
    setExportMessage(null);
    setShowAddCurrency(false);
    setShowCurrencyEditor(false);
  }

  function handleCurrencyCreated(code: string): void {
    bump();
    selectCurrency(code);
  }

  async function confirmEndDay(): Promise<void> {
    if (!sessionId || pendingRows === null || ending) {
      return;
    }
    setEnding(true);
    setError(null);
    const result = await window.api.teller.endDay({
      sessionId,
      fileName: suggestTellerDailyExportFileName(sheet?.session?.sessionDate ?? ''),
      worksheetRows: pendingRows,
    });
    setEnding(false);
    setPendingRows(null);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    if ('canceled' in result.data && result.data.canceled) {
      return;
    }
    if ('filePath' in result.data) {
      setOpenSessionCount(0);
      setExportMessage(t('session.exportSuccess', { path: result.data.filePath }));
      bump();
    }
  }

  async function startToday(): Promise<void> {
    if (!sessionId || starting) {
      return;
    }
    setStarting(true);
    setError(null);
    const result = await window.api.teller.startDay({ sessionId });
    setStarting(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    setOpenSessionCount(result.data.sheets.filter((item) => item.session?.status === 'OPEN').length);
    const selected = result.data.sheets.find((item) => item.currencyCode === currencyCode);
    if (selected) {
      setSheet(selected);
    } else {
      bump();
    }
    setExportMessage(null);
  }

  async function confirmResetCash(): Promise<void> {
    if (!sessionId || !currencyCode || resetting) {
      return;
    }
    setResetting(true);
    setError(null);
    const result = await window.api.teller.resetCash({ sessionId, currencyCode });
    setResetting(false);
    setPendingReset(false);
    if (!result.ok) {
      setError(tErrors(result.errorCode));
      return;
    }
    setSheet(result.data);
    setExportMessage(null);
  }

  return (
    <div className="app-shell app-shell-teller">
      <header className="app-header app-header-bar">
        <div className="header-brand">
          {logoSrc ? <img className="header-logo" src={logoSrc} alt="" /> : null}
          <div>
            <h1>{company?.name?.trim() || tCommon('appName')}</h1>
            <p className="subtitle">{username ? tCommon('signedInAs', { username }) : null}</p>
          </div>
        </div>
        <div className="header-toolbar">
          {isPrimaryTellerCurrency(currencyCode, currencies.map((currency) => currency.code)) ? (
            tellerDayAction(openSessionCount) === 'END' ? (
              <button
                type="button"
                className="teller-end-day-btn"
                disabled={ending}
                onClick={() => setPendingRows(worksheetRows)}
              >
                {t('session.endDay')}
              </button>
            ) : (
              <button
                type="button"
                className="teller-end-day-btn"
                disabled={starting}
                onClick={() => void startToday()}
              >
                {t('session.startDay')}
              </button>
            )
          ) : null}
          {currencyCode && sheet?.session ? (
            <button
              type="button"
              className="teller-reset-cash-btn"
              disabled={resetting}
              onClick={() => setPendingReset(true)}
            >
              {t('session.resetCash')}
            </button>
          ) : null}
          <ModuleSwitcher current="teller" onSwitch={onSwitchModule} />
          <LanguageSelector />
          <button type="button" className="button button-secondary" onClick={() => void logout()}>
            {tCommon('logout')}
          </button>
        </div>
      </header>

      <main className="app-main teller-main">
        {error ? <p className="form-error">{error}</p> : null}
        {exportMessage ? <p className="teller-export-success">{exportMessage}</p> : null}
        {sheet ? (
          <TellerSheetPage
            sheet={sheet}
            onChanged={bump}
            onWorksheetRowsChange={setWorksheetRows}
          />
        ) : <p className="hint-text">{t('sheet.chooseCurrency')}</p>}
      </main>

      {currencyCode ? (
        <nav className="teller-sheet-tabs" role="tablist" aria-label={t('form.currency')}>
          {currencies.map((currency) => (
            <button
              key={currency.code}
              type="button"
              role="tab"
              aria-selected={currencyCode === currency.code}
              className={
                currencyCode === currency.code
                  ? `teller-sheet-tab is-active is-${currency.code.toLowerCase()}`
                  : `teller-sheet-tab is-${currency.code.toLowerCase()}`
              }
              onClick={() => selectCurrency(currency.code)}
            >
              {currency.code}
            </button>
          ))}
          <button
            type="button"
            className="teller-sheet-tab"
            onClick={() => {
              setShowCurrencyEditor(false);
              setShowAddCurrency((value) => !value);
            }}
          >
            {t('form.addCurrency')}
          </button>
          <button
            type="button"
            className="teller-sheet-tab teller-edit-currency-tab"
            onClick={() => {
              setShowAddCurrency(false);
              setShowCurrencyEditor((value) => !value);
            }}
          >
            {t('form.editCurrency')}
          </button>
        </nav>
      ) : null}
      {currencyCode && showAddCurrency ? (
        <div className="teller-currency-form-inline">
          <TellerCurrencyForm onCreated={handleCurrencyCreated} />
        </div>
      ) : null}
      {currencyCode && showCurrencyEditor ? (
        <div className="teller-currency-form-inline">
          <TellerCurrencyEditor currencyCode={currencyCode} onChanged={bump} onClose={() => setShowCurrencyEditor(false)} />
        </div>
      ) : null}

      {pendingRows !== null ? (
        <div className="teller-end-day-dialog" role="dialog" aria-modal="true">
          <div className="teller-end-day-dialog-card">
            <p className="teller-end-day-dialog-title">{t('session.confirmEndTitle')}</p>
            <ul>
              <li>{t('session.confirmEndFinalize')}</li>
              <li>{t('session.confirmEndOp')}</li>
              <li>{t('session.confirmEndExcel')}</li>
            </ul>
            <div className="teller-end-day-dialog-actions">
              <button type="button" className="button button-secondary" disabled={ending} onClick={() => setPendingRows(null)}>
                {t('session.cancel')}
              </button>
              <button type="button" className="teller-end-day-btn" disabled={ending} onClick={() => void confirmEndDay()}>
                {t('session.endDay')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingReset ? (
        <div className="teller-end-day-dialog" role="dialog" aria-modal="true">
          <div className="teller-end-day-dialog-card">
            <p className="teller-end-day-dialog-title">{t('session.confirmResetTitle')}</p>
            <ul>
              <li>{t('session.confirmResetWarn')}</li>
              <li>{t('session.confirmResetCounts')}</li>
              <li>{t('session.confirmResetWorksheet')}</li>
              <li>{t('session.confirmResetHistory')}</li>
            </ul>
            <div className="teller-end-day-dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={resetting}
                onClick={() => setPendingReset(false)}
              >
                {t('session.cancel')}
              </button>
              <button
                type="button"
                className="teller-reset-cash-btn"
                disabled={resetting}
                onClick={() => void confirmResetCash()}
              >
                {t('session.confirmReset')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
