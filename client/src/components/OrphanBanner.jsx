export default function OrphanBanner({ job, onResume, onDiscard }) {
  if (!job) return null;

  return (
    <div className="orphan-banner">
      <div className="orphan-banner-title">Interrupted download found</div>
      <div>
        "{job.title || job.url}" was still downloading when the app last closed.
      </div>
      <div className="orphan-banner-actions">
        <button className="btn btn-primary btn-sm" onClick={onResume} type="button">
          Resume
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onDiscard} type="button">
          Discard
        </button>
      </div>
    </div>
  );
}
