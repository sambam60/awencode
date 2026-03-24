export type LinearConnectedUser = {
  id: string;
  name: string;
  email?: string | null;
};

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  stateName?: string | null;
  stateType?: string | null;
  teamId?: string | null;
  teamName?: string | null;
};

export type LinearTeam = {
  id: string;
  name: string;
};

export type LinearWorkflowStateSummary = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  stateType?: string | null;
};

export function linearIssueMeta(issue: LinearIssue): string {
  return issue.stateName ? `${issue.identifier} · ${issue.stateName}` : issue.identifier;
}
