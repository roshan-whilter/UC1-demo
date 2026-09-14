/** Troubleshooting SMS links sent by the UC5 outage flow. */

export default function TroubleshootingLinkList({ links, onRefresh }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">Troubleshooting links sent</h2>
          <p className="panel__description">
            From <code>GET /demo/troubleshooting_links</code> — a console helper,
            not part of the spec. The mock records each SMS send.
          </p>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {links.length === 0 ? (
        <p className="empty">No troubleshooting links sent yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Message</th>
                <th>Number</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.messageId}>
                  <td className="mono">{link.messageId}</td>
                  <td className="mono">{link.to}</td>
                  <td>{link.issueType}</td>
                  <td>
                    <span className="badge badge--open">{link.status}</span>
                  </td>
                  <td className="mono">{link.sentAt}</td>
                  <td className="mono">{link.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
