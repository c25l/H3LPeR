const path = require('path');

const DEFAULT_POLICY = {
  readOnly: false,
  allowCreate: true,
  allowRename: true,
  allowDelete: true,
  maxLength: null
};

function normalizePath(filePath = '') {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function hasHiddenSegment(filePath = '') {
  const normalized = normalizePath(filePath);
  return normalized.split('/').some(part => part.startsWith('.') && part.length > 0);
}

function matchesPrefix(filePath, prefixes = []) {
  if (!filePath) return false;
  const normalized = normalizePath(filePath);
  return prefixes.some(prefix => normalized.startsWith(normalizePath(prefix)));
}

function getPolicyForPath(config, filePath = '') {
  const restrictions = config?.restrictions || {};
  const normalized = normalizePath(filePath);
  const policy = { ...DEFAULT_POLICY };

  if (hasHiddenSegment(normalized)) {
    policy.readOnly = true;
  }

  if (matchesPrefix(normalized, restrictions.readOnlyPrefixes || [])) {
    policy.readOnly = true;
  }

  if (matchesPrefix(normalized, restrictions.noCreatePrefixes || [])) {
    policy.allowCreate = false;
  }

  if (matchesPrefix(normalized, restrictions.noRenamePrefixes || [])) {
    policy.allowRename = false;
  }

  if (matchesPrefix(normalized, restrictions.noDeletePrefixes || [])) {
    policy.allowDelete = false;
  }

  const maxLengthByPrefix = restrictions.maxLengthByPrefix || {};
  for (const [prefix, maxLength] of Object.entries(maxLengthByPrefix)) {
    if (normalized.startsWith(normalizePath(prefix))) {
      const limit = Number(maxLength);
      if (!Number.isNaN(limit)) {
        policy.maxLength = policy.maxLength == null ? limit : Math.min(policy.maxLength, limit);
      }
    }
  }

  if (policy.readOnly) {
    policy.allowCreate = false;
    policy.allowRename = false;
    policy.allowDelete = false;
  }

  return policy;
}

function validateOperation({
  config,
  operation,
  path: targetPath,
  to,
  content
} = {}) {
  if (!targetPath && operation !== 'rename') {
    return { ok: false, error: 'Path is required' };
  }

  if (operation === 'rename') {
    if (!targetPath || !to) {
      return { ok: false, error: 'from and to are required' };
    }

    const fromPolicy = getPolicyForPath(config, targetPath);
    const toPolicy = getPolicyForPath(config, to);

    if (fromPolicy.readOnly || fromPolicy.allowRename === false) {
      return { ok: false, error: 'Rename restricted by policy', policy: fromPolicy };
    }

    if (toPolicy.readOnly || toPolicy.allowCreate === false) {
      return { ok: false, error: 'Destination restricted by policy', policy: toPolicy };
    }

    return { ok: true, policy: fromPolicy };
  }

  const policy = getPolicyForPath(config, targetPath);

  if (policy.readOnly) {
    return { ok: false, error: 'Read-only path', policy };
  }

  if (operation === 'create' && policy.allowCreate === false) {
    return { ok: false, error: 'Create restricted by policy', policy };
  }

  if (operation === 'delete' && policy.allowDelete === false) {
    return { ok: false, error: 'Delete restricted by policy', policy };
  }

  if (operation === 'update' && typeof content === 'string' && policy.maxLength != null) {
    if (content.length > policy.maxLength) {
      return { ok: false, error: `Content exceeds limit of ${policy.maxLength} characters`, policy };
    }
  }

  if (operation === 'create' && typeof content === 'string' && policy.maxLength != null) {
    if (content.length > policy.maxLength) {
      return { ok: false, error: `Content exceeds limit of ${policy.maxLength} characters`, policy };
    }
  }

  return { ok: true, policy };
}

module.exports = {
  getPolicyForPath,
  validateOperation
};
