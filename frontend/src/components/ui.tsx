import { ArrowUpRight, Inbox, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  RequestFieldsFragment,
  RequestStatus,
} from "../graphql/generated";

// Decimal strings remain strings throughout forms and transport; format cents with BigInt.
export function currency(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  return `$${BigInt(whole).toLocaleString("en-US")}.${cents}`;
}
export function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}
export function date(value: string, time = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {label(status)}
    </span>
  );
}
export function ErrorBox({ message }: { message?: string }) {
  return message ? (
    <div className="error-box" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading({
  message = "Loading your workspace…",
}: {
  message?: string;
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spin" />
      {message}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function RequestTable({
  requests,
  base,
  inbox = false,
}: {
  requests: RequestFieldsFragment[];
  base: string;
  inbox?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Submitted by</th>
            <th>Amount</th>
            <th>{inbox ? "Approver" : "Status"}</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>
                <Link
                  className="request-title"
                  to={`${base}/requests/${request.id}`}
                >
                  {request.title}
                </Link>
                <div className="table-secondary">
                  {label(request.category)} <span>·</span>{" "}
                  {label(request.requestType)}
                </div>
              </td>
              <td>
                <div className="person">
                  <span className="avatar small">
                    {request.submitter.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <div>
                    {request.submitter.name}
                    <div className="table-secondary">
                      {date(request.createdAt)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="amount">{currency(request.amount)}</td>
              <td>
                {inbox ? (
                  <span className="role-tag">
                    {label(request.requiredRole)}
                  </span>
                ) : (
                  <StatusBadge status={request.status} />
                )}
              </td>
              <td>
                <Link
                  className="row-link"
                  aria-label={`Review ${request.title}`}
                  to={`${base}/requests/${request.id}`}
                >
                  {inbox ? "Review" : <ArrowUpRight size={18} />}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Toast({
  message,
  close,
}: {
  message: string;
  close: () => void;
}) {
  return message ? (
    <div className="toast" role="status">
      {message}
      <button
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={close}
      >
        <X size={16} />
      </button>
    </div>
  ) : null;
}
