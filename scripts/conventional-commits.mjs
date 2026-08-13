export const COMMIT_TYPES = [
  ["feat", "New feature / 新功能"],
  ["fix", "Bug fix / 问题修复"],
  ["perf", "Performance / 性能优化"],
  ["refactor", "Refactor / 重构"],
  ["docs", "Documentation / 文档"],
  ["test", "Tests / 测试"],
  ["build", "Build system / 构建"],
  ["ci", "CI workflow / 持续集成"],
  ["chore", "Maintenance / 维护"],
];

const allowedTypes = COMMIT_TYPES.map(([type]) => type).join("|");
const conventionalPattern = new RegExp(`^(${allowedTypes}|revert)(?:\\(([a-z0-9._/-]+)\\))?(!)?: (\\S.*)$`);

export function parseCommitSubject(subject) {
  const match = conventionalPattern.exec(subject.trim());
  if (!match) return null;
  return { type: match[1], scope: match[2] ?? null, breaking: Boolean(match[3]), description: match[4] };
}

export function validateCommitMessage(message) {
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  if (/^(Merge |Revert ")/.test(firstLine)) return { valid: true, subject: firstLine };
  const parsed = parseCommitSubject(firstLine);
  if (!parsed) {
    return {
      valid: false,
      subject: firstLine,
      error: "Use: type(optional-scope): short description — allowed types: feat, fix, perf, refactor, docs, test, build, ci, chore, revert",
    };
  }
  if (firstLine.length > 100) return { valid: false, subject: firstLine, error: "Commit subject must be 100 characters or fewer." };
  if (/\.$/.test(parsed.description)) return { valid: false, subject: firstLine, error: "Do not end the commit subject with a period." };
  return { valid: true, subject: firstLine, parsed };
}

export function releaseCategory(type) {
  if (type === "feat") return "feat";
  if (type === "fix") return "fix";
  if (type === "perf") return "perf";
  return "other";
}
