import { useCallback, useEffect, useState } from "react";
import ApiKeyBar from "./components/ApiKeyBar.jsx";
import EndpointPanel from "./components/EndpointPanel.jsx";
import NumberPicker from "./components/NumberPicker.jsx";
import TicketList from "./components/TicketList.jsx";
import SubscriberList from "./components/SubscriberList.jsx";
import RechargeLinkList from "./components/RechargeLinkList.jsx";
import PlanMessageList from "./components/PlanMessageList.jsx";
import PlanChangeLinkList from "./components/PlanChangeLinkList.jsx";
import NotificationList from "./components/NotificationList.jsx";
import TroubleshootingLinkList from "./components/TroubleshootingLinkList.jsx";
import {
  callBalanceUsage,
  callUsageHistory,
  callPlanDetails,
  callRechargeLink,
  callRechargeDetails,
  callPlanSendDetails,
  callPlanRecommendations,
  callPlanSendChangeLink,
  callNotificationSend,
  callServiceDeactivationLink,
  callSimStatus,
  callIncidentStatus,
  callComplaintHistory,
  callTroubleshootingLink,
  callTicketCreate,
  fetchTickets,
  fetchSubscribers,
  fetchRechargeLinks,
  fetchPlanMessages,
  fetchPlanChangeLinks,
  fetchNotifications,
  fetchTroubleshootingLinks,
  UnauthorizedError,
} from "./api.js";
import { loadApiKey, saveApiKey } from "./apiKey.js";
import {
  balanceUsageRequest,
  usageHistoryRequest,
  planDetailsRequest,
  rechargeLinkRequest,
  rechargeDetailsRequest,
  planSendDetailsRequest,
  planRecommendationsRequest,
  planSendChangeLinkRequest,
  notificationSendRequest,
  serviceDeactivationLinkRequest,
  simStatusRequest,
  incidentStatusRequest,
  complaintHistoryRequest,
  troubleshootingLinkRequest,
  ticketCreateRequest,
} from "./requests.js";
import {
  balanceReadback,
  usageReadback,
  planReadback,
  rechargeReadback,
  rechargeDetailsReadback,
  planSendReadback,
  planRecommendationsReadback,
  planChangeReadback,
  notificationReadback,
  serviceDeactivationReadback,
  simStatusReadback,
  incidentStatusReadback,
  complaintHistoryReadback,
  troubleshootingLinkReadback,
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
  const [planSmsBody, setPlanSmsBody] = useState(() => planSendDetailsRequest());
  const [recBody, setRecBody] = useState(() => planRecommendationsRequest());
  const [pchBody, setPchBody] = useState(() => planSendChangeLinkRequest());
  const [notifBody, setNotifBody] = useState(() => notificationSendRequest());
  const [deactivationBody, setDeactivationBody] = useState(() => serviceDeactivationLinkRequest());
  const [simBody, setSimBody] = useState(() => simStatusRequest());
  const [incidentBody, setIncidentBody] = useState(() => incidentStatusRequest());
  const [complaintBody, setComplaintBody] = useState(() => complaintHistoryRequest());
  const [troubleshootingBody, setTroubleshootingBody] = useState(() => troubleshootingLinkRequest());
  const [ticketBody, setTicketBody] = useState(() => ticketCreateRequest());
  const [balanceResult, setBalanceResult] = useState(null);
  const [usageResult, setUsageResult] = useState(null);
  const [planResult, setPlanResult] = useState(null);
  const [rechargeResult, setRechargeResult] = useState(null);
  const [rcdResult, setRcdResult] = useState(null);
  const [planSmsResult, setPlanSmsResult] = useState(null);
  const [recResult, setRecResult] = useState(null);
  const [pchResult, setPchResult] = useState(null);
  const [notifResult, setNotifResult] = useState(null);
  const [deactivationResult, setDeactivationResult] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [incidentResult, setIncidentResult] = useState(null);
  const [complaintResult, setComplaintResult] = useState(null);
  const [troubleshootingResult, setTroubleshootingResult] = useState(null);
  const [ticketResult, setTicketResult] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [rechargeLinks, setRechargeLinks] = useState([]);
  const [planMessages, setPlanMessages] = useState([]);
  const [planChangeLinks, setPlanChangeLinks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [troubleshootingLinks, setTroubleshootingLinks] = useState([]);
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
      setPlanMessages([]);
      setPlanChangeLinks([]);
      setNotifications([]);
      setTroubleshootingLinks([]);
      return;
    }
    try {
      const [ticketList, subs, links, planSms, pchLinks, notifs, troubleshooting] = await Promise.all([
        fetchTickets(),
        fetchSubscribers(),
        fetchRechargeLinks(),
        fetchPlanMessages(),
        fetchPlanChangeLinks(),
        fetchNotifications(),
        fetchTroubleshootingLinks(),
      ]);
      setTickets(ticketList);
      setSubscribers(subs.subscribers ?? []);
      setRechargeLinks(links ?? []);
      setPlanMessages(planSms ?? []);
      setPlanChangeLinks(pchLinks ?? []);
      setNotifications(notifs ?? []);
      setTroubleshootingLinks(troubleshooting ?? []);
      setKeyState("valid");
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setKeyState("rejected");
        setTickets([]);
        setSubscribers([]);
        setRechargeLinks([]);
        setPlanMessages([]);
        setPlanChangeLinks([]);
        setNotifications([]);
        setTroubleshootingLinks([]);
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
    setPlanSmsBody(planSendDetailsRequest(next));
    setRecBody(planRecommendationsRequest(next));
    setPchBody(planSendChangeLinkRequest(next));
    setNotifBody(notificationSendRequest(next));
    setDeactivationBody(serviceDeactivationLinkRequest(next));
    setSimBody(simStatusRequest(next));
    setIncidentBody(incidentStatusRequest(next));
    setComplaintBody(complaintHistoryRequest(next));
    setTroubleshootingBody(troubleshootingLinkRequest(next));
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

  // An action endpoint, so a success changes server state the console shows.
  const sendPlanSms = async (body) => {
    const result = await callPlanSendDetails(body);
    setPlanSmsResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
  };

  const sendRecommendations = async (body) => {
    const result = await callPlanRecommendations(body);
    setRecResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  // An action endpoint, so a success changes server state the console shows.
  const sendPlanChangeLink = async (body) => {
    const result = await callPlanSendChangeLink(body);
    setPchResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
  };

  // The project's first non-SMS channel — same action-endpoint pattern.
  const sendNotification = async (body) => {
    const result = await callNotificationSend(body);
    setNotifResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
  };

  const sendServiceDeactivation = async (body) => {
    const result = await callServiceDeactivationLink(body);
    setDeactivationResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
  };

  const sendSimStatus = async (body) => {
    const result = await callSimStatus(body);
    setSimResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendIncidentStatus = async (body) => {
    const result = await callIncidentStatus(body);
    setIncidentResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendComplaintHistory = async (body) => {
    const result = await callComplaintHistory(body);
    setComplaintResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
  };

  const sendTroubleshootingLink = async (body) => {
    const result = await callTroubleshootingLink(body);
    setTroubleshootingResult(result);
    if (result.httpStatus === 401) setKeyState("rejected");
    else await refreshData();
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
          <h1>UC Demo Console</h1>
          <p className="app__subtitle">
            Mock telco APIs for the inbound-call demo — UC1 balance &amp;
            usage (A), usage-history &amp; CDR (B), plan &amp; services (C);
            UC2 recharge link (A), recharge details (B); UC3 plan details with
            history and the plan-details SMS (A), plan recommendations, the
            plan-change link and the Smart App notification (B); UC4 service
            deactivation and SIM status; UC5 outage and complaint status; plus
            the shared ticket. Every response is HTTP 200; the outcome is in{" "}
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
          description="UC1 Branch C + UC3 Branch A — current plan, add-ons, and the last 2 plans held."
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
          description="UC2 Branch B (and reused by UC2-C, UC3-B) — when the caller says a charge never arrived."
          body={rcdBody}
          onBodyChange={setRcdBody}
          onSend={sendRechargeDetails}
          result={rcdResult}
          readback={readbackFor(rcdResult, rechargeDetailsReadback)}
        />

        <EndpointPanel
          path="/plan/send_details"
          description="UC3 Branch A — text the caller their plan details. Add a planId to send a previous plan."
          body={planSmsBody}
          onBodyChange={setPlanSmsBody}
          onSend={sendPlanSms}
          result={planSmsResult}
          readback={readbackFor(planSmsResult, planSendReadback)}
        />

        <EndpointPanel
          path="/plan/recommendations"
          description="UC3 Branch B — suggest a plan; the rest of the catalog rides along for 'give me a different one'."
          body={recBody}
          onBodyChange={setRecBody}
          onSend={sendRecommendations}
          result={recResult}
          readback={readbackFor(recResult, planRecommendationsReadback)}
        />

        <EndpointPanel
          path="/plan/send_change_link"
          description="UC3 Branch B — text a deep-link to switch plans. planId is required."
          body={pchBody}
          onBodyChange={setPchBody}
          onSend={sendPlanChangeLink}
          result={pchResult}
          readback={readbackFor(pchResult, planChangeReadback)}
        />

        <EndpointPanel
          path="/notification/send"
          description="UC3 Branch B — the Smart App push. First non-SMS channel in the project."
          body={notifBody}
          onBodyChange={setNotifBody}
          onSend={sendNotification}
          result={notifResult}
          readback={readbackFor(notifResult, notificationReadback)}
        />

        <EndpointPanel
          path="/service/send_deactivation_link"
          description="UC4 Branch 2 — text a deep-link and USSD code to deactivate an active service."
          body={deactivationBody}
          onBodyChange={setDeactivationBody}
          onSend={sendServiceDeactivation}
          result={deactivationResult}
          readback={readbackFor(deactivationResult, serviceDeactivationReadback)}
        />

        <EndpointPanel
          path="/sim/status"
          description="UC4 Branch 3 — check the number's current validity state and expiry."
          body={simBody}
          onBodyChange={setSimBody}
          onSend={sendSimStatus}
          result={simResult}
          readback={readbackFor(simResult, simStatusReadback)}
        />

        <EndpointPanel
          path="/incident/my_status"
          description="UC5 Branch 1 — check the customer's individual known-outage status and ETA."
          body={incidentBody}
          onBodyChange={setIncidentBody}
          onSend={sendIncidentStatus}
          result={incidentResult}
          readback={readbackFor(incidentResult, incidentStatusReadback)}
        />

        <EndpointPanel
          path="/complaint/history"
          description="UC5 Branch 3 — retrieve open complaint and enquiry status from CSM."
          body={complaintBody}
          onBodyChange={setComplaintBody}
          onSend={sendComplaintHistory}
          result={complaintResult}
          readback={readbackFor(complaintResult, complaintHistoryReadback)}
        />

        <EndpointPanel
          path="/outage/send_troubleshooting_link"
          description="UC5 Branch 2 — text a troubleshooting deep-link and steps for the selected issue."
          body={troubleshootingBody}
          onBodyChange={setTroubleshootingBody}
          onSend={sendTroubleshootingLink}
          result={troubleshootingResult}
          readback={readbackFor(troubleshootingResult, troubleshootingLinkReadback)}
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
      <PlanMessageList messages={planMessages} onRefresh={refreshData} />
      <PlanChangeLinkList links={planChangeLinks} onRefresh={refreshData} />
      <NotificationList notifications={notifications} onRefresh={refreshData} />
      <TroubleshootingLinkList links={troubleshootingLinks} onRefresh={refreshData} />
      <TicketList tickets={tickets} onRefresh={refreshData} />
    </div>
  );
}
