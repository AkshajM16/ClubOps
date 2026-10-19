import { useQuery } from "@apollo/client/react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { RequestsDocument, type RequestStatus } from "../graphql/generated";
import { useWorkspace } from "../components/Shell";
import {
  Empty,
  ErrorBox,
  label,
  Loading,
  PageHeading,
  RequestTable,
} from "../components/ui";

export default function Requests({ inbox = false }: { inbox?: boolean }) {
  const { organization, base } = useWorkspace();
  const [status, setStatus] = useState<RequestStatus | undefined>();
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = useQuery(RequestsDocument, {
    variables: {
      organizationId: organization.id,
      status,
      inboxOnly: inbox,
      limit: 20,
      offset,
    },
  });
  return (
    <>
      <PageHeading
        eyebrow={
          inbox ? "KEEP GOOD IDEAS MOVING" : "EVERY IDEA STARTS SOMEWHERE"
        }
        title={inbox ? "Approval inbox" : "Spending requests"}
        description={
          inbox
            ? "Pending requests that match your approval permissions. Take a look, then make the call."
            : "From first idea to final decision. Follow every request in one place."
        }
        action={
          !inbox && (
            <Link to={`${base}/requests/new`} className="button primary">
              <Plus size={17} />
              New request
            </Link>
          )
        }
      />
      {inbox && (
        <div className="info-strip">
          <span className="status-dot" />
          You are reviewing as {label(organization.myRole).toLowerCase()}.
          Approval roles are set when each request is submitted.
        </div>
      )}
      <section className="panel">
        <div className="filter-bar">
          {!inbox ? (
            <div className="tabs" aria-label="Filter by status">
              {[undefined, "PENDING", "APPROVED", "REJECTED", "CANCELLED"].map(
                (value) => (
                  <button
                    key={value || "all"}
                    aria-pressed={status === value}
                    className={status === value ? "active" : ""}
                    onClick={() => {
                      setStatus(value as RequestStatus | undefined);
                      setOffset(0);
                    }}
                  >
                    {value ? label(value) : "All requests"}
                  </button>
                ),
              )}
            </div>
          ) : (
            <h2>Ready for your review</h2>
          )}
          <SlidersHorizontal size={16} className="filter-icon" />
        </div>
        <ErrorBox message={error?.message} />
        {loading && !data ? (
          <Loading />
        ) : data?.requests.length ? (
          <RequestTable requests={data.requests} base={base} inbox={inbox} />
        ) : (
          <Empty
            title={inbox ? "You're all caught up" : "No requests here yet"}
          >
            {inbox
              ? "New requests needing your review will appear here."
              : "Try another status or create a new request."}
          </Empty>
        )}
        <div className="pagination">
          <span>
            {data?.requests.length
              ? `Showing ${offset + 1}–${offset + data.requests.length}`
              : "0 requests"}
          </span>
          <div>
            <button
              disabled={!offset || loading}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </button>
            <button
              disabled={loading || (data?.requests.length ?? 0) < 20}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
