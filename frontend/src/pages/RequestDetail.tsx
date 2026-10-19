import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Check, Clock3, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApproveRequestDocument,
  CancelRequestDocument,
  RejectRequestDocument,
  RequestDocument,
} from "../graphql/generated";
import { client } from "../graphql/client";
import { useWorkspace } from "../components/Shell";
import {
  currency,
  date,
  ErrorBox,
  label,
  Loading,
  StatusBadge,
} from "../components/ui";

export default function RequestDetail() {
  const { requestId } = useParams();
  const { organization, base, notify } = useWorkspace();
  const { data, loading, error } = useQuery(RequestDocument, {
    variables: { requestId: Number(requestId) },
  });
  const [approve] = useMutation(ApproveRequestDocument);
  const [reject] = useMutation(RejectRequestDocument);
  const [cancel] = useMutation(CancelRequestDocument);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirm, setConfirm] = useState<"reject" | "cancel" | null>(null);
  const request = data?.request;
  async function act(action: "approve" | "reject" | "cancel") {
    setBusy(true);
    setActionError("");
    try {
      await { approve, reject, cancel }[action]({
        variables: { requestId: Number(requestId) },
      });
      await client.refetchQueries({
        include: ["Request", "Requests", "Organization"],
      });
      setConfirm(null);
      notify(
        action === "approve"
          ? "Request approved. The budget is up to date."
          : `Request ${action === "reject" ? "rejected" : "cancelled"}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to update request.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading && !request) return <Loading />;
  if (error) return <ErrorBox message={error.message} />;
  if (!request || request.organizationId !== organization.id)
    return <ErrorBox message="Request not found in this organization." />;
  return (
    <>
      <Link to={`${base}/requests`} className="back-link">
        <ArrowLeft size={16} />
        All requests
      </Link>
      <header className="detail-heading">
        <div className="eyebrow">
          REQUEST #{request.id.toString().padStart(4, "0")}
        </div>
        <div>
          <h1>{request.title}</h1>
          <StatusBadge status={request.status} />
        </div>
        <p>
          Submitted by {request.submitter.name} · {date(request.createdAt)}
        </p>
      </header>
      <div className="detail-layout">
        <div>
          <section className="panel detail-card">
            <div className="request-amount">
              <span>Requested amount</span>
              <strong>{currency(request.amount)}</strong>
            </div>
            <div className="detail-meta">
              <div>
                <span>Category</span>
                <strong>{label(request.category)}</strong>
              </div>
              <div>
                <span>Request type</span>
                <strong>{label(request.requestType)}</strong>
              </div>
              <div>
                <span>Required approver</span>
                <strong>{label(request.requiredRole)}</strong>
              </div>
            </div>
            <h3>About this request</h3>
            <p className="description">{request.description}</p>
          </section>
          <section className="panel decision-card">
            <h2>
              {request.status === "PENDING" ? "Next step" : "Decision recorded"}
            </h2>
            <p className="muted">
              {request.status === "PENDING"
                ? request.canReview
                  ? "Review the details above. Approval commits this amount to the organization budget."
                  : `This request is waiting for ${label(request.requiredRole).toLowerCase()} review.`
                : `This request is ${label(request.status).toLowerCase()}. Its history is preserved below.`}
            </p>
            <ErrorBox message={actionError} />
            {confirm ? (
              <div className="confirm-box">
                <p>
                  {confirm === "reject"
                    ? "Reject this request? This decision is final."
                    : "Cancel your request? You can submit a new one later."}
                </p>
                <div className="action-row">
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => void act(confirm)}
                  >
                    Confirm{" "}
                    {confirm === "reject" ? "rejection" : "cancellation"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Go back
                  </button>
                </div>
              </div>
            ) : (
              <div className="action-row">
                {request.canReview && (
                  <>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void act("approve")}
                    >
                      <Check size={17} />
                      {busy ? "Processing…" : "Approve request"}
                    </button>
                    <button
                      className="button secondary danger-text"
                      disabled={busy}
                      onClick={() => setConfirm("reject")}
                    >
                      <X size={17} />
                      Reject
                    </button>
                  </>
                )}
                {request.canCancel && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setConfirm("cancel")}
                  >
                    Cancel request
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
        <aside>
          <section className="panel history-card">
            <h2>
              <Clock3 size={19} />
              Request history
            </h2>
            <p className="muted">A clear record, every step of the way.</p>
            <ol className="timeline">
              {request.history.map((event) => (
                <li key={event.id}>
                  <span
                    className={`timeline-dot ${event.toStatus === "APPROVED" ? "approved" : ""}`}
                  />
                  <strong>
                    {event.toStatus === "PENDING"
                      ? "Request submitted"
                      : `Request ${label(event.toStatus).toLowerCase()}`}
                  </strong>
                  <span>{event.actor.name}</span>
                  <time dateTime={event.createdAt}>
                    {date(event.createdAt, true)}
                  </time>
                </li>
              ))}
            </ol>
          </section>
          <div className="detail-note">
            <ShieldCheck size={20} />
            <p>
              The required approver was set when this request was submitted.
              Later policy changes won't affect it.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
