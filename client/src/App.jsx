import { useCallback, useEffect, useState } from "react";
import ApiKeyBar from "./components/ApiKeyBar.jsx";
import EndpointPanel from "./components/EndpointPanel.jsx";
import NumberPicker from "./components/NumberPicker.jsx";
import TicketList from "./components/TicketList.jsx";
import {
  callBalanceUsage,
  callTicketCreate,
  fetchTickets,
  UnauthorizedError,
} from "./api.js";
import { loadApiKey, saveApiKey } from "./apiKey.js";
import { balanceUsageRequest, ticketCreateRequest } from "./requests.js";
import { balanceReadback, ticketReadback } from "./readback.js";

export default function App() {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [msisdn, setMsisdn] = useState("85510234567");
  const [balanceBody, setBalanceBody] = useState(() => balanceUsageRequest());
  const [ticketBody, setTicketBody] = useState(() => ticketCreateRequest());
  const [balanceResult, setBalanceResult] = useState(null);
  const [ticketResult, setTicketResult] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [keyState, setKeyState] = useState(apiKey ? "unverified" : "missing");
  const [error, setError] = useState(null);

  // Loading the ticket list doubles as the key check — it's the first
  // authenticated call the page makes.
  const refreshTickets = useCallback(async () => {
    if (!loadApiKey()) {
      setKeyState("missing");
      setTickets([]);
      return;
    }
    try {
      setTickets(await fetchTickets());
      setKeyState("valid");
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setKeyState("rejected");
        setTickets([]);
        setError("That key was rejected. Check it with whoever runs the API.");
      } else {
        setKeyState("unverified");
        setError("Can't reach the API — is the server running on port 4000?");
      }
    }
  }, []);

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets, apiKey]);

  const changeApiKey = (next) => {
    saveApiKey(next);
    setApiKey(next);
    setKeyState(next ? "unverified" : "missing");
    setError(null);
  };

  // Picking a caller number rebuilds both bodies, so the two calls stay about
  // the same subscriber the way they would in a real call.
  const pickNumber = (next) => {
    setMsisdn(next);
    setBalanceBody(balanceUsageRequest(next));
    setTicketBody(ticketCreateRequest(next));
  };

  const sendBalance = async (body) => {
    const result = await callBalanceUsage(body);
    setBalanceResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendTicket = async (body) => {
    const result = await callTicketCreate(body);
    setTicketResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshTickets();
  };

  // A 401 is a transport rejection, not a call outcome — the agent would never
  // reach the point of saying anything, so no readback is shown for one.
  const readbackFor = (result, render) =>
    result?.httpStatus === 200 ? render(result.body) : null;

  const status = {
    missing: { tone: "warn", label: "Key required" },
    unverified: { tone: "muted", label: "Not verified yet" },
    valid: { tone: "ok", label: "Key accepted" },
    rejected: { tone: "bad", label: "Key rejected" },
  }[keyState];

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>UC1 Demo Console</h1>
          <p className="app__subtitle">
            Mock telco APIs for the inbound-call demo — balance &amp; usage
            lookup, then a callback ticket. Every response is HTTP 200; the
            outcome is in <code>status</code>. Both endpoints require an{" "}
            <code>x-api-key</code> header.
          </p>
        </div>
      </header>

      <ApiKeyBar apiKey={apiKey} onChange={changeApiKey} status={status} />

      {keyState === "missing" && (
        <div className="alert alert--warn">
          Paste your team's <code>x-api-key</code> above to use the console. It
          is stored only in this browser.
        </div>
      )}
      {error && <div className="alert">{error}</div>}

      <NumberPicker active={msisdn} onPick={pickNumber} />

      <div className="grid">
        <EndpointPanel
          path="/account/balance_usage"
          description="Called once, right after the call lands."
          body={balanceBody}
          onBodyChange={setBalanceBody}
          onSend={sendBalance}
          result={balanceResult}
          readback={readbackFor(balanceResult, balanceReadback)}
        />

        <EndpointPanel
          path="/ticket/create"
          description="Called only when the caller reports an issue — or after a failed lookup."
          body={ticketBody}
          onBodyChange={setTicketBody}
          onSend={sendTicket}
          result={ticketResult}
          readback={readbackFor(ticketResult, ticketReadback)}
        />
      </div>

      <TicketList tickets={tickets} onRefresh={refreshTickets} />
    </div>
  );
}
