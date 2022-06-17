const smsSender = require('./sms-sender');
const conf = require('./std/conf');
const restApi = require('./std/rest-api');
const { Error } = require('./std/errors');
const log = require('./std/log');
const crypto = require('crypto');
const cryptoJS = require('crypto-js');

async function generateCode() {
    const buffer = await new Promise((resolve, reject) => {
        crypto.randomBytes(2, function (error, buffer) {
            if (error) {
                reject("Ошибка генерации кода");
            }
            buffer = parseInt(buffer.toString('hex'), 16).toString().substring(0, 3);
            if (buffer.length != 3) {
                buffer = parseInt(buffer.toString('hex'), 16).toString().substring(0, 3);
                resolve(buffer);
            }
            else resolve(buffer);
        });
    });
    return buffer;
}

checkFormProperties = function (form, refId) {
    try {
        const default_lang = 'RU';

        if (!form.lang) form.lang = default_lang;
        else form.lang = form.lang.toUpperCase();

        if (form.lang !== 'RU' && form.lang !== 'KG') form.lang = default_lang;

        if (!form.phoneNumber) {
            log.info(`[FAIL] Проверка обязательных полей. [REQUISITE] В форме отсутствует номер телефона`, refId);
            return false;
        }
        else return true;
    } catch (error) {
        throw new Error(error, 'Проверка обязательных полей', refId);
    }
}

exports.phoneRegexValidate = async function (phoneNumber, refId) {
    log.debug(`Функция phoneRegexValidate получила номер телефона: ${phoneNumber}`);
    const phoneValidate = "^['+']{1}?[0-9]{5,}$";

    const numberIsCorrect = phoneNumber.match(phoneValidate);
    if (numberIsCorrect) return true;
    else return false;
}

function encrypt(toEncrypt) {
    const encrypted = cryptoJS.AES.encrypt(toEncrypt, conf.main.chiperKey);
    return encrypted.toString();
}

function decrypt(toDecrypt, refId) {
    try {
        const decrypt = cryptoJS.AES.decrypt(toDecrypt, conf.main.chiperKey);
        return decrypt.toString(cryptoJS.enc.Utf8);
    } catch (error) {
        throw new Error(error, 'Ошибка при дешифровке', refId).log();
    }
}



async function checkPhone(urlParams, bodyParams, headerParams, accessMode, refId, callback) {
    let form = bodyParams;
    try {
        let hasNumber = checkFormProperties(form, refId)
        log.debug(`Функция checkFormProperties вернула: ${hasNumber}`, refId);

        if (!hasNumber) {
            callback(null, { message: conf.messages.verifyFieldIEmpty[form.lang], ok: false }, 400);
            return;
        }
        const checkPhoneFormat = await exports.phoneRegexValidate(form.phoneNumber, refId);
        log.debug(`Функция phoneRegexValidate вернула. ${checkPhoneFormat}`, refId);

        if (!checkPhoneFormat) {
            callback(null, { message: conf.messages.incorrectPhoneNumberFormat[form.lang], ok: false }, 400);
            return;
        }

        log.info(`[SUCCESS] получен номер телефона с формы'[REQUISITE] ${JSON.stringify(form.phoneNumber)}`, refId);

        if (form.resendVerificationCode) {
            log.debug('========== ЭТАП ПОТВОРНОЙ ОТПРАВКИ КОДА ДЛЯ ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА =============', refId);

            let toDecrypt = decrypt(form.resendVerificationCode, refId);
            let resendCode = toDecrypt.substring(0, 3);

            const isSmsSuccessSended = await smsSender.verifyPhoneNumberSms(form, resendCode, refId);

            if (isSmsSuccessSended) {
                log.info(`[SUCCESS] Код подтверждения успешно переотправлен клиенту'[REQUISITE] ${JSON.stringify(resendCode)} шифр ${form.resendVerificationCode}`, refId);
                log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ ШИФРА ДЛЯ ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА УСПЕШНО ЗАВЕРШЕН =============', refId);

                callback(null, { 'hash': form.resendVerificationCode }, 200);
                return;
            }
            else {
                log.info(`[FAIL] Ошибка переотправки кода клиенту. Номер:'[REQUISITE] ${form.phoneNumber}`, refId);
                log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ ШИФРА ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА ПРОВАЛЕН =============', refId);
                callback(null, { message: conf.messages.serviceNotAvailable[form.lang], ok: false }, 400);
                return;
            }
        }

        log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ КОДА ДЛЯ ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА =============', refId);

        const codeToSend = await generateCode();
        isSmsSuccessSended = await smsSender.verifyPhoneNumberSms(form, codeToSend, refId);

        log.debug(`Функция isSmsSuccessSended вырунула: ${isSmsSuccessSended}`, refId);

        if (isSmsSuccessSended) {
            log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ КОДА ДЛЯ ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА УСПЕШНО ЗАВЕРШЕН =============', refId);
            log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ ШИФРА ДЛЯ ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА =============', refId);

            let toEncrypt = codeToSend + form.phoneNumber;
            let encryptToSend = encrypt(toEncrypt);

            callback(null, { 'hash': encryptToSend }, 200);

            log.info(`[SUCCESS] Код подтверждения успешно сгенерирован и отправлен клиенту'[REQUISITE] ${codeToSend} хэш ${encryptToSend}`, refId);
            log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ ШИФРА ДЛЯ ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА УСПЕШНО ЗАВЕРШЕН =============', refId);
        } else {
            log.info(`[FAIL] Ошибка отправки кода клиенту. Номер:'[REQUISITE] ${form.phoneNumber}`, refId);
            log.debug('========== ЭТАП ФОРМИРОВАНИЯ И ОТПРАВКИ ШИФРА ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА ПРОВАЛЕН =============', refId);
            callback(null, { message: conf.messages.serviceNotAvailable[form.lang], ok: false }, 400);
            return;
        }

    } catch (error) {
        new Error(error, 'message', refId).log();
        callback(null, { message: conf.messages.serviceNotAvailable[form.lang], ok: false }, 400);
        return;
    }
}

async function checkCode(urlParams, bodyParams, headerParams, accessMode, refId, callback) {
    let form = bodyParams;
    const default_lang = 'RU';

        if (!form.lang) form.lang = default_lang;
        else form.lang = form.lang.toUpperCase();

        if (form.lang !== 'RU' && form.lang !== 'KG') form.lang = default_lang;
    try {
        log.debug(
            `Функция checkCode получила значение кода: ${form.verificationCode}, и хэша: ${form.hashKey}`,
            refId,
        );
        let toCompare = form.verificationCode + form.phoneNumber;

        const decrypt = cryptoJS.AES.decrypt(form.hashKey, conf.main.chiperKey);
        const decrypted = decrypt.toString(cryptoJS.enc.Utf8);

        if (decrypted == toCompare) {
            callback(null, {ok: true}, 200);
            return;
        }
        else {
            callback(null, { message: conf.messages.verifyFailed[form.lang], ok: false }, 400);
        };
    } catch (error) {
        callback(null, { message: conf.messages.serviceNotAvailable[form.lang], ok: false }, 500);
        throw new Error(error, 'Проверка на соответствие хэша и кода подтверждения для номер телефона', refId).log();
    }
};


restApi.apiFuncs['checkPhone'] = checkPhone;
restApi.apiFuncs['checkCode'] = checkCode;

