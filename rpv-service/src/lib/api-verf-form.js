const dataChecker = require('./data-checker');
const optimaCheker = require('./optima-checker')
// const jiraConnector = require('./jira-connector');
const conf = require('./std/conf');
const restApi = require('./std/rest-api');
const { Error } = require('./std/errors');
const log = require('./std/log');
const smsSender = require('./sms-sender');

async function uploadVerificationFormdata(urlParams, bodyParams, headerParams, accessMode, refId, callback) {
    let form = bodyParams;
    try {
        log.info(`[SUCCESS] Получена форма [REQUISITE] ${JSON.stringify(form)}`, refId);

        log.debug('==================================== ЭТАП БАЗОВОЙ ПРОВЕРКИ НАЧАЛСЯ ===================================================', refId);

        let isFormChecked = dataChecker.checkFormProperties(form, refId);
        log.debug(`Функция checkFormProperties вернула: ${isFormChecked}`, refId);

        if (!isFormChecked) {
            callback(null, { message: conf.messages.dataNotPresent[form.lang], ok: false }, 400);
            return;
        }

        // log.debug(`Форма после обработки функией checkFormProperties: ${JSON.stringify(form)}`, refId);

        // let isPhotosChecked = dataChecker.checkFormPhotos(form, refId);
        // log.debug(`Функция checkFormPhotos вернула: ${isPhotosChecked}`, refId);

        // if (!isPhotosChecked) {
        //     callback(null, { message: conf.messages.photosNotPresent[form.lang], ok: false }, 400);
        //     return;
        // }

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
        let isNumberDoesntExist = await optimaCheker.isNewNumberExistInOoptima24(form.newNumber, refId)
        log.debug(`Функция isNumberDoesntExist вернула сообщение ${isNumberDoesntExist}.`, refId);
        if (isNumberDoesntExist) {
            callback(null, { message: conf.messages.isNumerAlreadyRegistered[form.lang], ok: false }, 400);
            return;
        }
        log.debug('==================================== ЭТАП ПРОВЕРКИ НОМЕРА НА СУЩЕСТВОВАНИЕ В ОПТИМА24 УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПОДТВЕРЖДЕНИЯ НОМЕРА ТЕЛЕФОНА НАЧАЛСЯ ================================', refId);

        let isConfirmedNumber = await dataChecker.hashAndCodeIsSameChangePhone(form, refId)
        log.debug(`Функция hashAndCodeIsSameChangePhone вернула сообщение ${isConfirmedNumber}.`, refId);
        if (!isConfirmedNumber) {
            setTimeout(function res() {
                callback(null, { message: conf.messages.verifyFailed[form.lang], ok: false }, 400);
                return;
            }, 5000);
            return;
        }

        log.debug('==================================== ЭТАП ПОДТВЕРЖДЕНИЯ НОМЕРА УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ ДУБЛИРУЮЩЕЙСЯ ЗАЯВКИ НАЧАЛСЯ ================================', refId);

        let checkDuplicateIssueMessage = await dataChecker.isNotDuplicateChangePhoneForm(form, refId)
        log.debug(`Функция isNotDuplicate вернула сообщение ${checkDuplicateIssueMessage}.`, refId);
        if (checkDuplicateIssueMessage) {
            callback(null, { message: checkDuplicateIssueMessage, ok: false }, 400);
            return;
        }

        log.debug('==================================== ЭТАП ПРОВЕРКИ ДУБЛИРУЮЩЕЙСЯ ЗАЯВКИ УСПЕШНО ЗАВЕРШЕН ================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ НАЛИЧИЯ КАРТ НАЧАЛСЯ ==============================================', refId);

        let isClientHasActiveCard = await dataChecker.checkCardDataFromAbs(form, refId);
        log.debug(`Функиция checkCardDataFromAbs вернула ${isClientHasActiveCard}`, refId);
        if (!isClientHasActiveCard) {
            callback(null, { message: conf.messages.cardIsNotPresent[form.lang], ok: false }, 400);
            return;
        }

        log.debug('==================================== ЭТАП ПРОВЕРКИ НАЛИЧИЯ КАРТ УСПЕШНО ЗАВЕРШЕН =====================================', refId);
        log.debug('==================================== ЭТАП ПРОВЕРКИ ТЕКУЩЕГО НОМЕРА НАЧАЛСЯ ===========================================', refId);

        let currentNumberCheckingMessage = await dataChecker.checkCurrentNumberWithOptima(form, refId);
        log.debug(`Функция checkCurrentNumberWithOptima вернула сообщение ${currentNumberCheckingMessage}. Undefined - означет что все ОК`, refId);
        if (currentNumberCheckingMessage) {
            callback(null, { message: currentNumberCheckingMessage, ok: false }, 400);
            return;
        }

        log.debug('==================================== ЭТАП ПРОВЕРКИ ТЕКУЩЕГО НОМЕРА УСПЕШНО ЗАВЕРШЕН ==================================', refId);
        log.debug('==================================== ЭТАП СОЗДАНИЯ ЗАЯВКИ В JIRA НАЧАЛСЯ =============================================', refId);

        // let jiraIssueKey = await jiraConnector.createIssueWithAttachments(form, refId);
        log.debug(`Функция createIssueWithAttachments вернула ключ заявки: ${jiraIssueKey}`, refId);
        form.appCode = jiraIssueKey;

        log.debug('==================================== ЭТАП СОЗДАНИЯ ЗАЯВКИ В JIRA УСПЕШНО ЗАВЕРШЕН ====================================', refId);
        log.debug('==================================== ЭТАП ОТПРАВКИ СМС КЛИЕНТУ НАЧАЛСЯ ===============================================', refId);

        let sms = conf.messages.applicationCodeSms[form.lang];
        let indexOfSign = sms.indexOf('№');
        let commentText = sms.slice(0, indexOfSign + 1) + ' ' + form.appCode + sms.slice(indexOfSign + 2);

        const isSmsSuccessSended = await smsSender.sendMessageToClient(form);
        // const isSmsSuccessSendedOldPhone = await smsSender.sendMessageToClientOldPhone(form)

        if (isSmsSuccessSended) {
            log.debug(`Клиенту на новый номер: ${form.newNumber} отправлено сообщение с текстом: "${commentText}"`, refId);
            let message = `Клиенту на номер: ${form.newNumber} отправлено сообщение с текстом: "${commentText}".`
            // await jiraConnector.addCommentToIssue(jiraIssueKey, message);
        }
        else {
            log.debug(`Сообщение "${commentText}" на новый номер клиента "${form.newNumber}" не было отпавлено.`, refId);
            message = `(!){color:#DE350B}Сообщение "${commentText}" на новый номер клиента "${form.newNumber}" не было отпавлено.`

            // await jiraConnector.addCommentToIssue(jiraIssueKey, message);
        }

        // if (isSmsSuccessSendedOldPhone) {
        //     log.debug(`Клиенту на старый номер:${form.newNumber} отправлено сообщение с текстом: "${conf.messages.smsToClientBeforeChangePhone[form.lang]}"`, refId);
        //     let message = `На старый номер телефона: ${form.currentNumber} было отправлено сообщение с текстом:"${conf.messages.smsToClientBeforeChangePhone[form.lang]}"`

        //     await jiraConnector.addCommentToIssue(jiraIssueKey, message);
        // }
        // else {
        //     log.debug(`Сообщение "${conf.messages.smsToClientBeforeChangePhone[form.lang]}" клиенту на старый номер "${form.currentNumber}" не было отправлено.`, refId);
        //     message = `(!){color:#DE350B} Сообщение "${conf.messages.smsToClientBeforeChangePhone[form.lang]}" клиенту на старый номер "${form.currentNumber}" не было отправлено.`
        //     await jiraConnector.addCommentToIssue(jiraIssueKey, message);
        // }

        log.debug('==================================== ЭТАП ОТПРАВКИ СМС КЛИЕНТУ ЗАВЕРШЕН ======================================', refId);

        callback(null, { message: conf.messages.applicationAccepted[form.lang], ok: true }, 200);
        // callback(null, { message: commentText, ok: true }, 200);
    }
    catch (error) {
        log.error(`Сообщение Ошибка в uploadFormdata "${JSON.stringify(error)}".`, refId);
        callback(null, { message: conf.messages.serviceNotAvailable[form.lang], ok: false }, 400);
    }
}

restApi.apiFuncs['uploadVerificationFormdata'] = uploadVerificationFormdata;