interface TransactionDateTimeFieldsProps {
  dateId: string;
  timeId: string;
  dateLabel: string;
  timeLabel: string;
  optionalLabel?: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export function TransactionDateTimeFields({
  dateId,
  timeId,
  dateLabel,
  timeLabel,
  optionalLabel,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  disabled = false,
  required = false,
}: TransactionDateTimeFieldsProps): JSX.Element {
  return (
    <div className="datetime-fields">
      <div className="form-field">
        <label htmlFor={dateId}>
          {dateLabel}
          {optionalLabel ? (
            <>
              {' '}
              <span className="optional-label">({optionalLabel})</span>
            </>
          ) : null}
        </label>
        <input
          id={dateId}
          type="date"
          className="money"
          dir="ltr"
          lang="en"
          value={dateValue}
          onChange={(event) => onDateChange(event.target.value)}
          disabled={disabled}
          required={required}
        />
      </div>
      <div className="form-field">
        <label htmlFor={timeId}>{timeLabel}</label>
        <input
          id={timeId}
          type="time"
          className="money"
          dir="ltr"
          lang="en"
          step={60}
          value={timeValue}
          onChange={(event) => onTimeChange(event.target.value)}
          disabled={disabled}
          required={required}
        />
      </div>
    </div>
  );
}
