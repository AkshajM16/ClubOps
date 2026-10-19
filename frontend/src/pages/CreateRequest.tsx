import { useMutation } from "@apollo/client/react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { client } from "../graphql/client";
import {
  CreateRequestDocument,
  type Category,
  type RequestType,
} from "../graphql/generated";
import { useWorkspace } from "../components/Shell";
import { currency, ErrorBox, label, PageHeading } from "../components/ui";

export default function CreateRequest() {
  const { organization, base, notify } = useWorkspace();
  const navigate = useNavigate();
  const [create, { loading }] = useMutation(CreateRequestDocument);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<Category>("EVENTS");
  const [requestType, setRequestType] = useState<RequestType>("PURCHASE");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const result = await create({
        variables: {
          input: {
            organizationId: organization.id,
            title: String(fields.get("title")),
            description: String(fields.get("description")),
            amount: String(fields.get("amount")),
            category,
            requestType,
          },
        },
      });
      await client.refetchQueries({ include: ["Organization", "Requests"] });
      notify("Request submitted. Your next idea is on its way.");
      navigate(`${base}/requests/${result.data!.createRequest.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to submit request.",
      );
    }
  }
  return (
    <>
      <Link to={`${base}/requests`} className="back-link">
        <ArrowLeft size={16} />
        All requests
      </Link>
      <PageHeading
        eyebrow="MAKE IT HAPPEN"
        title="New spending request"
        description="Tell your organization what you need and why it matters."
      />
      <div className="form-layout">
        <form className="panel request-form" onSubmit={submit}>
          <h2>The details</h2>
          <p className="muted">
            A little context helps your reviewer make a confident decision.
          </p>
          <ErrorBox message={error} />
          <label>
            Request title
            <input
              name="title"
              placeholder="e.g. Supplies for our next workshop"
              required
              maxLength={160}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              placeholder="What is this for? Include the details your reviewer should know."
              required
              maxLength={4000}
              rows={4}
            />
          </label>
          <div className="form-row">
            <div>
              <label htmlFor="request-amount">Amount (USD)</label>
              <div className="input-prefix">
                <span aria-hidden="true">$</span>
                <input
                  id="request-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="9999999999.99"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="request-category">Category</label>
              <select
                id="request-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {["EVENTS", "EQUIPMENT", "TRAVEL", "SUPPLIES", "OTHER"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
          <fieldset>
            <legend>Request type</legend>
            <div className="type-options">
              {(["PURCHASE", "REIMBURSEMENT"] as const).map((value) => (
                <label
                  className={requestType === value ? "selected" : ""}
                  key={value}
                >
                  <input
                    type="radio"
                    name="requestType"
                    value={value}
                    checked={requestType === value}
                    onChange={() => setRequestType(value)}
                  />
                  <span>
                    <strong>{label(value)}</strong>
                    <small>
                      {value === "PURCHASE"
                        ? "Approval before you spend"
                        : "For an expense already paid"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-actions">
            <Link to={`${base}/requests`} className="button secondary">
              Cancel
            </Link>
            <button className="button primary" disabled={loading}>
              {loading ? "Submitting…" : "Submit request"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <aside className="form-note">
          <ShieldCheck size={26} />
          <h3>What happens next?</h3>
          <p>
            Your request starts as pending. Your treasurer or admin reviews it,
            and the decision is recorded in its history.
          </p>
          <hr />
          <span className="eyebrow">CURRENT APPROVAL POLICY</span>
          <p>
            Below <strong>{currency(organization.approvalThreshold)}</strong>
            <br />
            Treasurer or admin review
          </p>
          <p>
            <strong>{currency(organization.approvalThreshold)}</strong> and
            above
            <br />
            Admin review
          </p>
          <small>
            The policy in effect at submission is saved with your request.
          </small>
        </aside>
      </div>
    </>
  );
}
