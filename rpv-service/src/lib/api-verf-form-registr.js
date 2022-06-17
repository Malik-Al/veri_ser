const dataChecker = require('./data-checker');
const optimaCheker =  require('./optima-checker');
const { phoneRegexValidate } = require('./check-phone')
const smsSender = require('./sms-sender');
const conf = require('./std/conf');
const restApi = require('./std/rest-api');
const { Error } = require('./std/errors');
const log = require('./std/log');

async function uploadFormdataRegistr(urlParams, bodyParams, headerParams, accessMode, refId, callback) {
    let form = bodyParams;
    try {
        log.info(`[SUCCESS] Получена форма [REQUISITE] ${JSON.stringify(form)}`, refId);

        log.debug('==================================== ЭТАП БАЗОВОЙ ПРОВЕРКИ НАЧАЛСЯ ===================================================', refId);

        let isFormChecked = dataChecker.checkFormPropertiesRegistr(form, refId);
        log.debug(`Функция checkFormPropertiesRegistr вернула: ${isFormChecked}`, refId);

        if (!isFormChecked) {
            callback(null, { message: conf.messages.dataNotPresent[form.lang], ok: false }, 400);
            return;
        }

        log.debug(`Форма после обработки функией checkFormProperties: ${JSON.stringify(form)}`, refId);

        let isPhotosChecked = dataChecker.checkFormPhotos(form, refId);
        log.debug(`Функция checkFormPhotos вернула: ${isPhotosChecked}`, refId);

        if (!isPhotosChecked) {
            callback(null, { message: conf.messages.photosNotPresent[form.lang], ok: false }, 400);
            return;
        }

        let isPhoneFormatValid = await phoneRegexValidate(form.phoneNumber, refId);
        log.debug(`Функция phoneRegexValidate вернула. ${isPhoneFormatValid}`, refId);

        if (!isPhoneFormatValid) {
            callback(null, { message: conf.messages.incorrectPhoneNumberFormat[form.lang], ok: false }, 400);
            return;
        }

        log.debug(`Форма после обработки функией checkFormPhotos: ${JSON.stringify(form)}`, refId);

        log.debug('==================================== ЭТАП БАЗОВОЙ ПРОВЕРКИ УСПЕШНО ЗАВЕРШЕН ==========================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ ПАСПОРТНЫХ ДАННЫХ НАЧАЛСЯ =========================================', refId);

        let passportDataCheckingMessage = await dataChecker.checkFormPassportDataWithAbs(form, refId);
        if (passportDataCheckingMessage) {
            callback(null, { message: passportDataCheckingMessage, ok: false }, 400);
            return;
        }
        log.debug('==================================== ЭТАП ПРОВЕРКИ ПАСПОРТНЫХ ДАННЫХ УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ НОМЕРА НА СУЩЕСТВОВАНИЕ В ОПТИМА24 НАЧАЛСЯ ================================', refId);

        let isNumberDoesntExist = await optimaCheker.isNewNumberExistInOoptima24(form.phoneNumber, refId)
        log.debug(`Функция isNumberDoesntExist вернула сообщение ${isNumberDoesntExist}.`, refId);
        if (isNumberDoesntExist) {
            callback(null, { message: conf.messages.isNumerAlreadyRegistered[form.lang], ok: false }, 400);
            return;
        }
        log.debug('==================================== ЭТАП ПРОВЕРКИ НОМЕРА НА СУЩЕСТВОВАНИЕ В ОПТИМА24 УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА НАЧАЛСЯ ================================', refId);

        let isConfirmedNumber = await dataChecker.hashAndCodeIsSame(form, refId)
        log.debug(`Функция hashAndCodeIsSame вернула сообщение ${isConfirmedNumber}.`, refId);
        if (!isConfirmedNumber) {
            setTimeout(function res() {
                callback(null, { message: conf.messages.verifyFailed[form.lang], ok: false }, 400);
                return;
            }, 5000);
            return;
        }

        log.debug('==================================== ЭТАП ПОДТВЕРЖДЕНИЯ НОМЕРА УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ ДУБЛИРУЮЩЕЙСЯ ЗАЯВКИ НАЧАЛСЯ ================================', refId);

        let checkDuplicateIssueMessage = await dataChecker.isNotDuplicate(form, refId)
        log.debug(`Функция isNotDuplicate вернула сообщение ${checkDuplicateIssueMessage}.`, refId);
        if (checkDuplicateIssueMessage) {
            callback(null, { message: checkDuplicateIssueMessage, ok: false }, 400);
            return;
        }

        log.debug('==================================== ЭТАП ПРОВЕРКИ ДУБЛИРУЮЩЕЙСЯ ЗАЯВКИ УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ СТАТУСА КЛИЕНТА В ОПТИМА24 НАЧАЛСЯ ===========================================', refId);

        let clientStatusCheckingMessage = await dataChecker.checkClientStatusWithOptima(form, refId);
        log.debug(`Функция checkCurrentNumberWithOptima вернула сообщение ${clientStatusCheckingMessage}. Undefined - означет что все ОК`, refId);
        if (clientStatusCheckingMessage) {
            callback(null, { message: clientStatusCheckingMessage, ok: false }, 400);
            return;
        }
        log.debug('==================================== ТАП ПРОВЕРКИ СТАТУСА КЛИЕНТА В ОПТИМА24 УСПЕШНО ЗАВЕРШЕН ==================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ НАЛИЧИЯ КАРТ НАЧАЛСЯ ==============================================', refId);

        let isClientHasActiveCard = await dataChecker.checkCardDataFromAbs(form, refId);
        log.debug(`Функиция checkCardDataFromAbs вернула ${isClientHasActiveCard}`, refId);
        if (!isClientHasActiveCard) {
            callback(null, { message: conf.messages.cardIsNotPresent[form.lang], ok: false }, 400);
            return;
        }
        log.debug('==================================== ЭТАП ПРОВЕРКИ НАЛИЧИЯ КАРТ УСПЕШНО ЗАВЕРШЕН =====================================', refId);
        // log.debug('==================================== ЭТАП СОЗДАНИЯ ЗАЯВКИ В JIRA НАЧАЛСЯ =============================================', refId);

        // log.debug(`Функция createIssueWithAttachmentsRegistr вернула ключ заявки: ${jiraIssueKey}`, refId);
        // form.appCode = jiraIssueKey;

        // log.debug('==================================== ЭТАП СОЗДАНИЯ ЗАЯВКИ В JIRA УСПЕШНО ЗАВЕРШЕН ====================================', refId);
             log.debug('==================================== ЭТАП ОТПРАВКИ СМС КЛИЕНТУ НАЧАЛСЯ ===============================================', refId);

        // let response = conf.messages.applicationAccepted[form.lang];
        let response = conf.messages.applicationAcceptedRegistr[form.lang];
        let sms = conf.messages.applicationCodeSms[form.lang];
        let indexOfSign = sms.indexOf('№');
        // let indexOfSign = response.indexOf('№');
        // let applicationAcceptedRegistr = response.slice(0, indexOfSign + 1) + ' ' + form.appCode + response.slice(indexOfSign + 2);
        // let appResp = response.slice(0, indexOfSign + 1) + ' ' + form.appCode + response.slice(indexOfSign + 2);
        
      
        let commentText = sms.slice(0, indexOfSign + 1) + ' ' + form.appCode + sms.slice(indexOfSign + 2);
        let message;
        const isSmsSuccessSended = await smsSender.sendMessageToClientRegistr(form);
        log.debug(`Клиенту на номер: ${isSmsSuccessSended}`, refId);

        if (isSmsSuccessSended) {
            log.debug(`Клиенту на номер: ${JSON.stringify(form.phoneNumber)} отправлено сообщение с текстом: "${commentText}"`, refId);

            message = `Клиенту на номер: ${JSON.stringify(form.phoneNumber)} отправлено сообщение с текстом: "${commentText}"`
            // await jiraConn.addCommentToIssue(jiraIssueKey, message);
        }
        else {
            message = `(!){color:#DE350B} Сообщение "${commentText}" клиенту на номер "${form.phoneNumber}" не было отправлено."`
            // await jiraConn.addCommentToIssue(jiraIssueKey, message);
        }

        log.info(`[FAIL] Ошибка отправки смс клиенту клиенту. Номер:'[REQUISITE] ${form.phoneNumber}`, refId);
        log.debug('==================================== ЭТАП ОТПРАВКИ СМС КЛИЕНТУ ЗАВЕРШЕН ======================================', refId);

        callback(null, { message: response, ok: true }, 200);
        // callback(null, { message: commentText, ok: true }, 200);
    }

    catch (error) {
        new Error(error, refId).log();
        callback(null, { message: conf.messages.serviceNotAvailable[form.lang], ok: false }, 400);
    }
}


restApi.apiFuncs['uploadFormdataRegistr'] = uploadFormdataRegistr;