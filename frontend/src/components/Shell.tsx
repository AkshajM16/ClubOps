import { useQuery } from "@apollo/client/react";
import {
  ArrowUpRight,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Plus,
  ReceiptText,
  Settings2,
  Sprout,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { WorkspaceDocument, type WorkspaceQuery } from "../graphql/generated";
import { useAuth } from "../hooks/useAuth";
import { ErrorBox, Loading, Toast, label } from "./ui";

type Organization = WorkspaceQuery["organizations"][number];
type WorkspaceContext = {
  organization: Organization;
  base: string;
  notify: (message: string) => void;
};
export const useWorkspace = () => useOutletContext<WorkspaceContext>();

export function WorkspaceRedirect() {
  const { data, loading, error } = useQuery(WorkspaceDocument);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error.message} />;
  return data?.organizations.length ? (
    <Navigate to={`/org/${data.organizations[0].id}/dashboard`} replace />
  ) : (
    <div className="standalone">
      No organizations are assigned to this account.
    </div>
  );
}

export default function Shell() {
  const { organizationId } = useParams();
  const { data, loading, error } = useQuery(WorkspaceDocument);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState("");
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error.message} />;
  const organization = data?.organizations.find(
    (org) => org.id === Number(organizationId),
  );
  if (!organization) return <Navigate to="/" replace />;
  const base = `/org/${organization.id}`;
  const navigation = [
    { name: "Overview", path: "dashboard", icon: LayoutDashboard },
    { name: "Spending requests", path: "requests", icon: ReceiptText },
    ...(organization.myRole !== "MEMBER"
      ? [{ name: "Approval inbox", path: "approvals", icon: CheckCheck }]
      : []),
    { name: "Organization settings", path: "settings", icon: Settings2 },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to={base + "/dashboard"} className="brand">
          <span className="brand-mark">
            <Sprout size={23} strokeWidth={2.4} />
          </span>
          ClubOps<span className="brand-dot">.</span>
        </Link>
        <div className="org-switch">
          <label htmlFor="organization">WORKSPACE</label>
          <div className="select-wrap">
            <select
              id="organization"
              value={organization.id}
              onChange={(event) =>
                navigate(`/org/${event.target.value}/dashboard`)
              }
            >
              {data?.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
          <span className="workspace-caption">Student organization</span>
        </div>
        <div className="nav-label">MANAGE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, path, icon: Icon }) => (
            <NavLink key={path} to={`${base}/${path}`}>
              <Icon size={18} />
              <span>{name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <CircleHelp size={18} />
            <strong>A little clarity goes a long way.</strong>
            <p>Every request. Every approval. All in one place.</p>
            <Link to={`${base}/settings`}>
              View your approval policy <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="profile">
            <span className="avatar">
              {user?.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <div>
              <strong>{user?.name}</strong>
              <span>{label(organization.myRole)}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => {
                void signOut().catch((err) => setLogoutError(err.message));
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <div className="topbar">
          <span>
            {organization.name}
            <span className="topbar-slash">/</span>
            <span className="topbar-muted">Workspace</span>
          </span>
          <div className="topbar-actions">
            <Link to={`${base}/requests/new`} className="topbar-create">
              <Plus size={16} /> Create request
            </Link>
            <button
              className="icon-button mobile-logout"
              aria-label="Sign out"
              onClick={() => {
                void signOut().catch((err) => setLogoutError(err.message));
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <main>
          <ErrorBox message={logoutError} />
          <Outlet
            key={organization.id}
            context={
              {
                organization,
                base,
                notify: setToast,
              } satisfies WorkspaceContext
            }
          />
        </main>
        <footer>
          Built for the people who make campus happen.
          <span>ClubOps · Spend with confidence</span>
        </footer>
      </div>
      <Toast message={toast} close={() => setToast("")} />
    </div>
  );
}
