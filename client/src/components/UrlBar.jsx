import { useState } from 'react';

export default function UrlBar({ onSubmit, loading }) {
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <form className="url-bar" onSubmit={handleSubmit}>
      <input
        className="url-input"
        type="text"
        placeholder="Paste a YouTube video or playlist URL..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
      />
      <button className="btn btn-primary" type="submit" disabled={loading || !value.trim()}>
        {loading ? 'Checking…' : 'Check'}
      </button>
    </form>
  );
}
