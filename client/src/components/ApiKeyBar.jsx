import { useState } from "react";

/**
 * Where the teammate pastes their key. Masked by default so the console can be
 * screen-shared during the demo without leaking it.
 */
export default function ApiKeyBar({ apiKey, onChange, status }) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(apiKey);

  const dirty = draft !== apiKey;

  const save = (event) => {
    event.preventDefault();
    onChange(draft.trim());
  };

  return (
    <form className="keybar" onSubmit={save}>
      <label className="keybar__field">
        <span className="field__label">x-api-key</span>
        <input
          className="input"
          type={visible ? "text" : "password"}
          value={draft}
          placeholder="Paste the key your team was given"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>

      <button
        type="button"
        className="button button--ghost"
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? "Hide" : "Show"}
      </button>

      <button className="button" type="submit" disabled={!dirty}>
        {dirty ? "Save" : "Saved"}
      </button>

      <span className={`keystatus keystatus--${status.tone}`}>
        {status.label}
      </span>
    </form>
  );
}
