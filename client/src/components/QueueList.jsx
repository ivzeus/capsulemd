export default function QueueList({ jobs, onRemove }) {
  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-title">Up next ({jobs.length})</div>
      {jobs.map((job) => (
        <div className="history-row" key={job.id}>
          <div className="history-info">
            <div className="history-title">{job.title || job.url}</div>
            <div className="history-date">{job.type === 'playlist' ? 'Playlist' : 'Video'}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onRemove(job.id)} type="button">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
