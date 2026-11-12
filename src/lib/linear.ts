export interface LinearTicket {
  id: string; // identifier, e.g. WEB-2425
  title: string;
  url: string;
}

// LINEAR_API_KEY, injected at dev/build time by vite.config.ts. Without it the
// Linear integration is switched off. Tickets are fetched in the browser and
// only their identifier, title and URL are shared with the room.
declare const __LINEAR_API_KEY__: string;
export const LINEAR_API_KEY = __LINEAR_API_KEY__.trim();
export const LINEAR_ENABLED = LINEAR_API_KEY !== "";

const QUERY = `query($team: String!, $state: String!) {
  issues(first: 100, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
    nodes { identifier title url }
    pageInfo { hasNextPage }
  }
}`;

async function linearRequest(apiKey: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) {
    throw new Error(json?.errors?.[0]?.message ?? `Linear returned ${res.status}`);
  }
  return json.data;
}

/** `truncated` is true when the status holds more tickets than the 100 fetched. */
export async function fetchLinearTickets(
  apiKey: string,
  team: string,
  state: string,
): Promise<{ tickets: LinearTicket[]; truncated: boolean }> {
  const data = await linearRequest(apiKey, QUERY, { team, state });
  const tickets = data.issues.nodes.map((n: { identifier: string; title: string; url: string }) => ({
    id: n.identifier,
    title: n.title,
    url: n.url,
  }));
  return { tickets, truncated: !!data.issues.pageInfo?.hasNextPage };
}

const UPDATE_ESTIMATE = `mutation($id: String!, $estimate: Int!) {
  issueUpdate(id: $id, input: { estimate: $estimate }) { success }
}`;

/** Sets the points on a Linear issue. No-op when the Linear integration is off. */
export async function updateLinearEstimate(identifier: string, estimate: number) {
  if (LINEAR_ENABLED) await linearRequest(LINEAR_API_KEY, UPDATE_ESTIMATE, { id: identifier, estimate });
}

export interface LinearTeam {
  key: string;
  name: string;
  states: string[];
}

const TEAMS_QUERY = `query {
  teams(first: 100) {
    nodes { key name states { nodes { name position } } }
  }
}`;

/** Every team the key can see, each with its workflow states in board order. */
export async function fetchLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const data = await linearRequest(apiKey, TEAMS_QUERY, {});
  type Node = { key: string; name: string; states: { nodes: { name: string; position: number }[] } };
  return data.teams.nodes.map((t: Node) => ({
    key: t.key,
    name: t.name,
    states: t.states.nodes.sort((a, b) => a.position - b.position).map((s) => s.name),
  }));
}
