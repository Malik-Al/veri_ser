const uuidBase62 = require('uuid-base62');

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const xssFilters = require('xss-filters');
const formidable = require('formidable');
const favicon = require('serve-favicon');
const conf = require('./conf.js');
const log = require('./log.js');
const middleware = require('./middleware.js');
const errors = require('./errors.js');

// const { Error } = errors;
var Error = errors.Error;


exports.ready = false;
exports.app = null;

exports.apiFuncs = {};
exports.apiMethods = {};

exports.init = async function () {
  return new Promise((resolve, reject) => {
    try {
      if (!conf.restApi || !conf.restApi.restApiEnabled) {
        exports.ready = false;
        resolve();
      }

      log.debug('Инициализация REST API...');

      if (
        !conf.restApi.apiMethods ||
        !Array.isArray(conf.restApi.apiMethods) ||
        conf.restApi.apiMethods.length === 0
      ) {
        new Error('E_ConfigurationError', 'Ошибка при инициализации REST API: REST API включен, но не найдены методы API').log();
        reject(new Error('Ошибка при инициализации REST API: REST API включен, но не найдены методы API'));
        return;
      }

      exports.app = express();    
      exports.app.use(bodyParser.urlencoded({ extended: true }));
      exports.app.use(bodyParser.json({ limit: '100mb' }));
      exports.app.use(logRequestStart);

      // Дефолтная страница сервиса
      exports.app.get('/', function (req, res) {
        const contents = getDefaultPage('default-root.html', null);
        res.send(contents);
      });

      const faviconPath = path.join(conf.main.staticFiles, 'favicon.ico');

      if (fs.existsSync(path)) {
        exports.app.use(favicon(faviconPath));
      } else {
        exports.app.use(function (req, res, next) {
          if (req.originalUrl === '/favicon.ico') {
            res.status(204).json({});
          } else {
            next();
          }
        });
      }

      exports.app.use(function (req, res, next) {
        // res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8080');
        let allowOriginHeader = '*';
        if (conf.restApi.allowOriginHeader)
          allowOriginHeader = conf.restApi.allowOriginHeader;

        res.setHeader('Access-Control-Allow-Origin', allowOriginHeader);
        res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers','x-requested-with,content-type,session-token,caller-token,content-length,reference-id,user-login');
        res.setHeader('Access-Control-Allow-Credentials', true);
        res.setHeader('Access-Control-Expose-Headers', 'reference-id');

        if (req.method === 'OPTIONS') {
          res.status(200).send();
        } else {
          next();
        }
      });

      exports.app.use(middleware());

      initApi(function (err) {
        if (err) {
          new Error('E_ConfigurationError', `Ошибка при инициализации REST API: ${err}`).log();
          reject(`Ошибка при инициализации REST API: ${err}`);
          return;
        }

        exports.app.use(function (req, res, next) {
          let allowOriginHeader = '*';
          if (conf.restApi.allowOriginHeader)
            allowOriginHeader = conf.restApi.allowOriginHeader;
          res.setHeader('Access-Control-Allow-Origin', allowOriginHeader);

          // res.status(404).json({ code: 'E_NotFound', message: errors.getErrorUserMessage('E_NotFound') });
          retApiError('E_NotFound', req, res, null);
        });

        exports.app.use(function (err, req, res, next) {
          let allowOriginHeader = '*';
          if (conf.restApi.allowOriginHeader)
            allowOriginHeader = conf.restApi.allowOriginHeader;
          res.setHeader('Access-Control-Allow-Origin', allowOriginHeader);

          new Error(
            'E_IncorrectParams',
            `Ошибка парсинга входных параметров: ${err}`
          ).log();
          retApiError('E_IncorrectParams', req, res, null);
        });

        // Параметры по умолчанию
        let apiTcpPort = 8080;
        let apiBindIp = '0.0.0.0';

        if (conf.restApi.apiTcpPort) apiTcpPort = conf.restApi.apiTcpPort;
        if (conf.restApi.apiBindIp) apiBindIp = conf.restApi.apiBindIp;

        exports.app.listen(apiTcpPort, apiBindIp);
        log.info(
          `Инициализация REST API завершена успешно. Сервис начал принимать запросы по адресу и порту ${apiBindIp}: ${apiTcpPort}`
        );
        exports.ready = true;
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
};

const logRequestStart = (req, res, next) => {
  if (req.originalUrl) {
    if (req.originalUrl.includes('/favicon.ico')) {
      next();
      return;
    }
  }


  let refId = req.header('Reference-Id') || req.header('reference-id');
  if (refId == null) {
    refId = uuidBase62.v4();
    req.headers['reference-id'] = refId;
  }

  let dataForLogs = JSON.stringify(req.body);

  if (req.originalUrl) {
    if (
      req.originalUrl.includes('images') ||
      req.originalUrl.includes('files')
    ) {
      dataForLogs = '{...}';
    }
  }

  let headersForLog = JSON.parse(JSON.stringify(req.headers));
  if (req.headers && req.headers['session-token'])
    headersForLog['session-token'] = '...';
  if (req.headers && req.headers['caller-token'])
    headersForLog['caller-token'] = '...';
  headersForLog = JSON.stringify(headersForLog);

  dataForLogs = xssFilters.inHTMLData(dataForLogs);

  const qIp =
    req.headers['X-Forwarded-For'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;

  const logMsg = `REST запрос: ${req.method} ${req.originalUrl}, Headers: ${headersForLog}, Body: ${dataForLogs}. IP: ${qIp}`;
  log.trace(logMsg, refId);

  if (!exports.ready) {
    log.error(
      'Сервер не может обработать запрос в настоящее время',
      null,
      refId
    );
    res.status(500).send();
  } else {
    next();
  }
};

function getDefaultPage(htmlFile, callback) {
  let contents;

  const htmlFilePath = path.join(conf.main.templatesPath, 'html', htmlFile);

  try {
    contents = fs.readFileSync(htmlFilePath, 'utf8');
  } catch (err) {
    const errMsg = `Файл html ${htmlFilePath} не найден`;
    log.warn(errMsg);
    contents = errMsg;
  }

  return contents;
}

function retApiError(apiErr, req, res, refId) {
  let errCode = apiErr;
  let isErrorObj = false;

  if (typeof apiErr === 'object') {
    // log.warn(apiErr.stack[0]);
    if (apiErr.stack && apiErr.stack[0] && apiErr.stack[0].code) {
      errCode = apiErr.stack[0].code;
      isErrorObj = true;
    }
  }

  let retStatus = errors.getErrorHttpStatus(errCode);
  if (!retStatus) retStatus = 500;
  const errMsg = errors.getErrorUserMessage(errCode);

  let bodyForLog = JSON.stringify(req.body);

  if (req.originalUrl) {
    if (
      req.originalUrl.includes('images') ||
      req.originalUrl.includes('files')
    ) {
      bodyForLog = '{...}';
    }
  }

  const errLogMsg =
    `Ошибка выполнения API запроса ${req.method} ${req.originalUrl}.\n` +
    `Headers: ${JSON.stringify(
      req.headers
    )}, Body: ${bodyForLog}. Результат: (${retStatus}) ${errCode}, ${errMsg}`;

  if (isErrorObj) {
    const e = new Error(apiErr, errLogMsg, refId).log();
  } else {
    log.error(errLogMsg, null, refId);
  }

  res.status(retStatus).json({ code: errCode, message: errMsg });
}

function verifyParamsList(paramsObj, methodObj, paramListName, refId) {
  retObj = {};

  if (methodObj[paramListName]) {
    for (let i = 0; i < methodObj[paramListName].length; i++) {
      const confParam = methodObj[paramListName][i];

      let param = null;
      let paramFin = null;

      for (const ind in paramsObj) {
        if (ind == confParam.name) {
          param = paramsObj[ind];
          break;
        }
      }

      try {
        paramFin = verifyParam(param, confParam, methodObj, refId);
      } catch (err) {
        const logMsg = `Параметр не прошел проверку формата. Метод: ${
          methodObj.funcName
        }. Параметр: ${
          confParam.name
        }. Значение параметра: ${xssFilters.inHTMLData(
          param
        )}. Требуемый формат: ${JSON.stringify(confParam)}`;
        const errObj = new Error(err, logMsg, refId);
        throw errObj;
        return;
      }

      retObj[confParam.name] = paramFin;
    }
  }
  return retObj;
}

function verifyParam(paramVal, confParam, methodObj, refId) {
  let retParam = null;
  let paramChecked = false;

  // Проверка на обязательность параметра
  if (paramVal == null && confParam.required == true) {
    var logMsg = `Вызов метода без указания обязательного параметра. Метод: ${methodObj.funcName}. Отсутствующий параметр: ${confParam.name}`;
    var errObj = new Error('E_IncorrectParams', logMsg, refId);
    throw errObj;
  }

  // Проверка параметра
  if (paramVal != null) {
    const cType = confParam.type;

    if (
      ![
        'integer',
        'string',
        'string-asci',
        'string-num',
        'float',
        'money',
        'date',
        'object',
        'array',
        'boolean',
        'phone',
        'email',
      ].includes(cType)
    ) {
      var logMsg = `В конфигурации определен параметр неизвестного типа: ${cType}`;
      var errObj = new Error('E_IncorrectParams', logMsg, refId);
      throw errObj;
    }

    const cLen = confParam.maxLen;
    // Конвертируем параметр в строку
    let paramValStr = paramVal.toString();
    if (
      Array.isArray(paramVal) ||
      typeof paramVal === 'object' ||
      Array.isArray(paramVal)
    ) {
      paramValStr = JSON.stringify(paramVal);
    }

    // Проверяем длину объекта в строковом выражении
    if (paramValStr.length > cLen) {
      var logMsg = `Вызов метода с параметром, превышающим допустимую длину. Метод: ${methodObj.funcName}. Параметр: ${confParam.name}. Фактическая длина: ${paramValStr.length}. Допустимая длина: ${cLen}`;
      var errObj = new Error('E_IncorrectParams', logMsg, refId);
      throw errObj;
    }

    // Проверяем параметр на XSS (внедрение JavaScript кода)
    /*
        if (paramValStr != xssFilters.inHTMLData(paramValStr)) {
            var logMsg = "Обнаружена попытка внедрения XSS. Метод: " + methodObj['funcName'] + ". Параметр: " + confParam['name'] + ". Результат XSS обработчика: " + xssFilters.inHTMLData(paramValStr);
            var errObj = new Error("E_IncorrectParams", logMsg, refId);
            throw errObj;
        }
        */

    // Проверяем тип параметра (и приводим к нужному типу или формату при необходимости)
    if (cType == 'integer') {
      // Проверка
      if (!validator.isInt(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение
      retParam = parseInt(paramValStr);
      paramChecked = true;
    }

    if (cType == 'string') {
      // Проверка (может быть любая строка)
      // Приведение
      retParam = xssFilters.inHTMLData(paramValStr);
      paramChecked = true;
    }

    if (cType == 'string-asci') {
      // Проверка (Строка с символами из ACSI)
      if (!validator.isAscii(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение
      retParam = xssFilters.inHTMLData(paramValStr);
      paramChecked = true;
    }

    if (cType == 'string-num') {
      // Проверка (Строка с числами)
      if (!validator.isInt(paramValStr, { allow_leading_zeroes: true }))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение
      retParam = xssFilters.inHTMLData(paramValStr);
      paramChecked = true;
    }

    if (cType == 'float') {
      // Проверка (число с плавающей точкой)
      if (!validator.isFloat(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение (не округляем, берем как есть)
      retParam = parseFloat(paramValStr);
      paramChecked = true;
    }

    if (cType == 'money') {
      // Проверка (число с плавающей точкой)
      if (!validator.isFloat(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение (округляем до двух знаков после запятой)
      retParam = parseFloat(paramValStr);
      retParam = Math.round(retParam * 100) / 100;
      paramChecked = true;
    }

    if (cType == 'date') {
      // Проверка (ISO дата)
      if (!validator.isISO8601(paramValStr, { strict: true }))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение (Конвертим в moment() и обратно)
      // retParam = moment(paramValStr).format('YYYY-MM-DD');
      retParam = paramValStr;
      paramChecked = true;
    }

    if (cType == 'object') {
      // Проверка (на JSON)
      if (!validator.isJSON(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение (конвертим в объект и проверяем, объект ли это)
      retParam = JSON.parse(xssFilters.inHTMLData(paramValStr));

      if (Array.isArray(retParam))
        throw new Error('E_IncorrectParams', null, refId);
      paramChecked = true;
    }

    if (cType == 'array') {
      // Проверка (на JSON)
      if (!validator.isJSON(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение (конвертим в объект и проверяем, объект ли это)
      retParam = JSON.parse(xssFilters.inHTMLData(paramValStr));
      if (!Array.isArray(retParam))
        throw new Error('E_IncorrectParams', null, refId);
      paramChecked = true;
    }

    if (cType == 'boolean') {
      // Проверка
      if (!['1', 'true', '0', 'false'].includes(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение
      retParam = validator.toBoolean(paramValStr, true);
      paramChecked = true;
    }

    if (cType == 'phone') {
      // Проверка (также как string-num, только убираем + в начале, если он есть)
      if (paramValStr.startsWith('+')) paramValStr = paramValStr.substring(1);
      if (!validator.isInt(paramValStr, { allow_leading_zeroes: true }))
        throw new Error('E_IncorrectParams', null, refId);

      // Приведение
      retParam = paramValStr;
      paramChecked = true;
    }

    if (cType == 'email') {
      // Проверка
      if (!validator.isEmail(paramValStr))
        throw new Error('E_IncorrectParams', null, refId);
      // Приведение
      retParam = xssFilters.inHTMLData(paramValStr);
      paramChecked = true;
    }

    if (!paramChecked) {
      log.error(
        `Параметр не проверен ни одной из функций валидации. Метод: ${
          methodObj.funcName
        }. Параметр: ${JSON.stringify(confParam)}. Ref: ${refId}`
      );
      throw 'E_IncorrectParams';
      return;
    }
  }

  return retParam;
}

function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    form.encoding = 'utf-8';

    form.parse(req, function (err, fields, files) {
      if (err) {
        reject(err);
        return;
      }

      const ret = {
        fields,
        files,
      };

      resolve(ret);
    });
  });
}

async function invokeApi(req, res, methodObj) {
  // Проверка reference id
  let refId = req.header('Reference-Id') || req.header('reference-id');
  if (refId == null) {
    refId = uuidBase62.v4();
  }

  let urlParams = {};
  let headerParams = {};
  let bodyParams = {};

  if (req.query && typeof req.params === 'object') {
    for (const r in req.query) {
      req.params[r] = req.query[r];
    }
  }

  try {
    if (req.params && typeof req.params === 'object') {
      urlParams = verifyParamsList(req.params, methodObj, 'urlParams', refId);
    }
  } catch (err) {
    var e = new Error(err, 'Ошибка проверки параметров API urlParams', refId);
    // retApiError('E_IncorrectParams', req, res, refId);
    retApiError(e, req, res, refId);
    return;
  }

  const { userId } = req.params;

  let multipartFormParams = null;
  if (methodObj.isMultipartForm) {
    let formData = null;

    try {
      formData = await parseMultipartForm(req);
    } catch (err) {
      var e = new Error(
        err,
        'Ошибка проверки параметров API MultipartForm',
        refId
      );
      // retApiError('E_IncorrectParams', req, res, refId);
      retApiError(e, req, res, refId);
      return;
    }
    if (formData && formData.fields) {
      multipartFormParams = formData.fields;
      if (formData.files) {
        multipartFormParams.uploadedFiles = formData.files;
      }
    }
  }

  const logRec = {
    trace: `Запуск метода API ${methodObj.funcName} (${methodObj.url})`,
    sysErr: null,
    refId,
    req,
  };
  if (userId) logRec.userId = userId;

  log.rec(logRec);

  let dataForLogs = `${JSON.stringify(req.params)}, ${JSON.stringify(
    req.body
  )}`;
  let metricName = methodObj.metric;

  if (methodObj.funcName == 'createSession') {
    dataForLogs = req.body.userLogin;
    if (req.body.tempToken) {
      metricName = `${metricName}-2`;
    }
  }

  dataForLogs = xssFilters.inHTMLData(dataForLogs);

  const statId = log.statStart(metricName, dataForLogs, refId);

  const accessMode = null;

  // Проверяем доступ вызывающего сервиса и пользователя к API методу
  /*
    var verStat = null;
    try {
        verStat = log.statStart("api-verify-access", null, refId);
        accessMode = await apiTools.verifyMethodAccessSync(req, methodObj['funcName'], refId);
        log.statEnd(verStat);
    } catch (err) {
        log.statCancel(verStat);
        log.statCancel(statId);
        retApiError(err, req, res, refId);
        return;
    }
    */

  try {
    if (req.body && typeof req.body === 'object') {
      let par = req.body;
      if (multipartFormParams) {
        par = multipartFormParams;
      }

      bodyParams = verifyParamsList(par, methodObj, 'bodyParams', refId);
    }

    if (req.headers && typeof req.headers === 'object') {
      headerParams = verifyParamsList(
        req.headers,
        methodObj,
        'headerParams',
        refId
      );
    }
  } catch (err) {
    log.statCancel(statId);
    var e = new Error(err, 'Ошибка проверки параметров API bodyParams', refId);
    // retApiError('E_IncorrectParams', req, res, refId);
    retApiError(e, req, res, refId);
    return;
  }

  // Собираем и проверяем входные параметры
  const qIp =
    req.headers['X-Forwarded-For'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;
  headerParams.userIp = qIp;

  log.trace(
    `Завершена проверка и конвертация параметров для вызова API метода ${methodObj.funcName} (${methodObj.url})` +
      `. urlParams: ${JSON.stringify(urlParams)}`,
    refId
  );

  // Вызываем метод API
  const apiFuncName = methodObj.funcName;

  if (!exports.apiFuncs[apiFuncName]) {
    log.statCancel(statId);
    var e = new Error(
      'E_ConfigurationError',
      `Функция API ${apiFuncName} не найдена`,
      refId
    );
    // retApiError('E_ConfigurationError', req, res, refId);
    retApiError(e, req, res, refId);
    return;
  }

  const apiFunc = exports.apiFuncs[apiFuncName];

  apiFunc(urlParams, bodyParams, headerParams, accessMode, refId, function (
    err,
    data = {},
    retCode = 200
  ) {
    if (err) {
      log.statCancel(statId);
      const e = new Error(
        err,
        `Ошибка при вызове API метода: ${apiFuncName}`,
        refId
      );
      retApiError(e, req, res, refId);
      return;
    }
    log.statEnd(statId);

    let retInfo = null;
    if (Array.isArray(data)) {
      retInfo = `Массив из ${
        data.length
      } записей. Первая запись: ${JSON.stringify(data[0])}`;
    } else if (data.image || data.form) {
      retInfo = '{...}';
    } else {
      retInfo = JSON.stringify(data);
    }

    log.trace(
      `Завершен запуск метода API ${methodObj.funcName} (${methodObj.url}). ` +
        `HTTP статус: ${retCode}. Данные, вернувшиеся клиенту: ${retInfo}`,
      refId
    );
    res.status(retCode).json(data);
  }).catch(function (err) {
    log.statCancel(statId);
    const e = new Error(
      err,
      `Ошибка при вызове API метода: ${apiFuncName}`,
      refId
    );
    retApiError(e, req, res, refId);
  });
}

function initApi(callback) {
  for (let i = 0; i < conf.restApi.apiMethods.length; i++) {
    const methodObj = conf.restApi.apiMethods[i];

    if (methodObj.method == 'GET') {
      exports.app.get(methodObj.url, function (req, res) {
        invokeApi(req, res, methodObj);
      });
    }

    if (methodObj.method == 'POST') {
      exports.app.post(methodObj.url, function (req, res) {
        invokeApi(req, res, methodObj);
      });
    }

    if (methodObj.method == 'PUT') {
      exports.app.put(methodObj.url, function (req, res) {
        invokeApi(req, res, methodObj);
      });
    }

    if (methodObj.method == 'DELETE') {
      exports.app.delete(methodObj.url, function (req, res) {
        invokeApi(req, res, methodObj);
      });
    }
  }

  callback();
}