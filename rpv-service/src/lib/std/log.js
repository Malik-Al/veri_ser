/* eslint-disable */
const moment = require('moment');
const uuidBase62 = require('uuid-base62');
const SimpleNodeLogger = require('simple-node-logger');

const fluent = require('fluent-logger');
const conf = require('./conf.js');

exports.flog = null;
exports.slog = null;

exports.errorsToSend = [];
exports.currStats = [];
const currRefs = {};

exports.init = async function () {
  return new Promise((resolve, reject) => {
    try {
      console.log('Инициализация подсистемы логирования...');

      const logOpts = {
        logDirectory: conf.main.logsPath,
        fileNamePattern: '<DATE>.log',
        dateFormat: 'YYYY.MM.DD',
      };

      exports.flog = SimpleNodeLogger.createRollingFileLogger(logOpts);
      exports.flog.setLevel('trace');

      const statOpts = {
        logDirectory: conf.main.logsPath,
        fileNamePattern: 'stat-<DATE>.log',
        dateFormat: 'YYYY-MM-DD',
      };

      exports.slog = SimpleNodeLogger.createRollingFileLogger(statOpts);
      exports.slog.setLevel('trace');

      if (
        typeof conf.log.logMode !== 'undefined' &&
        conf.log.logMode === 'file'
      ) {
        conf.log.logMode = 'file';
        console.log(`Включен режим логирования в файлы. Уровень логирования: ${conf.log.logLevel}. Путь: ${conf.main.logsPath}`);
      }

      if (
        typeof conf.log.logMode !== 'undefined' &&
        conf.log.logMode === 'fluent'
      ) {
        conf.log.logMode = 'fluent';

        fluent.configure(conf.main.serviceName, {
          host: conf.log.fluentdHost,
          port: conf.log.fluentdPort,
          timeout: 3.0,
          reconnectInterval: 300000, // 5 minutes
        });

        console.log(`Включен режим логирования во fluentd. Сервер: ${conf.log.fluentdHost}:${conf.log.fluentdPort}`);
      }

      if (conf.log.logMode === 'console' || conf.log.logMode === 'console') {
        console.log(`Включен режим логирования в консоль. Уровень логирования: ${conf.log.logLevel}`);
      }

      setInterval(statsClean, 60 * 1000);

      exports.debug('Инициализация подсистемы логирования завершена успешно');
      exports.ready = true;
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

function removeLogEscaping(rec) {
  const retRec = rec;
  if (retRec.error)
    retRec.error = removeStrEscaping(
      removeStrEscaping(removeStrEscaping(rec.error))
    );
  if (retRec.warn)
    retRec.warn = removeStrEscaping(
      removeStrEscaping(removeStrEscaping(rec.warn))
    );
  if (retRec.info)
    retRec.info = removeStrEscaping(
      removeStrEscaping(removeStrEscaping(rec.info))
    );
  if (retRec.debug)
    retRec.debug = removeStrEscaping(
      removeStrEscaping(removeStrEscaping(rec.debug))
    );
  if (retRec.trace)
    retRec.trace = removeStrEscaping(
      removeStrEscaping(removeStrEscaping(rec.trace))
    );

  return retRec;
}

function removeStrEscaping(str) {
  let ret = str;
  if (typeof ret === 'object') ret = JSON.stringify(ret);
  if (ret) {
    try {
      ret = ret.replace(`\"`, `"`);
      ret = ret.replace(`\\n`, `\n`);
      ret = ret.replace(`\\\\`, `\\`);
      ret = ret.replace(`\/`, `/`);
    } catch (err) {
      console.log(
        `Ошибка при обработке строки логирования. \nОшибка: ${err}\nСтрока: ${JSON.stringify(
          str
        )}`
      );
    }
  }
  return ret;
}

exports.rec = async function (errRec) {
  // Если запись является сообщением об ошибке, то создаем дополнительные поля
  let errObject = null;
  const logDate = moment();

  if (conf.main.instanceName) {
    errRec.instance = conf.main.instanceName;
  }

  if (conf.main.serviceName) {
    errRec.serviceName = conf.main.serviceName;
  }

  if (errRec.error || errRec.sysErr) {
    // if (!errRec.code) errRec.code = 'E_ServerError';
    if (!errRec.code && errRec.sysErr && errRec.sysErr.code)
      errRec.code = errRec.sysErr.code;
    errObject = new exports.ApiErr(errRec.code);
    errRec.stack = errObject.stack;

    if (errRec.code) {
      errRec.apiCode = errRec.code;
      errRec.apiStatus = errRec.httpCode;
      errRec.apiMessage = errRec.userMessage;
    }

    if (errRec.sysErr) {
      errRec.sysCode = errRec.sysErr.code;
      errRec.sysMessage = errRec.sysErr.message;
      errRec.sysStack = errRec.sysErr.stack;
    }
  }

  if (errRec.req) {
    // Получаем данные HTTP запроса
    if (errRec.req.connection) {
      errRec.reqIp =
        errRec.req.headers['x-real-ip'] ||
        errRec.req.headers['x-forwarded-for'] ||
        errRec.req.connection.remoteAddress ||
        errRec.req.socket.remoteAddress ||
        errRec.req.connection.socket.remoteAddress;
    }

    errRec.reqBody = errRec.req.body;
    errRec.reqHeaders = errRec.req.headers;
    errRec.reqParams = errRec.req.params;

    errRec.reqMethod = errRec.req.method;
    errRec.reqOriginalUrl = errRec.req.originalUrl;
  }

  let savedRec = {};

  if (errRec.refId && currRefs[errRec.refId]) {
    savedRec = currRefs[errRec.refId];

    if (savedRec) {
      // Получаем сохраненные ранее данные
      if (!errRec.reqIp) errRec.reqIp = savedRec.reqIp;
      if (!errRec.reqBody) errRec.reqBody = savedRec.reqBody;
      if (!errRec.reqHeaders) errRec.reqHeaders = savedRec.reqHeaders;
      if (!errRec.reqParams) errRec.reqParams = savedRec.reqParams;
      if (!errRec.reqMethod) errRec.reqMethod = savedRec.reqMethod;
      if (!errRec.reqOriginalUrl)
        errRec.reqOriginalUrl = savedRec.reqOriginalUrl;

      if (!errRec.userId) errRec.userId = savedRec.userId;
      if (!errRec.userLogin) errRec.userLogin = savedRec.userLogin;
      if (!errRec.userName) errRec.userName = savedRec.userName;
    }
  }

  // Обновляем данные в savedRec
  if (errRec.refId) {
    if (!savedRec.reqIp && errRec.reqIp) savedRec.reqIp = errRec.reqIp;
    if (!savedRec.reqBody && errRec.reqBody) savedRec.reqBody = errRec.reqBody;
    if (!savedRec.reqHeaders && errRec.reqHeaders)
      savedRec.reqHeaders = errRec.reqHeaders;
    if (!savedRec.reqParams && errRec.reqParams)
      savedRec.reqParams = errRec.reqParams;
    if (!savedRec.reqMethod && errRec.reqMethod)
      savedRec.reqMethod = errRec.reqMethod;
    if (!savedRec.reqOriginalUrl && errRec.reqOriginalUrl)
      savedRec.reqOriginalUrl = errRec.reqOriginalUrl;
    if (!savedRec.userId && errRec.userId) savedRec.userId = errRec.userId;
    if (!savedRec.userLogin && errRec.userLogin)
      savedRec.userLogin = errRec.userLogin;
    if (!savedRec.userName && errRec.userName)
      savedRec.userName = errRec.userName;

    savedRec.lastUpdated = logDate.toISOString(true);
    currRefs[errRec.refId] = savedRec;
  }

  // Делаем запись в лог
  let logLabel = null;

  if (errRec.error) logLabel = 'ERROR';
  if (!logLabel && errRec.warn) logLabel = 'WARNING';
  if (!logLabel && errRec.info) logLabel = 'INFO';
  if (!logLabel && errRec.debug) logLabel = 'DEBUG';
  if (!logLabel && errRec.trace) logLabel = 'TRACE';
  if (!logLabel) logLabel = 'TRACE';
  errRec.logLabel = logLabel;

  if (errRec.error && typeof errRec.error === 'object') {
    errRec.error = JSON.stringify(errRec.error);
  }
  if (errRec.warn && typeof errRec.warn === 'object') {
    errRec.warn = JSON.stringify(errRec.warn);
  }
  if (errRec.info && typeof errRec.info === 'object') {
    errRec.info = JSON.stringify(errRec.info);
  }
  if (errRec.debug && typeof errRec.debug === 'object') {
    errRec.debug = JSON.stringify(errRec.debug);
  }
  if (errRec.trace && typeof errRec.trace === 'object') {
    errRec.trace = JSON.stringify(errRec.trace);
  }

  let logMode = 'console';
  if (exports.ready === true) {
    logMode = conf.log.logMode;
  }

  errRec.time = logDate.toISOString(true);

  // Выходим, если уровень логирования недостаточный
  if (conf.log.logLevel === 'error') {
    if (
      logLabel === 'TRACE' ||
      logLabel === 'DEBUG' ||
      logLabel === 'INFO' ||
      logtype === 'WARNING'
    )
      return;
  }

  if (conf.log.logLevel === 'warning') {
    if (logLabel === 'TRACE' || logLabel === 'DEBUG' || logLabel === 'INFO')
      return;
  }

  if (conf.log.logLevel === 'info') {
    if (logLabel === 'TRACE' || logLabel === 'DEBUG') return;
  }

  if (conf.log.logLevel === 'debug') {
    if (logLabel === 'TRACE') return;
  }

  if (
    logMode === 'console' ||
    logLabel === 'ERROR' ||
    logLabel === 'WARNING' ||
    logLabel === 'INFO'
  ) {
    errMsg = null;

    if (logLabel === 'ERROR') errMsg = '\x1b[31m';
    if (logLabel === 'WARNING') errMsg = '\x1b[33m';
    if (logLabel === 'INFO') errMsg = '\x1b[34m';
    if (logLabel === 'DEBUG') errMsg = '\x1b[92m';
    if (logLabel === 'TRACE') errMsg = '\x1b[37m';

    errMsg = `${errMsg}███ ${errRec.time} ${logLabel}`;

    if (errRec.error) {
      errMsg += ': ';
      if (errRec.code) errMsg += errRec.code;
      errMsg = `${errMsg}, ${errRec.error}`;
    }

    if (errRec.warn) errMsg = `${errMsg}\n${errRec.warn}`;
    if (errRec.info) errMsg = `${errMsg}\n${errRec.info}`;
    if (errRec.debug) errMsg = `${errMsg}\n${errRec.debug}`;
    if (errRec.trace) errMsg = `${errMsg}\n${errRec.trace}`;

    if (logLabel === 'TRACE' || logLabel === 'ERROR') {
      if (errRec.apiStatus)
        errMsg =
          `${errMsg}\n` +
          `API returns: ${errRec.apiStatus}, ${errRec.apiCode}, ${errRec.apiMessage}`;
      if (errRec.sysCode)
        errMsg =
          `${errMsg}\n` +
          `System Error: ${errRec.sysCode} ${errRec.sysMessage}`;

      if (errRec.stack && !errRec.hordeStack)
        errMsg = `${errMsg}\n${errRec.stack}`;

      if (
        errRec.hordeStack &&
        Array.isArray(errRec.hordeStack) &&
        errRec.hordeStack.length > 0
      ) {
        errMsg += '\n';
        errMsg += '***** Call stack *****';
        for (let i = 0; i < errRec.hordeStack.length; i++) {
          const stackNum = i + 1;
          errMsg = `${errMsg}\n#${stackNum}. `;
          if (errRec.hordeStack[i].code)
            errMsg = `${errMsg + errRec.hordeStack[i].code}, `;
          if (errRec.hordeStack[i].logMessage)
            errMsg = `${errMsg + errRec.hordeStack[i].logMessage}, `;
          if (errRec.hordeStack[i].caller)
            errMsg += errRec.hordeStack[i].caller;
        }
        errMsg += '\n************************';
      }

      let bodyForLog = '';
      if (errRec.reqBody) {
        JSON.parse(JSON.stringify(errRec.reqBody));
        if (errRec.reqOriginalUrl && errRec.reqOriginalUrl.includes('images'))
          bodyForLog = '{...}';
      }

      let headersForLog = '';
      if (errRec.reqHeaders) {
        JSON.parse(JSON.stringify(errRec.reqHeaders));
        if (errRec.reqHeaders && errRec.reqHeaders['session-token'])
          headersForLog['session-token'] = '...';
        if (errRec.reqHeaders && errRec.reqHeaders['caller-token'])
          headersForLog['caller-token'] = '...';
        headersForLog = JSON.stringify(headersForLog);
      }

      if (errRec.reqMethod)
        errMsg =
          `${errMsg}\n` +
          `Request data: ${errRec.reqMethod} ${errRec.reqOriginalUrl} (${
            errRec.reqIp
          }) \nHeaders: ${headersForLog}\nURL Params: ${JSON.stringify(
            errRec.reqParams
          )}\nBody: ${bodyForLog}`;
    }

    if (logLabel == 'TRACE' || logLabel == 'DEBUG' || logLabel == 'ERROR') {
      let userData = errRec.userId;
      if (errRec.userLogin) userData = `${userData}, ${errRec.userLogin}`;
      if (errRec.userName) userData = `${userData}, ${errRec.userName}`;

      if (errRec.userId) errMsg = `${errMsg}\n` + `User data: ${userData}`;
    }

    if (errRec.refId) errMsg = `${errMsg}\n` + `Ref: ${errRec.refId}`;

    errMsg += '\x1b[0m';

    const isFiltered = false;

    if (!isFiltered) {
      console.log(errMsg);
    }
  }

  fileLog = {};

  if (errRec.time) fileLog.time = errRec.time;
  if (errRec.logLabel) fileLog.logLabel = errRec.logLabel;
  if (errRec.instance) fileLog.instance = errRec.instance;
  if (errRec.serviceName) fileLog.serviceName = errRec.serviceName;
  if (errRec.code) fileLog.code = errRec.code;
  if (errRec.error) fileLog.error = errRec.error;
  if (errRec.warn) fileLog.warn = errRec.warn;
  if (errRec.info) fileLog.info = errRec.info;
  if (errRec.debug) fileLog.debug = errRec.debug;
  if (errRec.trace) fileLog.trace = errRec.trace;
  if (errRec.apiCode) fileLog.apiCode = errRec.apiCode;
  if (errRec.apiStatus) fileLog.apiStatus = errRec.apiStatus;
  if (errRec.apiMessage) fileLog.apiMessage = errRec.apiMessage;
  if (errRec.stack) fileLog.stack = errRec.stack;
  if (errRec.sysCode) fileLog.sysCode = errRec.sysCode;
  if (errRec.sysMessage) fileLog.sysMessage = errRec.sysMessage;
  if (errRec.sysCode) fileLog.sysCode = errRec.sysCode;
  if (errRec.sysStack) fileLog.sysStack = errRec.sysStack;
  if (errRec.hordeStack) fileLog.hordeStack = errRec.hordeStack;

  if (errRec.reqIp) fileLog.reqIp = errRec.reqIp;
  if (errRec.reqBody) fileLog.reqBody = errRec.reqBody;
  if (errRec.reqHeaders) fileLog.reqHeaders = errRec.reqHeaders;
  if (errRec.reqParams) fileLog.reqParams = errRec.reqParams;
  if (errRec.reqMethod) fileLog.reqMethod = errRec.reqMethod;
  if (errRec.reqOriginalUrl) fileLog.reqOriginalUrl = errRec.reqOriginalUrl;
  if (errRec.userId) fileLog.userId = errRec.userId;
  if (errRec.userLogin) fileLog.userLogin = errRec.userLogin;
  if (errRec.userName) fileLog.userName = errRec.userName;

  if (errRec.refId) fileLog.refId = errRec.refId;

  if (logMode === 'file') {
    if (logLabel === 'ERROR')
      exports.flog.error(JSON.stringify(removeLogEscaping(fileLog)));
    if (logLabel === 'WARNING')
      exports.flog.warn(JSON.stringify(removeLogEscaping(fileLog)));
    if (logLabel === 'INFO')
      exports.flog.info(JSON.stringify(removeLogEscaping(fileLog)));
    if (logLabel === 'DEBUG')
      exports.flog.debug(JSON.stringify(removeLogEscaping(fileLog)));
    if (logLabel === 'TRACE')
      exports.flog.trace(JSON.stringify(removeLogEscaping(fileLog)));
  }

  if (logMode === 'fluent') {
    // Подготавливаем запись для fluent
    fluent.emit(logLabel, removeLogEscaping(fileLog));
  }

  return errObject;
};

/*
var logRec = {
    code: 'E_SalespointNotFound',
    error: 'Ошибка при создании точки продаж',
    warn: null,
    info: null,
    debug: 'Отладочная информация',
    trace: 'Данные трассировки',
    sysErr: null,
    refId: 'testRef',
    userId: 41,
    req: null
}

log.rec(logRec);
*/

exports.error = function (msg, sysErr = null, refId = null) {
  return exports.rec({ error: msg, sysErr, refId });
};

exports.warn = function (msg, refId = null) {
  exports.rec({ warn: msg, refId });
};

exports.info = function (msg, refId = null) {
  exports.rec({ info: msg, refId });
};

exports.debug = function (msg, refId = null) {
  exports.rec({ debug: msg, refId });
};

exports.trace = function (msg, refId = null) {
  exports.rec({ trace: msg, refId });
};

function statsClean() {
  const nowDate = moment();

  for (let i = 0; i < exports.currStats.length; i++) {
    const started = exports.currStats[i].statStart;
    var dateDiffSec = nowDate.diff(moment(started), 'seconds');

    if (dateDiffSec >= 1800) {
      exports.trace(
        `Удаление незакрытого счетчика производительности: ${exports.currStats[i].statId} (${exports.currStats[i].statCounter}) ` +
          `. Данные: ${JSON.stringify(exports.currStats[i].statData)}`
      );
      exports.currStats.splice(i, 1);
      i--;
    }
  }

  for (const r in currRefs) {
    if (currRefs.hasOwnProperty(r)) {
      const { lastUpdated } = currRefs[r];
      var dateDiffSec = nowDate.diff(moment(lastUpdated), 'seconds');
      if (dateDiffSec >= 600) {
        delete currRefs[r];
      }
    }
  }
}

exports.statStart = function (counter, data, ref) {
  // Генерируем уникальный id и сохраняем данные в массив
  const newStatId = uuidBase62.v4(); // uuidv4();

  const statObj = {
    statId: newStatId,
    statData: data,
    statCounter: counter,
    statStart: moment().toISOString(true),
    statRef: ref,
  };

  exports.currStats.push(statObj);
  return newStatId;
};

exports.statEnd = function (statId) {
  // Ищем в массиве счетчик и завершаем его
  let foundInd = null;
  const nowDate = moment();

  let currCounter = null;

  for (let i = 0; i < exports.currStats.length; i++) {
    if (statId == exports.currStats[i].statId) {
      foundInd = i;
      currCounter = exports.currStats[i].statCounter;
      break;
    }
  }

  if (foundInd == null) {
    exports.error(`Счетчик ${statId} не найден в массиве счетчиков`);
    return;
  }

  // Делаем замер времени в секундах
  // var dateDiffSec = nowDate.diff(moment(exports.currStats[foundInd]['statStart']), 'seconds');
  let dateDiffSec = nowDate.diff(moment(exports.currStats[foundInd].statStart));
  dateDiffSec /= 1000;
  dateDiffSec = Math.round(dateDiffSec * 100) / 100;

  const logData = {
    counter: exports.currStats[foundInd].statCounter,
    started: exports.currStats[foundInd].statStart,
    finished: nowDate.toISOString(true),
    durationSec: dateDiffSec,
    data: exports.currStats[foundInd].statData,
    ref: exports.currStats[foundInd].statRef,
    instance: conf.main.instanceName,
    serviceName: conf.main.serviceName,
    logLabel: 'STAT',
  };

  if (conf.log.logMode === 'file') {
    exports.slog.info(JSON.stringify(logData));
  }

  if (conf.log.logMode === 'fluent') {
    fluent.emit('STAT', logData);
  }

  // Удаляем счетчик из массива
  exports.currStats.splice(foundInd, 1);
};

exports.statCancel = function (statId) {
  let foundInd = null;

  for (let i = 0; i < exports.currStats.length; i++) {
    if (statId === exports.currStats[i].statId) {
      foundInd = i;
      break;
    }
  }

  exports.currStats.splice(foundInd, 1);
};

exports.statFixed = function (counter, started, durationSec, data) {
  const logData = {
    counter,
    started,
    durationSec,
    data,
    instance: conf.main.instanceName,
    serviceName: conf.main.serviceName,
    logLabel: 'STAT',
  };

  if (conf.log.logMode === 'file') {
    exports.slog.info(JSON.stringify(logData));
  }

  if (conf.log.logMode === 'fluent') {
    fluent.emit('STAT', logData);
  }
};

exports.ApiErr = class extends Error {
  constructor(errCode) {
    super(errCode);
    Error.captureStackTrace(this, exports.rec);
  }
};