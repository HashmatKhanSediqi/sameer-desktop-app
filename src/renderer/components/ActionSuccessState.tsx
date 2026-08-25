export const ACTION_SUCCESS_DISMISS_MS = 1000;

interface ActionSuccessStateProps {
  message: string;
}

export function ActionSuccessState({ message }: ActionSuccessStateProps): JSX.Element {
  return (
    <div className="action-success" role="status" aria-live="polite">
      <span className="action-success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="action-success-message">{message}</p>
    </div>
  );
}
