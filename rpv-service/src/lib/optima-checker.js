const msqsql = require('./mssql-connector');
const log = require('./std/log');
const { Error } = require('./std/errors');
const sql = require('mssql');

async function runSqlQuery(query, value, refId) {
    try {
        let request = await msqsql.getRequest(refId);
        request.input('client_id', sql.BigInt, value)
        return request.query(query);
    } catch (error) {
        throw new Error(error, 'Выполнение запроса в БД MSSQL', refId);
    }
}

exports.isNewNumberExistInOoptima24 = async function (PhoneNumber, refId) {
    const destination = 'Проверка номера телефона клиента на его существование в оптима24.';
    try {
        log.info(`[SUCCESS] ${destination} [REQUISITE] ${PhoneNumber}`, refId);
        log.debug(`Функция isNewNumberExistInOoptima24 посылает запрос в MS SQL с параметром PhoneNumber: ${PhoneNumber}`, refId);
        let result = await runSqlQuery('SELECT c.Id, c.BankId, u.UserStatus, c.MobilePhoneNumber FROM Client c INNER JOIN [User] u ON u.id = c.id where MobilePhoneNumber = @client_id AND NOT u.UserStatus = 6 ORDER BY c.RegDate DESC', PhoneNumber, refId);
        log.debug(`Запрос в MS SQL вернул значение ${JSON.stringify(result.recordset[0])}`, refId);

        if (result.recordset.length > 0) {
            log.debug(`Клиент с таким номером телефона уже зарегистрирован в Оптима24 ${PhoneNumber}`, refId);
            return true;
        }
        else return false;

    } catch (error) {
        throw new Error(error, destination, refId);
    }

}

exports.isRegisteredInOptima24 = async function (form, refId) {
    const destination = 'Получение статуса клиента в БД Оптима24 (MSSQL) по ID.';

    try {
        log.debug(`Функция isRegisteredInOptima24 посылает запрос в MS SQL с параметром client_id: ${form.idCode}`, refId);
        let result = await runSqlQuery('SELECT c.Id, c.BankId, u.UserStatus FROM Client c INNER JOIN [User] u ON u.id = c.id WHERE BankId = @client_id AND NOT u.UserStatus = 6 ORDER BY c.RegDate DESC', form.idCode, refId);
        log.debug(`Запрос в MS SQL вернул значение ${JSON.stringify(result)}`, refId);

        if (result.recordset.length > 0) {
            let number = result.recordset[0].UserStatus;
            log.info(`[SUCCESS] ${destination} [REQUISITE] ${number}`, refId);
            return number;
        }
        else return true;
    } catch (error) {
        throw new Error(error, destination, refId);
    }
}

exports.getCurrentNumberFromOptima24 = async function (form, refId) {
    const destination = 'Получение текущего номера из БД Оптима24 (MSSQL) по ID клиента.';

    try {
        log.debug(`Функция getCurrentNumberFromOptima24 посылает запрос в MS SQL с параметром client_id: ${form.idCode}`, refId);
        let result = await runSqlQuery('select top 1 c.MobilePhoneNumber from [Client] c join [User] u on u.Id = c.Id where BankId = @client_id and not u.UserStatus = 6 order by c.RegDate desc', form.idCode, refId);
        log.debug(`Запрос в MS SQL вернул значение ${JSON.stringify(result)}`, refId);

        if (result.recordset.length > 0) {
            let number = result.recordset[0].MobilePhoneNumber;
            log.info(`[SUCCESS] ${destination} [REQUISITE] ${number}`, refId);
            return number;
        }

        log.info(`[FAIL] ${destination} [REQUISITE] ID клиента: ${form.idCode}`, refId);
    } catch (error) {
        throw new Error(error, destination, refId);
    }
}

exports.isCurrentNumberCorrect = function (formCurrentNumber, optimaCurrentNumber, refId) {
    const destination = 'Проверка текущего номера из БД Оптима24 (MSSQL) на соответствие с текущим номером из формы';

    try {
        let pattern = /[^\d]/g;
        let formCleanCurrentNumber = formCurrentNumber.replace(pattern, '');
        let optimaCleanCurrentNumber = optimaCurrentNumber.replace(pattern, '');

        log.debug(`После очистки регуляркой сравниваются следующие значения текущих номеров: form: ${formCleanCurrentNumber} === optima: ${optimaCleanCurrentNumber}`, refId);

        const requisite = `[REQUISITE] Номер из формы: ${formCleanCurrentNumber} ; из БД Оптима24: ${optimaCleanCurrentNumber}`;

        if (formCleanCurrentNumber === optimaCleanCurrentNumber) {
            log.info(`[SUCCESS] ${destination}; ${requisite}`, refId);
            return true;
        } else {
            log.info(`[FAIL] ${destination}; ${requisite}`, refId);
            return false;
        }
    } catch (error) {
        throw new Error(error, destination, refId);
    }
}

