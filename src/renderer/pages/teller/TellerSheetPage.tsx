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
import { parsePieceInput } from './tellerDisplay';

interface TellerSheetPageProps {
  sheet: TellerSheet;
  onChanged: () => void;
  onWorksheetRowsChange: (rows: number) => void;
}

export function TellerSheetPage({ sheet, onChanged, onWorksheetRowsChange }: TellerSheetPageProps): JSX.Element {
  const { t } = useTranslation('teller');
  const { sessionId } = useAuth();
  const session = sheet.session;
  const disabled = !session || session.status !== 'OPEN';
  const [rowCount, setRowCount] = useState(INITIAL_WORKSHEET_ROWS);
  const [columnWidths, setColumnWidths] = useState(() =>
    defaultTellerWorksheetWidths(sheet.denominations.map((denomination) => denomination.value)),
  );
  const [persistenceState, setPersistenceState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
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

  const persistRow = useCallback(
    async (direction: 'DEPOSIT' | 'WITHDRAWAL', row: DraftRow) => {
      if (!sessionId || !session || row.isOpening) {
        return;
      }
      const denominationCounts: Record<string, number> = {};
      for (const denom of sheet.denominations) {
        denominationCounts[denom.value] = parsePieceInput(row.counts[denom.value] ?? '');
      }
      const blank =
        row.referenceLabel.trim().length === 0 &&
        row.declaredAmount.trim().length === 0 &&
        Object.values(denominationCounts).every((quantity) => quantity === 0);
      if (blank && row.id === undefined) {
        return;
      }
      const existing = (direction === 'DEPOSIT' ? sheet.deposits : sheet.withdrawals).find((item) => item.id === row.id);
      if (
        existing &&
        existing.referenceLabel === row.referenceLabel.trim() &&
        (existing.declaredAmount ?? '') === row.declaredAmount.trim() &&
        sheet.denominations.every(
          (denom) => (existing.denominationCounts[denom.value] ?? 0) === (denominationCounts[denom.value] ?? 0),
        )
      ) {
        return;
      }
      setPersistenceState('saving');
      const result = await window.api.teller.upsertTransaction({
        sessionId,
        tellerSessionId: session.id,
        id: row.id,
        worksheetRow: Number(row.sequenceNo),
        direction,
        referenceLabel: row.referenceLabel,
        declaredAmount: row.declaredAmount.trim() === '' ? null : row.declaredAmount.trim(),
        denominationCounts,
      });
      if (result.ok) {
        setPersistenceState('saved');
        setPersistenceError(null);
        onChanged();
      } else {
        setPersistenceState('failed');
        setPersistenceError(result.message ?? t('saveFailed'));
      }
    },
    [onChanged, session, sessionId, sheet.denominations, sheet.deposits, sheet.withdrawals],
  );

  async function saveMeta(input: {
    oppAmount?: string;
  }): Promise<void> {
    if (!sessionId || !session) {
      return;
    }
    setPersistenceState('saving');
    const result = await window.api.teller.updateSession({
      sessionId,
      tellerSessionId: session.id,
      ...input,
    });
    if (result.ok) {
      setPersistenceState('saved');
      setPersistenceError(null);
      onChanged();
    } else {
      setPersistenceState('failed');
      setPersistenceError(result.message ?? t('saveFailed'));
    }
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
        {persistenceState === 'saving' ? t('saving') : persistenceState === 'failed' ? `${t('saveFailed')}: ${persistenceError ?? ''}` : t('saved')}
      </div>
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
