function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractError(error) {
  if (!error) return null;
  const lines = error.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? null;
}

export default function History({ entries, onRemove, onClear }) {
  return (
    <div className="panel">
      <div className="panel-title">
        History
        {entries.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={onClear} type="button" style={{ marginLeft: 'auto' }}>
            Clear all
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="empty-state">No downloads yet.</div>
      ) : (
        entries.map((entry) => {
          const errorMsg = entry.status === 'failed' ? extractError(entry.error) : null;
          return (
            <div className="history-row" key={entry.id}>
              <span className={`status-badge ${entry.status}`}>{entry.status}</span>
              <div className="history-info">
                <div className="history-title">{entry.title}</div>
                {errorMsg && <div className="history-error">{errorMsg}</div>}
                <div className="history-date">{formatDate(entry.finishedAt)}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => onRemove(entry.id)} type="button">
                ×
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
