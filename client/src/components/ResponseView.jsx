/**
 * Shows the response exactly as it came back, plus the two things a reviewer
 * checks against the spec: that HTTP was 200, and what `status` says.
 */
export default function ResponseView({ result, readback }) {
  if (!result) {
    return (
      <div className="response response--empty">
        Send the request to see the response.
      </div>
    );
  }

  const { httpStatus, body, raw, durationMs } = result;
  const outcome = body?.status ?? "UNPARSEABLE";
  const code = body?.error?.code;

  return (
    <div className="response">
      <div className="response__meta">
        <span
          className={`badge badge--${outcome === "SUCCESS" ? "success" : "failure"}`}
        >
          {outcome}
          {code ? ` · ${code}` : ""}
        </span>
        <span className={`badge badge--${httpStatus === 200 ? "http-ok" : "http-bad"}`}>
          HTTP {httpStatus}
        </span>
        <span className="response__timing">{durationMs} ms</span>
      </div>

      {body?.error?.message && (
        <p className="response__error">{body.error.message}</p>
      )}

      {readback && (
        <div className="readback">
          <div className="readback__label">Agent says</div>
          <p>{readback}</p>
        </div>
      )}

      <pre className="code">{body ? JSON.stringify(body, null, 2) : raw}</pre>
    </div>
  );
}
