export default function ConfigPanel({ config, onChange }) {
  function update(key, value) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="panel">
      <div className="panel-title">Settings</div>
      <div className="config-grid">
        <div className="config-field">
          <label htmlFor="quality">Video quality</label>
          <select
            id="quality"
            value={config.quality}
            onChange={(e) => update('quality', e.target.value)}
            disabled={config.audioOnly}
          >
            <option value="best">Best available</option>
            <option value="1080p">1080p max</option>
            <option value="720p">720p max</option>
            <option value="480p">480p max</option>
          </select>
        </div>

        <div className="config-field">
          <label htmlFor="outputFormat">Output format</label>
          <select
            id="outputFormat"
            value={config.outputFormat}
            onChange={(e) => update('outputFormat', e.target.value)}
            disabled={config.audioOnly}
          >
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
            <option value="webm">WebM</option>
          </select>
        </div>

        <div className="config-field">
          <label htmlFor="audioFormat">Audio format</label>
          <select
            id="audioFormat"
            value={config.audioFormat}
            onChange={(e) => update('audioFormat', e.target.value)}
            disabled={!config.audioOnly}
          >
            <option value="mp3">MP3</option>
            <option value="m4a">M4A</option>
            <option value="opus">Opus</option>
          </select>
        </div>

        <div className="config-field">
          <label htmlFor="speedLimit">Speed limit (e.g. 2M, empty = unlimited)</label>
          <input
            id="speedLimit"
            type="text"
            value={config.speedLimit}
            placeholder="unlimited"
            onChange={(e) => update('speedLimit', e.target.value)}
          />
        </div>

        <div className="config-field">
          <label htmlFor="outputDir">Output folder (inside container)</label>
          <input
            id="outputDir"
            type="text"
            value={config.outputDir}
            onChange={(e) => update('outputDir', e.target.value)}
          />
        </div>

        <div className="config-field">
          <label htmlFor="filenameTemplate">Filename template</label>
          <input
            id="filenameTemplate"
            type="text"
            value={config.filenameTemplate}
            onChange={(e) => update('filenameTemplate', e.target.value)}
          />
        </div>
      </div>

      <label className="config-toggle" style={{ marginTop: 14 }}>
        <input
          type="checkbox"
          checked={config.audioOnly}
          onChange={(e) => update('audioOnly', e.target.checked)}
        />
        Audio only (extract audio, skip video)
      </label>
    </div>
  );
}
