/**
 * The subscribers currently in the mock — the seeded demo numbers plus anything
 * added through POST /demo/subscribers. Reads the non-spec GET /demo/subscribers
 * helper. Refresh picks up entries a teammate just added by curl.
 */

const MB = (mb) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

const money = (bucket) =>
  bucket ? `${bucket.currency} ${bucket.amount.toFixed(2)}` : "—";

export default function SubscriberList({ subscribers, onRefresh }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">Subscribers</h2>
          <p className="panel__description">
            From <code>GET /demo/subscribers</code> — every number the mock
            knows. Anything added with <code>POST /demo/subscribers</code>{" "}
            appears here on <strong>Refresh</strong>.
          </p>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {subscribers.length === 0 ? (
        <p className="empty">No subscribers loaded.</p>
      ) : (
        <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>msisdn</th>
              <th>Name</th>
              <th>Type</th>
              <th>Main balance</th>
              <th>Bonus</th>
              <th>Data left</th>
              <th>Branch B</th>
              <th>Branch C</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.msisdn}>
                <td className="mono">{s.msisdn}</td>
                <td>{s.name}</td>
                <td>{s.type}</td>
                <td className="mono">{money(s.balance?.main)}</td>
                <td className="mono">{money(s.balance?.bonus)}</td>
                <td className="mono">{MB(s.data?.remainingMB ?? 0)}</td>
                <td>
                  {s.usageHistory ? (
                    <span
                      className="badge badge--open"
                      title={s.usageHistory.cause?.summary || ""}
                    >
                      {s.usageHistory.cause?.identified
                        ? s.usageHistory.cause.type
                        : "no cause"}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {s.plan ? (
                    <span
                      className="badge badge--open"
                      title={
                        s.services?.length
                          ? `Active: ${s.services.map((v) => v.name).join(", ")}`
                          : "No active services"
                      }
                    >
                      {s.plan.name}
                      {s.services?.length ? ` +${s.services.length} VAS` : ""}
                    </span>
                  ) : (
                    <span className="muted">no plan</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
