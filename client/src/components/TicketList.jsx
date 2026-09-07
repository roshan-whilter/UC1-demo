/** Tickets raised so far — reads the non-spec /demo/tickets helper. */
export default function TicketList({ tickets, onRefresh }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">Tickets raised</h2>
          <p className="panel__description">
            From <code>GET /demo/tickets</code> — a console helper, not part of
            the UC1 spec.
          </p>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {tickets.length === 0 ? (
        <p className="empty">No tickets yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Status</th>
              <th>Created</th>
              <th>msisdn</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.ticketId}>
                <td className="mono">{ticket.ticketId}</td>
                <td>
                  <span className="badge badge--open">{ticket.status}</span>
                </td>
                <td className="mono">{ticket.createdAt}</td>
                <td className="mono">{ticket.msisdn}</td>
                <td className="table__summary">{ticket.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
