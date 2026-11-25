// Pure functions for stage status, deadlines and progress. No database access, so they are unit-tested directly.

export type StageLike = {
  id: string;
  order: number;
  name: string;
  deadline: Date | null;
  isActive: boolean;
  requiresDocument: boolean;
};

export type SubmissionLike = {
  stageId: string;
  version: number;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  createdAt: Date;
};

export type ExtensionLike = { stageId: string; newDeadline: Date };

export type StageState =
  | "APPROVED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "OVERDUE"
  | "OPEN"
  | "LOCKED";

export type StageView<S extends StageLike = StageLike> = {
  stage: S;
  state: StageState;
  deadline: Date | null;
  extended: boolean;
  latestVersion: number;
  daysLeft: number | null;
};

const DAY = 86_400_000;

export function effectiveDeadline(stage: StageLike, extensions: ExtensionLike[]): { deadline: Date | null; extended: boolean } {
  const ext = extensions.find((e) => e.stageId === stage.id);
  if (ext) return { deadline: ext.newDeadline, extended: true };
  return { deadline: stage.deadline, extended: false };
}

/**
 * Stages unlock in order: a stage is open once every earlier active stage is approved.
 * The latest submission version decides the state of a stage.
 */
export function computeStages<S extends StageLike>(
  stages: S[],
  submissions: SubmissionLike[],
  extensions: ExtensionLike[],
  now: Date = new Date(),
): StageView<S>[] {
  const active = stages.filter((s) => s.isActive).sort((a, b) => a.order - b.order);
  let previousApproved = true;
  return active.map((stage) => {
    const subs = submissions.filter((s) => s.stageId === stage.id).sort((a, b) => b.version - a.version);
    const latest = subs[0];
    const { deadline, extended } = effectiveDeadline(stage, extensions);
    const daysLeft = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / DAY) : null;
    let state: StageState;
    if (latest?.status === "APPROVED") state = "APPROVED";
    else if (!previousApproved) state = "LOCKED";
    else if (latest?.status === "PENDING") state = "UNDER_REVIEW";
    else if (deadline && deadline.getTime() < now.getTime()) state = "OVERDUE";
    else if (latest?.status === "CHANGES_REQUESTED") state = "CHANGES_REQUESTED";
    else if (latest?.status === "REJECTED") state = "REJECTED";
    else state = "OPEN";
    previousApproved = previousApproved && state === "APPROVED";
    return { stage, state, deadline, extended, latestVersion: latest?.version ?? 0, daysLeft };
  });
}

export function progressPercent(views: { state: StageState }[]) {
  if (!views.length) return 0;
  return Math.round((views.filter((v) => v.state === "APPROVED").length / views.length) * 100);
}

/** The stage the team is working on now: the first one not yet approved. */
export function currentStage<S extends StageLike>(views: StageView<S>[]) {
  return views.find((v) => v.state !== "APPROVED") ?? null;
}

export function canSubmit(view: StageView): { ok: boolean; reason?: string } {
  if (!view.stage.requiresDocument) return { ok: false, reason: "This stage is completed by your guide; no upload is needed." };
  if (view.state === "LOCKED") return { ok: false, reason: "Complete the earlier stages first." };
  if (view.state === "APPROVED") return { ok: false, reason: "This stage is already approved." };
  if (view.state === "UNDER_REVIEW") return { ok: false, reason: "Your latest version is waiting for review." };
  return { ok: true };
}

export function isLate(deadline: Date | null, at: Date = new Date()) {
  return !!deadline && at.getTime() > deadline.getTime();
}

export const STATE_LABEL: Record<StageState, string> = {
  APPROVED: "Approved",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Rejected",
  OVERDUE: "Overdue",
  OPEN: "Open",
  LOCKED: "Locked",
};

export const DEFAULT_STAGES: { name: string; description: string; requiresDocument: boolean; maxMarks: number; offsetDays: number }[] = [
  { name: "Team Formation", description: "Form a team and register the project in ProjectTrack.", requiresDocument: false, maxMarks: 0, offsetDays: 14 },
  { name: "Guide Allocation", description: "HOD allocates a project guide; the guide confirms the team.", requiresDocument: false, maxMarks: 0, offsetDays: 21 },
  { name: "Title Proposal", description: "Submit up to three title options with a one-page problem statement.", requiresDocument: true, maxMarks: 5, offsetDays: 30 },
  { name: "Abstract Submission", description: "Abstract (250–300 words): problem, objectives, method, expected outcome.", requiresDocument: true, maxMarks: 5, offsetDays: 40 },
  { name: "Literature Survey", description: "Survey of at least 10 related papers or systems, with a comparison table.", requiresDocument: true, maxMarks: 10, offsetDays: 55 },
  { name: "Requirement Analysis (SRS)", description: "Software Requirements Specification: functional and non-functional requirements.", requiresDocument: true, maxMarks: 5, offsetDays: 70 },
  { name: "System Design", description: "Architecture, DFD/UML diagrams, database design and module breakdown.", requiresDocument: true, maxMarks: 10, offsetDays: 85 },
  { name: "Review 1 (Zeroth Review)", description: "Presentation of problem, survey and design to the review panel. Upload the slides.", requiresDocument: true, maxMarks: 10, offsetDays: 95 },
  { name: "Implementation – Phase 1", description: "At least 50% of modules implemented. Upload code archive and a progress note.", requiresDocument: true, maxMarks: 10, offsetDays: 130 },
  { name: "Review 2 (Mid Review)", description: "Demonstration of working modules to the review panel. Upload the slides.", requiresDocument: true, maxMarks: 10, offsetDays: 145 },
  { name: "Implementation – Phase 2 & Testing", description: "Complete implementation with test cases and results.", requiresDocument: true, maxMarks: 10, offsetDays: 180 },
  { name: "Project Report Draft", description: "Full draft of the project report in the department format.", requiresDocument: true, maxMarks: 5, offsetDays: 195 },
  { name: "Final Review & Viva", description: "Final demonstration and viva voce. Upload the final slides.", requiresDocument: true, maxMarks: 15, offsetDays: 210 },
  { name: "Final Submission", description: "Final report (PDF), source code and any publication/certificate.", requiresDocument: true, maxMarks: 5, offsetDays: 220 },
];
