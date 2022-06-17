const system = require('./src/lib/std/system');
const env = require('./src/lib/std/env.js');
const conf = require('./src/lib/std/conf.js');
const log = require('./src/lib/std/log.js');
const errors = require('./src/lib/std/errors.js');
const restApi = require('./src/lib/std/rest-api.js');
const msSqlDb = require('./src/lib/mssql-connector');
const pg = require('./src/lib/db/db-connection')

process.on('uncaughtException', uncaughtHandler);
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);


// Инициализация подсистем
(async () => {
  system.addReadyPoint('Loading');
  try {
    await env.init();
    await conf.init();
    await log.init();
    await errors.init();
    await restApi.init();
    await msSqlDb.init();
    await pg.init();

    require('./src/lib/api-verf-form');
    require('./src/lib/api-verf-form-registr');
    require('./src/lib/check-phone');

    log.info(`Приложение запускается в ${process.env.NODE_ENV} env`);
    log.info("Инициализация сервиса завершена успешно");

    system.setLoaded();
    system.resolveReadyPoint('Loading');
  } catch (err) {
    console.log("Ошибка при инициализации сервиса: " + (err.stack || err));
    await cleanup();
  }
})();

function uncaughtHandler(err) {
  if (log) {
    log.error("Необработанная ошибка", err);
  } else {
    console.log(err.stack || err);
  }
}

async function cleanup() {
  try {
    await msSqlDb.closeConnection();
    console.log("\nВыполняется остановка микросервиса...");
  } catch (err) {
    console.log(err.stack || err);
  }

  setTimeout(function () {
    process.exit(1);
  }, 1000);
}