/**
 * Plan-change links sent so far — reads the non-spec GET /demo/plan_change_links
 * helper. Useful because send_change_link is an action endpoint: this is the
 * record of what the agent actually dispatched.
 */

export default function PlanChangeLinkList({ links, onRefresh }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">Plan change links sent</h2>
          <p className="panel__description">
            From <code>GET /demo/plan_change_links</code> — a console helper,
            not part of the spec. Nothing is really texted; the mock records
            the send.
          </p>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {links.length === 0 ? (
        <p className="empty">No plan change links sent yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Message</th>
                <th>Status</th>
                <th>Sent</th>
                <th>To</th>
                <th>Plan</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.reference}>
                  <td className="mono">{l.reference}</td>
                  <td className="mono">{l.messageId}</td>
                  <td>
                    <span className="badge badge--open">{l.status}</span>
                  </td>
                  <td className="mono">{l.sentAt}</td>
                  <td className="mono">{l.to}</td>
                  <td className="mono">{l.planId}</td>
                  <td className="mono">{l.expiresAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
