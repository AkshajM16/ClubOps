import { useQuery } from "@apollo/client/react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  Plus,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { OrganizationDocument, RequestsDocument } from "../graphql/generated";
import { useWorkspace } from "../components/Shell";
import {
  currency,
  Empty,
  ErrorBox,
  Loading,
  PageHeading,
  RequestTable,
} from "../components/ui";

export default function Dashboard() {
  const { organization, base } = useWorkspace();
  const { user } = useAuth();
  const { data, error, loading } = useQuery(OrganizationDocument, {
    variables: { organizationId: organization.id },
  });
  const recent = useQuery(RequestsDocument, {
    variables: { organizationId: organization.id, limit: 5 },
  });
  const budget = data?.organization.budget;
  // Floating point is used only for a visual progress percentage, never monetary arithmetic.
  const used =
    budget && Number(budget.total)
      ? (Number(budget.approved) / Number(budget.total)) * 100
      : 0;
  return (
    <>
      <PageHeading
        eyebrow="THE BIG PICTURE"
        title={`Good to see you, ${user?.name.split(" ")[0]}.`}
        description="A clear view of your budget. A little more room for your next idea."
        action={
          <Link to={`${base}/requests/new`} className="button primary">
            <Plus size={17} />
            New request
          </Link>
        }
      />
      <ErrorBox message={error?.message || recent.error?.message} />
      {loading && !budget ? (
        <Loading />
      ) : (
        budget && (
          <>
            <section className="budget-grid" aria-label="Budget summary">
              <div className="budget-hero">
                <div className="budget-hero-top">
                  <span>
                    <Wallet size={18} />
                    Available to spend
                  </span>
                  <span className="live-pill">Current balance</span>
                </div>
                <div className="hero-amount" data-testid="remaining-budget">
                  {currency(budget.remaining)}
                </div>
                <p>Room for what comes next.</p>
                <div className="budget-track">
                  <div style={{ width: `${Math.min(used, 100)}%` }} />
                </div>
                <div className="budget-hero-bottom">
                  <span>{used.toFixed(1)}% of budget used</span>
                  <span>{currency(budget.total)} allocated</span>
                </div>
              </div>
              <div className="stat-stack">
                <div className="stat-card">
                  <div className="stat-icon">
                    <CheckCheck size={20} />
                  </div>
                  <div>
                    <span>Approved spending</span>
                    <strong data-testid="approved-budget">
                      {currency(budget.approved)}
                    </strong>
                    <small>Committed to your organization's plans</small>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon amber">
                    <Clock3 size={20} />
                  </div>
                  <div>
                    <span>Pending requests</span>
                    <strong>{currency(budget.pending)}</strong>
                    <small>Awaiting a decision · not yet committed</small>
                  </div>
                </div>
              </div>
            </section>
            <div className="section-bar">
              <div>
                <h2>Recent requests</h2>
                <p>The latest activity from your organization.</p>
              </div>
              <Link to={`${base}/requests`} className="text-link">
                View all requests
                <ArrowRight size={16} />
              </Link>
            </div>
            <section className="panel">
              {recent.loading && !recent.data ? (
                <Loading />
              ) : recent.data?.requests.length ? (
                <RequestTable requests={recent.data.requests} base={base} />
              ) : (
                <Empty title="Your next idea starts here">
                  Create your organization's first spending request.
                </Empty>
              )}
            </section>
            <section className="policy-strip">
              <div className="policy-icon">
                <CheckCheck size={23} />
              </div>
              <div>
                <h3>A clear path to approval</h3>
                <p>
                  Under {currency(data!.organization.approvalThreshold)}? Your
                  treasurer can review it. At or above that amount, an admin
                  takes the lead.
                </p>
              </div>
              <Link to={`${base}/settings`} aria-label="View approval settings">
                <ArrowUpRight size={21} />
              </Link>
            </section>
          </>
        )
      )}
    </>
  );
}
