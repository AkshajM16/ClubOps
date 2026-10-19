import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { client, sessionAction } from "../graphql/client";
import type { WorkspaceQuery } from "../graphql/generated";

type UserNode = NonNullable<WorkspaceQuery["me"]>;

type Auth = {
  user: UserNode | null;
  loading: boolean;
  error: string;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/session/", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not connect to ClubOps.");
        return response.json();
      })
      .then((data) => setUser(data.user))
      .catch(() =>
        setError(
          "Could not connect to ClubOps. Check that the server is running, then refresh.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  async function signIn(username: string, password: string) {
    const data = await sessionAction("login", { username, password });
    await client.clearStore();
    setUser(data.user);
  }
  async function signOut() {
    await sessionAction("logout");
    setUser(null);
    await client.clearStore();
  }
  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is missing");
  return context;
}
