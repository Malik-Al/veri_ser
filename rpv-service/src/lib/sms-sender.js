const axios = require('axios').default;
const conf = require('./std/conf');
const log = require('./std/log');
const uuidbase62 = require('uuid-base62');
const { Error } = require('./std/errors');

async function sendMessage(message, number, url, refId) {
    const identifier = uuidbase62.v4();
    try {
        let messageBody = {
            i: identifier,
            p: number,
            b: message,
            o: 0,
            t: 2
        }
        log.debug(`Функция sendMessage посылает запрос на URL: ${url}; тело запроса: ${JSON.stringify(messageBody)}`, refId);
        await axios.post(url, messageBody, { proxy:false, timeout: 10000 });
        return true;
    } catch (e) {
        throw new Error(e, `Ошибка при отправке смс. Номер: ${number}`, refId);
    }
}

exports.generateMessageWithAppCode = function (form, refId, message) {
    try {
        let smsText = message;
        let indexOfSign = smsText.indexOf('№');

        return smsText.slice(0, indexOfSign + 1) + ' ' + form.appCode + smsText.slice(indexOfSign + 2);
    } catch (error) {
        throw new Error(error, 'Вставка номера заявки в сообщение клиенту', refId);
    }
}

exports.sendMessageToClient = async function (form, refId) {
    const destination = 'отправка СМС с номером заявки клиенту на мобильный телефон';
    let number, url, message;

    try {
        number = form.newNumber;
        url = conf.main.smsSenderUrl;
        message = exports.generateMessageWithAppCode(form, refId, conf.messages.applicationCodeSms[form.lang]);
        log.debug(`Функция generateMessageWithAppCode сгенерировала текст сообщения: ${message}`, refId);
    } catch (error) {
        throw new Error(error, 'Получение номера телефона, текста сообщения и URL', refId);
    }

    try {
        await sendMessage(message, number, url, refId);
        log.info(`SUCCESS - ${destination}; REQUISITE: ${number}`, refId);
    } catch (error) {
        new Error(error, destination, refId).log();

        setTimeout(async function send() {
            try {
                await sendMessage(message, number, url, refId);
                log.info(`SUCCESS - Пере${destination}; REQUISITE: ${number}`, refId);
            } catch (error) {
                new Error(error, `Пере${destination}`, refId).log();
            }
        }, 1000 * 60 * 3);
    }
}

exports.sendMessageToClientRegistr = async function (form, refId) {
    const destination = 'отправка СМС с номером заявки клиенту на мобильный телефон';
    let number, url, message;
    let isSmsSuccessSended;
    try {
        number = form.phoneNumber;
        url = conf.main.smsSenderUrl;
        message = exports.generateMessageWithAppCode(form, refId, conf.messages.applicationCodeSmsRegistr[form.lang]);
        log.debug(`Функция generateMessageWithAppCode сгенерировала текст сообщения: ${message}`, refId);
    } catch (error) {
        throw new Error(error, 'Получение номера телефона, текста сообщения и URL', refId);
    }

    try {
        isSmsSuccessSended = await sendMessage(message, number, url, refId);
        if (isSmsSuccessSended) {
            log.info(`SUCCESS - ${destination}; REQUISITE: ${number}`, refId);
            return true;
        }
    } catch (error) {
        new Error(error, destination, `: ${number}`, refId).log();

        setTimeout(async function send() {
            try {
                if (isSmsSuccessSended) {
                    log.info(`SUCCESS - Пере${destination}; REQUISITE: ${number}`, refId);
                    return true;
                }
            } catch (error) {
                new Error(error, `Пере${destination}: ${number}`, refId).log();
            }
        }, 1000 * 60 * 3);
    }
}

exports.sendMessageToClientOldPhone = async function (form, refId) {
    const destination = 'отправка СМС с уведомлением о заявке клиенту на старый номер телефона';
    let number, url, message;

    try {
        number = form.currentNumber;
        url = conf.main.smsSenderUrl;
        message = conf.messages.smsToClientBeforeChangePhone[form.lang]
        log.debug(`Функция sendMessageToClientOldPhone сгенерировала текст сообщения: ${message}`, refId);

    } catch (error) {
        throw new Error(error, 'Получение номера телефона, текста сообщения и URL', refId);
    }
    try {
        isSmsSuccessSended = await sendMessage(message, number, url, refId);
        if (isSmsSuccessSended) {
            log.info(`SUCCESS - ${destination}; REQUISITE: ${number}`, refId);
            return true;
        }
    } catch (error) {
        new Error(error, destination, refId).log();

        setTimeout(async function send() {
            try {
                isSmsSuccessSended = await sendMessage(message, number, url, refId);
                if (isSmsSuccessSended) {
                    log.info(`SUCCESS - Пере${destination}; REQUISITE: ${number}`, refId);
                    return true;
                }
            } catch (error) {
                new Error(error, `Пере${destination}`, refId).log();
            }
        }, 1000 * 60 * 3);
    }
}

exports.verifyPhoneNumberSms = async function (form, code, refId) {
    const destination = 'отправка СМС с уведомлением о заявке клиенту на новый номер телефона';
    let number, url, message;

    try {
        number = form.phoneNumber;
        url = conf.main.smsSenderUrl;
        message = `${conf.messages.verifyPhoneNumberSms[form.lang]} ${code}`
        log.debug(`Функция verifyPhoneNumberSms сгенерировала текст сообщения: ${message}`, refId);

    } catch (error) {
        throw new Error(error, 'Получение номера телефона, текста сообщения и URL', refId);
    }
    try {
        const isSmsSuccessSend = await sendMessage(message, number, url, refId);
        log.info(`SUCCESS - ${destination}; REQUISITE: ${number}`, refId);
        if (isSmsSuccessSend) return isSmsSuccessSend

        return false;
    } catch (error) {
        new Error(error, destination, refId).log();

        setTimeout(async function send() {
            try {
                await sendMessage(message, number, url, refId);
                log.info(`SUCCESS - Пере${destination}; REQUISITE: ${number}`, refId);
            } catch (error) {
                new Error(error, `Пере${destination}`, refId).log();
            }
        }, 1000 * 60 * 3);
    }
}
