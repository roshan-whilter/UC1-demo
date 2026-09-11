import { useCallback, useEffect, useState } from "react";
import ApiKeyBar from "./components/ApiKeyBar.jsx";
import EndpointPanel from "./components/EndpointPanel.jsx";
import NumberPicker from "./components/NumberPicker.jsx";
import TicketList from "./components/TicketList.jsx";
import SubscriberList from "./components/SubscriberList.jsx";
import RechargeLinkList from "./components/RechargeLinkList.jsx";
import {
  callBalanceUsage,
  callUsageHistory,
  callPlanDetails,
  callRechargeLink,
  callRechargeDetails,
  callTicketCreate,
  fetchTickets,
  fetchSubscribers,
  fetchRechargeLinks,
  UnauthorizedError,
} from "./api.js";
import { loadApiKey, saveApiKey } from "./apiKey.js";
import {
  balanceUsageRequest,
  usageHistoryRequest,
  planDetailsRequest,
  rechargeLinkRequest,
  rechargeDetailsRequest,
  ticketCreateRequest,
} from "./requests.js";
import {
  balanceReadback,
  usageReadback,
  planReadback,
  rechargeReadback,
  rechargeDetailsReadback,
  ticketReadback,
} from "./readback.js";

export default function App() {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [msisdn, setMsisdn] = useState("85510234567");
  const [balanceBody, setBalanceBody] = useState(() => balanceUsageRequest());
  const [usageBody, setUsageBody] = useState(() => usageHistoryRequest());
  const [planBody, setPlanBody] = useState(() => planDetailsRequest());
  const [rechargeBody, setRechargeBody] = useState(() => rechargeLinkRequest());
  const [rcdBody, setRcdBody] = useState(() => rechargeDetailsRequest());
  const [ticketBody, setTicketBody] = useState(() => ticketCreateRequest());
  const [balanceResult, setBalanceResult] = useState(null);
  const [usageResult, setUsageResult] = useState(null);
  const [planResult, setPlanResult] = useState(null);
  const [rechargeResult, setRechargeResult] = useState(null);
  const [rcdResult, setRcdResult] = useState(null);
  const [ticketResult, setTicketResult] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [rechargeLinks, setRechargeLinks] = useState([]);
  const [keyState, setKeyState] = useState(apiKey ? "unverified" : "missing");
  const [error, setError] = useState(null);

  // Loading the lists doubles as the key check — the first authenticated calls
  // the page makes.
  const refreshData = useCallback(async () => {
    if (!loadApiKey()) {
      setKeyState("missing");
      setTickets([]);
      setSubscribers([]);
      setRechargeLinks([]);
      return;
    }
    try {
      const [ticketList, subs, links] = await Promise.all([
        fetchTickets(),
        fetchSubscribers(),
        fetchRechargeLinks(),
      ]);
      setTickets(ticketList);
      setSubscribers(subs.subscribers ?? []);
      setRechargeLinks(links ?? []);
      setKeyState("valid");
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setKeyState("rejected");
        setTickets([]);
        setSubscribers([]);
        setRechargeLinks([]);
        setError("That key was rejected. Check it with whoever runs the API.");
      } else {
        setKeyState("unverified");
        setError("Can't reach the API — is the server running on port 4000?");
      }
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData, apiKey]);

  const changeApiKey = (next) => {
    saveApiKey(next);
    setApiKey(next);
    setKeyState(next ? "unverified" : "missing");
    setError(null);
  };

  // Picking a caller number rebuilds every body, so the calls stay about the
  // same subscriber the way they would in a real call.
  const pickNumber = (next) => {
    setMsisdn(next);
    setBalanceBody(balanceUsageRequest(next));
    setUsageBody(usageHistoryRequest(next));
    setPlanBody(planDetailsRequest(next));
    setRechargeBody(rechargeLinkRequest(next));
    setRcdBody(rechargeDetailsRequest(next));
    setTicketBody(ticketCreateRequest(next));
  };

  const sendBalance = async (body) => {
    const result = await callBalanceUsage(body);
    setBalanceResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendUsage = async (body) => {
    const result = await callUsageHistory(body);
    setUsageResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendPlan = async (body) => {
    const result = await callPlanDetails(body);
    setPlanResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendRecharge = async (body) => {
    const result = await callRechargeLink(body);
    setRechargeResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
  };

  const sendRechargeDetails = async (body) => {
    const result = await callRechargeDetails(body);
    setRcdResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendTicket = async (body) => {
    const result = await callTicketCreate(body);
    setTicketResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
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
            UC1 balance &amp; usage (A), usage-history &amp; CDR (B), plan &amp;
            services (C); UC2 recharge link (A), recharge details (B); plus the
            shared ticket. Every response is HTTP 200; the outcome is in{" "}
            <code>status</code>. All endpoints require an{" "}
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
          description="Branch A — called once, right after the call lands."
          body={balanceBody}
          onBodyChange={setBalanceBody}
          onSend={sendBalance}
          result={balanceResult}
          readback={readbackFor(balanceResult, balanceReadback)}
        />

        <EndpointPanel
          path="/account/usage_history"
          description="Branch B — when the caller says balance or data went missing."
          body={usageBody}
          onBodyChange={setUsageBody}
          onSend={sendUsage}
          result={usageResult}
          readback={readbackFor(usageResult, usageReadback)}
        />

        <EndpointPanel
          path="/account/plan_details"
          description="Branch C — when the caller asks about their plan or active services."
          body={planBody}
          onBodyChange={setPlanBody}
          onSend={sendPlan}
          result={planResult}
          readback={readbackFor(planResult, planReadback)}
        />

        <EndpointPanel
          path="/recharge/send_link"
          description="UC2 Branch A — text the caller a recharge deep-link."
          body={rechargeBody}
          onBodyChange={setRechargeBody}
          onSend={sendRecharge}
          result={rechargeResult}
          readback={readbackFor(rechargeResult, rechargeReadback)}
        />

        <EndpointPanel
          path="/recharge/details"
          description="UC2 Branch B — when the caller says a top-up never arrived."
          body={rcdBody}
          onBodyChange={setRcdBody}
          onSend={sendRechargeDetails}
          result={rcdResult}
          readback={readbackFor(rcdResult, rechargeDetailsReadback)}
        />

        <EndpointPanel
          path="/ticket/create"
          description="Shared — log the issue and read back the reference."
          body={ticketBody}
          onBodyChange={setTicketBody}
          onSend={sendTicket}
          result={ticketResult}
          readback={readbackFor(ticketResult, ticketReadback)}
        />
      </div>

      <SubscriberList subscribers={subscribers} onRefresh={refreshData} />
      <RechargeLinkList links={rechargeLinks} onRefresh={refreshData} />
      <TicketList tickets={tickets} onRefresh={refreshData} />
    </div>
  );
}
