const SEGMENT_COUNT = 36;

function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec) return '—';
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export default function CurrentDownload({ job, progress, log = [], playlistProgress, onCancel }) {
  if (!job) {
    return (
      <div className="panel">
        <div className="panel-title">Current download</div>
        <div className="empty-state">Nothing downloading right now. Paste a link above to get started.</div>
      </div>
    );
  }

  const pct = progress?.total_bytes
    ? (progress.downloaded_bytes / progress.total_bytes) * 100
    : progress?._percent_str
      ? parseFloat(progress._percent_str)
      : 0;

  const filledSegments = Math.round((pct / 100) * SEGMENT_COUNT);

  const activeThumbnail =
    playlistProgress?.thumbnail ??
    (job.type === 'playlist' && job.clipThumbnails
      ? job.clipThumbnails[(playlistProgress?.current ?? 1) - 1]
      : job.thumbnail);

  return (
    <div className="panel">
      <div className="panel-title">Current download</div>
      <div className="current-job">
        {activeThumbnail && <img className="current-job-thumb" src={activeThumbnail} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
        <div className="current-job-info">
          <p className="current-job-title">
            {job.title || job.url}
            {job.type === 'playlist' && playlistProgress && (
              <span className="playlist-clip-counter">
                {' '}— {playlistProgress.current} / {playlistProgress.total}
              </span>
            )}
          </p>
          <div className="current-job-meta">
            <span>{job.type === 'playlist' ? 'Playlist' : 'Video'}</span>
            <span>{formatSpeed(progress?.speed)}</span>
            <span>ETA {formatEta(progress?.eta)}</span>
          </div>

          <div className="tape-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
              <div
                key={i}
                className={`tape-segment ${i < filledSegments ? 'filled' : ''} ${pct >= 99.5 ? 'done' : ''}`}
              />
            ))}
          </div>

          <div className="progress-footer">
            <span>{pct.toFixed(1)}%</span>
            <span>
              {formatBytes(progress?.downloaded_bytes)} / {formatBytes(progress?.total_bytes)}
            </span>
          </div>
        </div>
      </div>

      {log.length > 0 && (
        <div className="download-log">
          {log.map((line, i) => (
            <div key={i} className={`log-line${line.startsWith('$ ') ? ' log-line-cmd' : line.toLowerCase().includes('error') ? ' log-line-error' : ''}`}>
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="job-actions">
        <button className="btn btn-danger btn-sm" onClick={onCancel} type="button">
          Cancel download
        </button>
      </div>
    </div>
  );
}
