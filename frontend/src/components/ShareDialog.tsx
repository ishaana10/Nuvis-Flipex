import { useState } from 'react';
import { api } from '../api/client';
import type { Flipbook } from '../pages/Dashboard';

export default function ShareDialog(
  { flipbook, onClose, onSaved }: { flipbook: Flipbook; onClose(): void; onSaved(): void },
) {
  const [published, setPublished] = useState(flipbook.published);
  const [visibility, setVisibility] = useState(flipbook.visibility);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const url = `${location.origin}/v/${flipbook.slug}`;
  const embed = `<iframe src="${url}" width="100%" height="600" style="border:0" allowfullscreen></iframe>`;

  const save = async () => {
    setMsg('');
    try {
      await api(`/flipbooks/${flipbook.id}`, 'PATCH', { published, visibility, ...(password ? { password } : {}) });
      setMsg('Saved'); onSaved();
    } catch (e: any) { setMsg(e.fields?.password ?? e.message); }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2>Share “{flipbook.title}”</h2>
        <label><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published</label>
        <label className="field"><span>Visibility</span>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
            <option value="unlisted">Unlisted (anyone with the link)</option>
            <option value="public">Public</option>
            <option value="password">Password protected</option>
          </select></label>
        {visibility === 'password' && (
          <label className="field"><span>Password {flipbook.visibility === 'password' && '(leave blank to keep)'}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        <button onClick={save}>Save</button> {msg && <small>{msg}</small>}
        {published && (
          <>
            <label className="field"><span>Link</span><input readOnly value={url} onFocus={(e) => e.target.select()} /></label>
            <label className="field"><span>Embed</span><textarea readOnly rows={3} value={embed} onFocus={(e) => e.target.select()} /></label>
          </>
        )}
        <button className="link" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
