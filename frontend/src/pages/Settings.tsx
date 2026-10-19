import { useMutation, useQuery } from "@apollo/client/react";
import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  OrganizationDocument,
  UpdateThresholdDocument,
} from "../graphql/generated";
import { client } from "../graphql/client";
import { useWorkspace } from "../components/Shell";
import {
  currency,
  ErrorBox,
  label,
  Loading,
  PageHeading,
} from "../components/ui";

export default function Settings() {
  const { organization, notify } = useWorkspace();
  const { data, error, loading } = useQuery(OrganizationDocument, {
    variables: { organizationId: organization.id },
  });
  const [update, { loading: saving }] = useMutation(UpdateThresholdDocument);
  const [saveError, setSaveError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    const threshold = String(
      new FormData(event.currentTarget).get("threshold"),
    );
    try {
      await update({
        variables: { organizationId: organization.id, threshold },
      });
      await client.refetchQueries({ include: ["Organization", "Workspace"] });
      notify(
        "Approval policy updated. Existing requests keep their original approver.",
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Unable to save policy.",
      );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A SHARED WAY OF WORKING"
        title="Organization settings"
        description="Keep your approval policy clear and your team in the loop."
      />
      <ErrorBox message={error?.message} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <div className="settings-layout">
            <section className="panel settings-card">
              <div className="card-title">
                <ShieldCheck size={22} />
                <h2>Approval policy</h2>
              </div>
              <p>Set the amount that requires an admin's review.</p>
              <ErrorBox message={saveError} />
              <form onSubmit={submit}>
                <label>
                  Admin approval threshold (USD)
                  <input
                    key={data.organization.approvalThreshold}
                    name="threshold"
                    type="number"
                    min="0.01"
                    max="9999999999.99"
                    step="0.01"
                    required
                    defaultValue={data.organization.approvalThreshold}
                    disabled={organization.myRole !== "ADMIN"}
                  />
                </label>
                <div className="policy-explanation">
                  <p>
                    <span>
                      Below {currency(data.organization.approvalThreshold)}
                    </span>
                    <strong>Treasurer or admin</strong>
                  </p>
                  <p>
                    <span>
                      At or above{" "}
                      {currency(data.organization.approvalThreshold)}
                    </span>
                    <strong>Admin only</strong>
                  </p>
                </div>
                <p className="field-help">
                  Changes apply to new requests only. Existing requests keep the
                  approval role they were assigned.
                </p>
                {organization.myRole === "ADMIN" ? (
                  <button className="button primary" disabled={saving}>
                    {saving ? "Saving…" : "Save policy"}
                  </button>
                ) : (
                  <p className="readonly-note">
                    Only admins can change this policy.
                  </p>
                )}
              </form>
            </section>
            <section className="panel settings-card">
              <div className="section-bar compact">
                <h2>Your team</h2>
                <span className="count-tag">
                  {data.organization.members.length} members
                </span>
              </div>
              <p>Everyone has a part to play.</p>
              <div className="team-list">
                {data.organization.members.map((member) => (
                  <div className="team-member" key={member.user.id}>
                    <span className="avatar">
                      {member.user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>{member.user.name}</strong>
                      <span>@{member.user.username}</span>
                    </div>
                    <span className="role-tag">{label(member.role)}</span>
                  </div>
                ))}
              </div>
              <p className="field-help">
                Members submit requests. Treasurers review smaller requests.
                Admins can review all requests and manage the policy.
              </p>
            </section>
          </div>
        )
      )}
    </>
  );
}
