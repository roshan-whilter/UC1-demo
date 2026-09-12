/**
 * Smart App push notifications sent so far — reads the non-spec
 * GET /demo/notifications helper. The project's first non-SMS channel.
 */

export default function NotificationList({ notifications, onRefresh }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__path">App notifications sent</h2>
          <p className="panel__description">
            From <code>GET /demo/notifications</code> — a console helper, not
            part of the spec. Nothing is really pushed; the mock records the
            send. First non-SMS channel in the project.
          </p>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      {notifications.length === 0 ? (
        <p className="empty">No notifications sent yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Notification</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Plan</th>
                <th>Title</th>
                <th>Body</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.notificationId}>
                  <td className="mono">{n.notificationId}</td>
                  <td>{n.channel}</td>
                  <td>
                    <span className="badge badge--open">{n.status}</span>
                  </td>
                  <td className="mono">{n.sentAt}</td>
                  <td className="mono">{n.planId}</td>
                  <td>{n.title}</td>
                  <td>{n.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
