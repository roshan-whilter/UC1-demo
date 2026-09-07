import { useState } from "react";
import ResponseView from "./ResponseView.jsx";

/**
 * One documented endpoint: an editable request body, a send button, and the
 * response. The body stays raw text so malformed JSON can be sent on purpose
 * to demonstrate the 400 branch.
 */
export default function EndpointPanel({
  method = "POST",
  path,
  description,
  body,
  onBodyChange,
  onSend,
  result,
  readback,
  children,
}) {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await onSend(body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">
            <span className="method">{method}</span> {path}
          </h2>
          <p className="panel__description">{description}</p>
        </div>
        <button className="button" onClick={send} disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </header>

      {children}

      <label className="field">
        <span className="field__label">Request body</span>
        <textarea
          className="code code--input"
          value={body}
          spellCheck={false}
          rows={12}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </label>

      <ResponseView result={result} readback={readback} />
    </section>
  );
}
