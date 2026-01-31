import { initEditor, setEditorOptions } from './editor.js';

export function createBufferManager({ container, onContentChange, onHistoryChange } = {}) {
  const buffers = new Map();
  let activeId = null;

  async function activateBuffer(id) {
    const buffer = buffers.get(id);
    if (!buffer) return null;

    activeId = id;

    await initEditor(container, buffer.content || '', (content) => {
      buffer.content = content;
      buffer.dirty = true;
      if (onContentChange) {
        onContentChange(content, buffer);
      }
    }, onHistoryChange);

    if (buffer.policy && typeof buffer.policy.readOnly === 'boolean') {
      setEditorOptions({ readOnly: buffer.policy.readOnly });
    } else {
      setEditorOptions({ readOnly: false });
    }

    return buffer;
  }

  async function openBuffer({ id, content = '', meta = {}, policy = {} }) {
    if (!id) {
      throw new Error('Buffer id is required');
    }

    if (!buffers.has(id)) {
      buffers.set(id, {
        id,
        content,
        meta,
        policy,
        dirty: false
      });
    }

    const buffer = buffers.get(id);
    buffer.content = content;
    buffer.meta = meta;
    buffer.policy = policy || {};

    await activateBuffer(id);
    return buffer;
  }

  function getActive() {
    if (!activeId) return null;
    return buffers.get(activeId) || null;
  }

  async function setActive(id) {
    if (!buffers.has(id)) return null;
    return activateBuffer(id);
  }

  function listBuffers() {
    return Array.from(buffers.values());
  }

  function getBuffer(id) {
    return buffers.get(id) || null;
  }

  function removeBuffer(id) {
    const wasActive = activeId === id;
    buffers.delete(id);
    if (wasActive) {
      activeId = null;
    }
    return wasActive;
  }

  function markClean(id) {
    const buffer = buffers.get(id);
    if (buffer) buffer.dirty = false;
  }

  function markDirty(id) {
    const buffer = buffers.get(id);
    if (buffer) buffer.dirty = true;
  }

  return {
    openBuffer,
    setActive,
    getActive,
    listBuffers,
    getBuffer,
    removeBuffer,
    markClean,
    markDirty
  };
}
