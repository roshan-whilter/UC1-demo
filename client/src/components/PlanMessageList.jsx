/**
 * Plan-detail SMSs sent so far — reads the non-spec GET /demo/plan_messages
 * helper. Useful because send_details is an action endpoint: this is the record
 * of what the agent actually dispatched, and the summary column is the exact
 * text the caller would have received.
 */

export default function PlanMessageList({ messages, onRefresh }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">Plan details texted</h2>
          <p className="panel__description">
            From <code>GET /demo/plan_messages</code> — a console helper, not
            part of the spec. Nothing is really texted; the mock records the
            send.
          </p>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {messages.length === 0 ? (
        <p className="empty">No plan details sent yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Message</th>
                <th>Status</th>
                <th>Sent</th>
                <th>To</th>
                <th>Plan</th>
                <th>Scope</th>
                <th>Text sent</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.messageId}>
                  <td className="mono">{m.messageId}</td>
                  <td>
                    <span className="badge badge--open">{m.status}</span>
                  </td>
                  <td className="mono">{m.sentAt}</td>
                  <td className="mono">{m.to}</td>
                  <td className="mono">{m.planId}</td>
                  <td>{m.scope}</td>
                  <td>{m.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
