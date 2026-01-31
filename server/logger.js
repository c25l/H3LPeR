const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const level = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(lvl, context, message, data) {
  const prefix = `[${timestamp()}] [${lvl.toUpperCase()}]`;
  const ctx = context ? ` [${context}]` : '';
  const extra = data !== undefined ? ` ${JSON.stringify(data)}` : '';
  return `${prefix}${ctx} ${message}${extra}`;
}

const logger = {
  debug(context, message, data) {
    if (level <= LOG_LEVELS.debug) {
      console.debug(formatMessage('debug', context, message, data));
    }
  },

  info(context, message, data) {
    if (level <= LOG_LEVELS.info) {
      console.log(formatMessage('info', context, message, data));
    }
  },

  warn(context, message, data) {
    if (level <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', context, message, data));
    }
  },

  error(context, message, error) {
    if (level <= LOG_LEVELS.error) {
      const errData = error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
      console.error(formatMessage('error', context, message, errData));
    }
  }
};

module.exports = logger;
