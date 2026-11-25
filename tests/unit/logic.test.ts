import { describe, it, expect } from "vitest";
import { computeStages, progressPercent, currentStage, canSubmit, isLate, effectiveDeadline, type StageLike, type SubmissionLike } from "../../src/lib/progress";
import { canViewProject, canReviewProject, canSubmitForProject } from "../../src/lib/access";
import { parseLocalInput, toLocalInput } from "../../src/lib/time";

const now = new Date("2026-11-25T12:00:00Z");
const day = 86_400_000;
const stage = (order: number, deadlineOffsetDays: number | null, extra: Partial<StageLike> = {}): StageLike => ({
  id: `s${order}`, order, name: `Stage ${order}`, isActive: true, requiresDocument: true,
  deadline: deadlineOffsetDays == null ? null : new Date(now.getTime() + deadlineOffsetDays * day), ...extra,
});
const sub = (stageId: string, version: number, status: SubmissionLike["status"]): SubmissionLike => ({ stageId, version, status, createdAt: now });

describe("computeStages", () => {
  const stages = [stage(1, -10), stage(2, -1), stage(3, 5), stage(4, 20)];

  it("unlocks stages in order and locks later ones", () => {
    const v = computeStages(stages, [], [], now);
    expect(v.map((x) => x.state)).toEqual(["OVERDUE", "LOCKED", "LOCKED", "LOCKED"]);
  });

  it("uses the latest version to decide the state", () => {
    const v = computeStages(stages, [sub("s1", 1, "CHANGES_REQUESTED"), sub("s1", 2, "APPROVED"), sub("s2", 1, "PENDING")], [], now);
    expect(v.map((x) => x.state)).toEqual(["APPROVED", "UNDER_REVIEW", "LOCKED", "LOCKED"]);
    expect(v[0].latestVersion).toBe(2);
  });

  it("shows changes requested when the deadline has not passed", () => {
    const v = computeStages(stages, [sub("s1", 1, "APPROVED"), sub("s2", 1, "APPROVED"), sub("s3", 1, "CHANGES_REQUESTED")], [], now);
    expect(v[2].state).toBe("CHANGES_REQUESTED");
    expect(v[3].state).toBe("LOCKED");
  });

  it("applies a team deadline extension", () => {
    const ext = [{ stageId: "s1", newDeadline: new Date(now.getTime() + 2 * day) }];
    const v = computeStages(stages, [], ext, now);
    expect(v[0].state).toBe("OPEN");
    expect(v[0].extended).toBe(true);
    expect(v[0].daysLeft).toBe(2);
    expect(effectiveDeadline(stages[0], ext).extended).toBe(true);
  });

  it("ignores inactive stages and sorts by order", () => {
    const v = computeStages([stage(2, 5), stage(1, 3, { isActive: false })], [], [], now);
    expect(v).toHaveLength(1);
    expect(v[0].stage.order).toBe(2);
    expect(v[0].state).toBe("OPEN");
  });

  it("computes progress and the current stage", () => {
    const v = computeStages(stages, [sub("s1", 1, "APPROVED"), sub("s2", 1, "APPROVED")], [], now);
    expect(progressPercent(v)).toBe(50);
    expect(currentStage(v)?.stage.id).toBe("s3");
    const all = computeStages(stages, stages.map((s) => sub(s.id, 1, "APPROVED")), [], now);
    expect(progressPercent(all)).toBe(100);
    expect(currentStage(all)).toBeNull();
  });
});

describe("canSubmit", () => {
  const stages = [stage(1, 5), stage(2, 10), stage(3, 15, { requiresDocument: false })];
  it("allows open, overdue, changes requested and rejected stages only", () => {
    const v = computeStages(stages, [], [], now);
    expect(canSubmit(v[0]).ok).toBe(true);
    expect(canSubmit(v[1]).ok).toBe(false); // locked
    const pending = computeStages(stages, [sub("s1", 1, "PENDING")], [], now);
    expect(canSubmit(pending[0]).ok).toBe(false);
    const rejected = computeStages(stages, [sub("s1", 1, "REJECTED")], [], now);
    expect(canSubmit(rejected[0]).ok).toBe(true);
    const approved = computeStages(stages, [sub("s1", 1, "APPROVED"), sub("s2", 1, "APPROVED")], [], now);
    expect(canSubmit(approved[0]).ok).toBe(false);
    expect(canSubmit(approved[2]).ok).toBe(false); // no-upload stage
  });
  it("flags late uploads", () => {
    expect(isLate(new Date(now.getTime() - 1), now)).toBe(true);
    expect(isLate(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isLate(null, now)).toBe(false);
  });
});

describe("access rules", () => {
  const project = { isDemo: false, guideId: "g1", memberIds: ["s1", "s2"] };
  const u = (id: string, role: "STUDENT" | "GUIDE" | "HOD", isDemo = false) => ({ id, role, isDemo });

  it("students see only their own project", () => {
    expect(canViewProject(u("s1", "STUDENT"), project)).toBe(true);
    expect(canViewProject(u("s9", "STUDENT"), project)).toBe(false);
    expect(canSubmitForProject(u("s1", "STUDENT"), project)).toBe(true);
    expect(canSubmitForProject(u("s9", "STUDENT"), project)).toBe(false);
    expect(canReviewProject(u("s1", "STUDENT"), project)).toBe(false);
  });
  it("guides see and review only allocated projects", () => {
    expect(canViewProject(u("g1", "GUIDE"), project)).toBe(true);
    expect(canReviewProject(u("g1", "GUIDE"), project)).toBe(true);
    expect(canViewProject(u("g2", "GUIDE"), project)).toBe(false);
    expect(canReviewProject(u("g2", "GUIDE"), project)).toBe(false);
    expect(canSubmitForProject(u("g1", "GUIDE"), project)).toBe(false);
  });
  it("HOD sees everything in the same data set, but demo and real never mix", () => {
    expect(canViewProject(u("h", "HOD"), project)).toBe(true);
    expect(canReviewProject(u("h", "HOD"), project)).toBe(true);
    expect(canViewProject(u("h", "HOD", true), project)).toBe(false);
    expect(canViewProject(u("s1", "STUDENT", true), project)).toBe(false);
  });
});

describe("department timezone", () => {
  it("interprets typed times in IST regardless of server timezone", () => {
    expect(parseLocalInput("2026-12-01T17:00", "Asia/Kolkata")?.toISOString()).toBe("2026-12-01T11:30:00.000Z");
    expect(parseLocalInput("2026-12-01", "Asia/Kolkata")?.toISOString()).toBe("2026-12-01T18:29:00.000Z"); // end of day
    expect(parseLocalInput("garbage")).toBeNull();
  });
  it("round-trips for datetime-local inputs", () => {
    const d = new Date("2026-12-01T11:30:00Z");
    expect(toLocalInput(d, "Asia/Kolkata")).toBe("2026-12-01T17:00");
    expect(parseLocalInput(toLocalInput(d, "Asia/Kolkata"), "Asia/Kolkata")?.getTime()).toBe(d.getTime());
    expect(toLocalInput(null)).toBe("");
  });
});
