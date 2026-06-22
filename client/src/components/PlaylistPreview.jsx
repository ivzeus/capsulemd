import { useState, useMemo } from 'react';

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlaylistPreview({ playlist, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(playlist.entries.map((e) => e.index)));

  const isTruncated = playlist.playlistCount > playlist.entries.length;
  const allSelected = selected.size === playlist.entries.length;

  function toggle(index) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(playlist.entries.map((e) => e.index)));
  }

  const selectedIndices = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected]);

  return (
    <div className="panel">
      <div className="playlist-preview-header">
        <div className="panel-title" style={{ marginBottom: 0 }}>
          Playlist — {playlist.playlistCount} items — "{playlist.title}"
        </div>
        <button className="btn btn-secondary btn-sm" onClick={toggleAll} type="button">
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {isTruncated && (
        <div className="playlist-truncation-notice">
          Previewing first {playlist.entries.length} of {playlist.playlistCount} items.
          Use "Download all" to grab the full playlist.
        </div>
      )}

      <div className="playlist-preview-list">
        {playlist.entries.map((entry) => (
          <label className="playlist-item" key={entry.index}>
            <input
              type="checkbox"
              checked={selected.has(entry.index)}
              onChange={() => toggle(entry.index)}
            />
            <span className="playlist-item-index">{entry.index}</span>
            <span className="playlist-item-title">{entry.title}</span>
            <span className="playlist-item-duration">{formatDuration(entry.duration)}</span>
          </label>
        ))}
      </div>

      <div className="job-actions">
        {isTruncated && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => onConfirm(null)}
          >
            Download all {playlist.playlistCount} items
          </button>
        )}
        <button
          className="btn btn-primary"
          type="button"
          disabled={selectedIndices.length === 0}
          onClick={() => onConfirm(selectedIndices)}
        >
          Download {selectedIndices.length} selected
        </button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
