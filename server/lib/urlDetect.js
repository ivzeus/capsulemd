const { spawn } = require('child_process');

/**
 * Probes a URL using yt-dlp's per-entry JSON stream (-j).
 * Using lowercase -j instead of -J (single dump) forces yt-dlp to paginate
 * through all playlist pages rather than stopping at the first 100-entry batch.
 *
 * Returns:
 *  { type: 'video', id, title, thumbnail, duration }
 *  { type: 'playlist', id, title, entryCount, entries: [{id, title, url, thumbnail, duration}] }
 */
/**
 * YouTube watch?v=X&list=Y URLs use the video-context extractor, which YouTube
 * caps at 100 entries. Rewrite them to the canonical playlist URL so yt-dlp
 * uses the full playlist extractor instead.
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && u.pathname === '/watch' && u.searchParams.has('list')) {
      return `https://www.youtube.com/playlist?list=${u.searchParams.get('list')}`;
    }
  } catch {}
  return url;
}

function probeUrl(url) {
  const probeTarget = normalizeUrl(url);
  return new Promise((resolve, reject) => {
    const args = ['--flat-playlist', '--no-lazy-playlist', '--no-warnings', '-j', probeTarget];
    const child = spawn('yt-dlp', args);

    let buf = '';
    let stderr = '';
    const entries = [];

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const parts = buf.split('\n');
      buf = parts.pop(); // keep last incomplete line in buffer
      for (const line of parts) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {}
      }
    });

    child.stderr.on('data', (chunk) => (stderr += chunk));

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });

    child.on('close', (code) => {
      // flush any remaining buffered line
      if (buf.trim()) {
        try { entries.push(JSON.parse(buf)); } catch {}
      }

      if (code !== 0) {
        reject(new Error(`yt-dlp probe failed (code ${code}): ${stderr.slice(0, 500)}`));
        return;
      }

      if (entries.length === 0) {
        reject(new Error('yt-dlp returned no results'));
        return;
      }

      try {
        resolve(parseEntries(entries, probeTarget));
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp output: ${err.message}`));
      }
    });
  });
}

// YouTube signed thumbnail URLs (sqp=...&rs=...) expire quickly.
// Use the stable, unsigned hqdefault URL whenever we can identify a YouTube video ID.
function resolveThumbnail(entry) {
  if (entry.ie_key === 'Youtube' || entry.extractor === 'youtube') {
    if (entry.id) return `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
  }
  if (entry.thumbnails?.length) return entry.thumbnails[entry.thumbnails.length - 1].url;
  return entry.thumbnail || null;
}

function parseEntries(entries, originalUrl) {
  const first = entries[0];

  // A playlist is detected when there are multiple entries, or when the
  // single entry carries playlist context fields from yt-dlp.
  const isPlaylist = entries.length > 1 || !!first.playlist_id;

  if (isPlaylist) {
    const mapped = entries.map((e, idx) => ({
      id: e.id,
      index: idx + 1,
      title: e.title || `Item ${idx + 1}`,
      url: e.url || e.webpage_url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null),
      thumbnail: resolveThumbnail(e),
      duration: e.duration || null,
    }));

    // playlist_count is what YouTube reports as the real total; entryCount is
    // what we actually fetched (may be less due to flat-playlist page cap).
    const playlistCount = first.playlist_count || mapped.length;

    return {
      type: 'playlist',
      id: first.playlist_id || null,
      title: first.playlist_title || first.playlist || 'Untitled playlist',
      sourceUrl: originalUrl,
      entryCount: mapped.length,
      playlistCount,
      entries: mapped,
    };
  }

  // Single video
  return {
    type: 'video',
    id: first.id,
    title: first.title || 'Untitled video',
    sourceUrl: originalUrl,
    thumbnail: resolveThumbnail(first),
    duration: first.duration || null,
  };
}

module.exports = { probeUrl };
