import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultTellerWorksheetWidths } from '@shared/teller/worksheetColumns';
import {
  INITIAL_WORKSHEET_ROWS,
  resolveWorksheetRowCountFromTransactions,
} from '@shared/teller/worksheetRows';
import { useAuth } from '../../context/AuthContext';
import type { TellerSheet } from '@shared/types/teller';
import { TellerLogTable, type DraftRow } from './components/TellerLogTable';
import { TellerSummaryPanel } from './components/TellerSummaryPanel';
import { TellerSaveQueue, type SaveSnapshot } from '@shared/teller/saveQueue';

interface TellerSheetPageProps {
  sheet: TellerSheet;
  onChanged: () => void;
  onWorksheetRowsChange: (rows: number) => void;
  queue: TellerSaveQueue;
  locked: boolean;
}

export function TellerSheetPage({ sheet, onChanged, onWorksheetRowsChange, queue, locked }: TellerSheetPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { sessionId, username, login } = useAuth();
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const session = sheet.session;
  const disabled = locked || !session || session.status !== 'OPEN';
  const [rowCount, setRowCount] = useState(INITIAL_WORKSHEET_ROWS);
  const [columnWidths, setColumnWidths] = useState(() =>
    defaultTellerWorksheetWidths(sheet.denominations.map((denomination) => denomination.value)),
  );
  const [persistence, setPersistence] = useState<SaveSnapshot>(queue.snapshot());
  const { state: persistenceState, error: persistenceError } = persistence;
  const denominationSignature = sheet.denominations.map((denomination) => `${denomination.id}:${denomination.value}`).join('|');
  const depositBodyRef = useRef<HTMLDivElement | null>(null);
  const withdrawalBodyRef = useRef<HTMLDivElement | null>(null);
  const syncingScroll = useRef(false);

  useEffect(() => {
    onWorksheetRowsChange(rowCount);
  }, [onWorksheetRowsChange, rowCount]);

  useEffect(() => {
    setRowCount(resolveWorksheetRowCountFromTransactions(INITIAL_WORKSHEET_ROWS, sheet.deposits, sheet.withdrawals));
    setColumnWidths(defaultTellerWorksheetWidths(sheet.denominations.map((denomination) => denomination.value)));
  }, [sheet.currencyCode, sheet.session?.id, denominationSignature]);

  useEffect(() => {
    setRowCount((current) =>
      resolveWorksheetRowCountFromTransactions(current, sheet.deposits, sheet.withdrawals),
    );
  }, [sheet.deposits.length, sheet.withdrawals.length]);

  const credentials = useRef(sessionId);
  credentials.current = sessionId;
  useEffect(() => queue.subscribe(setPersistence), [queue]);
  useEffect(() => { if (sessionId) queue.retry(); }, [sessionId, queue]);
  const persistRow = useCallback((direction: 'DEPOSIT' | 'WITHDRAWAL', row: DraftRow) => {
    if (!session || row.isOpening) return;
    queue.enqueue(`${session.id}:${direction}:${row.sequenceNo}`, async () => {
      if (!credentials.current) throw new Error('NOT_AUTHENTICATED');
      const denominationCounts: Record<string, number> = {};
      for (const denom of sheet.denominations) {
        const raw = (row.counts[denom.value] ?? '').trim();
        if (raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
          throw new Error('TELLER_DENOMINATION_INVALID');
        }
        denominationCounts[denom.value] = raw ? Number(raw) : 0;
      }
      const result = await window.api.teller.upsertTransaction({
        sessionId: credentials.current, tellerSessionId: session.id,
        worksheetRow: Number(row.sequenceNo), direction,
        referenceLabel: row.referenceLabel,
        declaredAmount: row.declaredAmount.trim() || null, denominationCounts,
      });
      if (!result.ok) throw new Error(result.errorCode);
      onChanged();
    });
  }, [queue, session, sheet.denominations, onChanged]);

  function saveMeta(input: { oppAmount?: string }): void {
    if (!session) return;
    queue.enqueue(`${session.id}:meta`, async () => {
      if (!credentials.current) throw new Error('NOT_AUTHENTICATED');
      const result = await window.api.teller.updateSession({
        sessionId: credentials.current, tellerSessionId: session.id, ...input,
      });
      if (!result.ok) throw new Error(result.errorCode);
      onChanged();
    });
  }

  function syncBodyScroll(scrollTop: number, source: HTMLDivElement): void {
    if (syncingScroll.current) {
      return;
    }
    const other = source === depositBodyRef.current ? withdrawalBodyRef.current : depositBodyRef.current;
    if (!other || other.scrollTop === scrollTop) {
      return;
    }
    syncingScroll.current = true;
    other.scrollTop = scrollTop;
    syncingScroll.current = false;
  }

  const awaitingStart = !session || session.status === 'CLOSED';

  return (
    <div className="teller-workbook">
      {session ? (
        <TellerSummaryPanel
          currencyCode={sheet.currencyCode}
          denominations={sheet.denominations}
          session={session}
          summary={sheet.summary}
          disabled={disabled}
          onSaveMeta={(input) => void saveMeta(input)}
        />
      ) : (
        <p className="hint-text">{t('session.noneHint')}</p>
      )}
      <div className={`teller-save-state teller-save-state-${persistenceState}`} role={persistenceState === 'failed' ? 'alert' : 'status'}>
        {persistenceState === 'saving' ? t('saving') : persistenceState === 'failed' ? `${t('saveFailed')}: ${t(persistenceError ?? 'INTERNAL_ERROR', { ns: 'errors' })}` : t('saved')}
        {persistenceState === 'failed' && <button className="button button-secondary" onClick={() => queue.retry()}>{t('retrySave')}</button>}
      </div>
      {persistenceState === 'failed' && (persistenceError === 'SESSION_EXPIRED' || persistenceError === 'NOT_AUTHENTICATED') && (
        <form className="action-bar" onSubmit={event => {
          event.preventDefault();
          if (username) void login(username, password).then(result => {
            setPassword(''); setLoginError(result.ok ? null : result.errorCode);
          }).catch(() => setLoginError('INTERNAL_ERROR'));
        }}>
          <label htmlFor="teller-reauth">{t('passwordLabel', { ns: 'auth' })}</label>
          <input id="teller-reauth" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
          <button className="button button-primary" type="submit">{t('loginButton', { ns: 'auth' })}</button>
          {loginError && <span role="alert">{t(loginError, { ns: 'errors' })}</span>}
        </form>
      )}
      <div className="teller-logs">
        <TellerLogTable
          key={`${sheet.currencyCode}-deposit-${session?.id ?? 'none'}-${session?.status ?? 'idle'}`}
          direction="DEPOSIT"
          currencyCode={sheet.currencyCode}
          denominations={sheet.denominations}
          transactions={awaitingStart ? [] : sheet.deposits}
          opening={awaitingStart ? null : sheet.opening}
          rowCount={rowCount}
          disabled={disabled}
          openingLocked
          onPersist={(row) => void persistRow('DEPOSIT', row)}
          onNeedRow={() => setRowCount((current) => current + 1)}
          onBodyScroll={syncBodyScroll}
          bodyRef={(element) => {
            depositBodyRef.current = element;
          }}
          columnWidths={columnWidths}
          onColumnWidthsChange={setColumnWidths}
        />
        <TellerLogTable
          key={`${sheet.currencyCode}-withdrawal-${session?.id ?? 'none'}-${session?.status ?? 'idle'}`}
          direction="WITHDRAWAL"
          currencyCode={sheet.currencyCode}
          denominations={sheet.denominations}
          transactions={awaitingStart ? [] : sheet.withdrawals}
          rowCount={rowCount}
          disabled={disabled}
          onPersist={(row) => void persistRow('WITHDRAWAL', row)}
          onNeedRow={() => setRowCount((current) => current + 1)}
          onBodyScroll={syncBodyScroll}
          bodyRef={(element) => {
            withdrawalBodyRef.current = element;
          }}
          columnWidths={columnWidths}
          onColumnWidthsChange={setColumnWidths}
        />
      </div>
    </div>
  );
}
