// Audit helpers — build module results, collect findings

export function buildModule(name) {
  return {
    name,
    checks: [],
    issues: [],
    pass_count: 0,
    total_count: 0,
    score: 0,
    add(check) {
      this.checks.push(check);
      this.total_count++;
      if (check.pass) {
        this.pass_count++;
      } else {
        this.issues.push({
          code: check.code,
          severity: check.severity || 'major',
          message: check.message,
          detail: check.detail ?? null,
        });
      }
    },
    finalize() {
      this.score = this.total_count === 0 ? 0 : Math.round((this.pass_count / this.total_count) * 100);
      return this;
    },
  };
}

export function pass(code, message, detail) {
  return { code, pass: true, severity: 'info', message, detail };
}

export function fail(code, message, { severity = 'major', detail } = {}) {
  return { code, pass: false, severity, message, detail };
}

export async function safe(fn, fallback = null) {
  try {
    return await fn();
  } catch (e) {
    return { __error: e.message, fallback };
  }
}
