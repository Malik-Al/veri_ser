const sql = require('mssql');
const log = require('./std/log');
const conf = require('./std/conf.js');
const { Error } = require('./std/errors.js');

async function getConnection(refId) {
  try {
    const config = {
      user: conf.main.optimaUser,
      password: conf.main.optimaPassword,
      server: conf.main.optimaServer, 
      database: conf.main.optimaDatabase,
      options: { enableArithAbort: true },
      pool: { max: conf.main.dbPoolMax, min: 0, idleTimeoutMillis: 50000}
    };
    // sql.connect() вовзращает global connection pool, если существует, иначе создает новый
    return await sql.connect(config);
  } catch (error) {
    throw new Error(error, 'Подключение к БД MSSQL', refId)
  }
}

async function getRequest(refId) {
  try {
    let pool = await getConnection(refId);
    return new sql.Request(pool);
  } catch (error) {
    throw new Error(error, 'Получение sql Request для выполнения запроса в БД MSSQL', refId);
  }
}

async function closeConnection() {
  try {
    await sql.close();
  } catch (error) {
    new Error(error, 'Ошибка при закрытии подключения к БД MSSQL').log();
  }
}

async function init() {
    return new Promise(async (resolve, reject) => {
      try {
        log.debug('Инициализация подключения к БД MSSQL...');
        await getConnection();
        log.debug('Инициализация подключения к БД MSSQL успешно завершена');
        resolve();
      } catch (err) {
        new Error(err, 'Ошибка при инициализации подключения к БД MSSQL').log();
        reject('E_ServerError');
      }
    });
};

module.exports = {
  init, getConnection, closeConnection, getRequest
}