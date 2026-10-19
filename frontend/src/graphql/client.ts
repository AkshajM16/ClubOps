import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from "@apollo/client";

export function csrfToken() {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1] || ""
  );
}

export async function sessionAction(path: string, body?: object) {
  const response = await fetch(`/api/${path}/`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

const csrfLink = new ApolloLink((operation, forward) => {
  operation.setContext({ headers: { "X-CSRFToken": csrfToken() } });
  return forward(operation);
});
export const client = new ApolloClient({
  link: ApolloLink.from([
    csrfLink,
    new HttpLink({ uri: "/graphql/", credentials: "same-origin" }),
  ]),
  cache: new InMemoryCache(),
  defaultOptions: { watchQuery: { fetchPolicy: "cache-and-network" } },
});
