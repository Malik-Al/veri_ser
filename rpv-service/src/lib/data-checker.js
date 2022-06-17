const absChecker = require('./requestServices');
const optimaCheker = require('./optima-checker');
const log = require('./std/log');
const conf = require('./std/conf');
const { Error } = require('./std/errors');
const cryptoJS = require('crypto-js');

exports.checkFormPropertiesRegistr = function (form, refId) {
    try {
        const default_lang = 'RU';

        if (!form.lang) form.lang = default_lang;
        else form.lang = form.lang.toUpperCase();

        if (form.lang !== 'RU' && form.lang !== 'KG') form.lang = default_lang;

        const propsForChecking = [
            'surname',
            'name',
            'name',
            'secondName',
            'gender',
            'birthDate',
            'passportSeriesNumber',
            'passportInn',
            'phoneNumber',
            'contact',
            'hashKey',
            'verificationCode',
            'socialAccount',
        ];

        for (let prop of propsForChecking) {
            if (!form[prop]) {
                log.info(`[FAIL] Проверка обязательных полей. [REQUISITE] В форме отсутствует ${prop}`, refId);
                return false;
            }
        }

        return true;
    } catch (error) {
        throw new Error(error, 'Проверка обязательных полей', refId);
    }
};

exports.checkFormProperties = function (form, refId) {
    try {
        const default_lang = 'RU';

        if (form.lang === '') form.lang = default_lang;
        else form.lang = form.lang.toUpperCase();

        if (form.lang !== 'RU' && form.lang !== 'KG') form.lang = default_lang;

        const propsForChecking = [
            'gender',
            'name',
            'surname',
            'passportSeriesNumber',
            'birthDate',
            'passportInn',
            'currentNumber',
            'currentNumber',
            'passportSeries',
        ];
        for (let prop of propsForChecking) {
            if (!form[prop]) {
                log.info(`[FAIL] Проверка обязательных полей. [REQUISITE] В форме отсутствует ${prop}`, refId);
                return false;
            }
        }

        return true;
    } catch (error) {
        throw new Error(error, 'Проверка обязательных полей', refId);
    }
};

exports.checkFormPhotos = function (form, refId) {
    try {
        if (form.uploadedFiles === '{}') {
            log.info(
                `[FAIL] Проверка наличия фотографий паспорта в форме. [REQUISITE] Uploaded files: ${form.uploadedFiles}`,
                refId,
            );
            return false;
        }

        log.debug(`Функция checkFormPhotos парсит в JSON следующие uploaded files : ${form.uploadedFiles}`, refId);
        let parsedPhotos = JSON.parse(form.uploadedFiles);
        log.debug('Результат парсинга фоток: ' + JSON.stringify(parsedPhotos), refId);

        if (!parsedPhotos.first_pic || !parsedPhotos.second_pic) {
            log.info(
                '[FAIL] Проверка наличия фотографий паспорта в форме. Не хватает одного из файлов "first_pic" или "second_pic"',
                refId,
            );
            return false;
        }

        let photosArr = [parsedPhotos.first_pic, parsedPhotos.second_pic];
        log.debug(`Массив из объектов фотографий после парсинга ${JSON.stringify(photosArr)}`, refId);

        for (let photo of photosArr) {
            let keys = Object.keys(photo);
            if (
                !keys.includes('size') ||
                !keys.includes('path') ||
                !keys.includes('name') ||
                !keys.includes('type') ||
                !keys.includes('mtime')
            ) {
                log.info(
                    '[FAIL] Проверка полноты объектов фотографий. Отсутствует один из параметров [size, path, name, type, mtime]',
                    refId,
                );
                return false;
            }
        }

        form.photos = photosArr;
        delete form.uploadedFiles;

        return true;
    } catch (error) {
        throw new Error(
            error,
            'Парсинг и проверка на наличие файлов, вложенных в форму. Замена uploaded files на photos',
            refId,
        );
    }
};

exports.hashAndCodeIsSame = async function (form, refId) {
    try {
        log.debug(
            `Функция hashAndCodeIsSame получила значение кода: ${form.verificationCode}, и хэша: ${form.hashKey}`,
            refId,
        );
        let toCompare = form.verificationCode + form.phoneNumber;

        const decrypt = cryptoJS.AES.decrypt(form.hashKey, conf.main.chiperKey);
        const decrypted = decrypt.toString(cryptoJS.enc.Utf8);

        if (decrypted == toCompare) return true;
        else return false;
    } catch (error) {
        throw new Error(error, 'Проверка на соответствие хэша и кода подтверждения для номер телефона', refId).log();
    }
};

exports.hashAndCodeIsSameChangePhone = async function (form, refId) {
    try {
        log.debug(
            `Функция hashAndCodeIsSame получила значение кода: ${form.verificationCode}, и хэша: ${form.hashKey}`,
            refId,
        );
        let toCompare = form.verificationCode + form.newNumber;

        const decrypt = cryptoJS.AES.decrypt(form.hashKey, conf.main.chiperKey);
        const decrypted = decrypt.toString(cryptoJS.enc.Utf8);

        if (decrypted == toCompare) return true;
        else return false;
    } catch (error) {
        throw new Error(error, 'Проверка на соответствие хэша и кода подтверждения для номер телефона', refId).log();
    }
};

exports.checkClientStatusWithOptima = async function (form, refId) {
    try {
        let clientStatus = await optimaCheker.isRegisteredInOptima24(form, refId);
        log.debug('Функция checkClientStatusWithOptima вернула значение: ' + clientStatus, refId);
        if (clientStatus === 1) return conf.messages.preRegistration[form.lang];
        else if (clientStatus === 2) return conf.messages.active[form.lang];
        else if (clientStatus === 3) return conf.messages.blocked[form.lang];
        else return false;
    } catch (error) {
        throw new Error(error, 'Проверка статуса пользователя в БД Оптима24', refId);
    }
};

exports.checkCurrentNumberWithOptima = async function (form, refId) {
    try {
        let optimaCurrentNumber = await optimaCheker.getCurrentNumberFromOptima24(form, refId);
        log.debug('Функция getCurrentNumberFromOptima24 вернула значение: ' + optimaCurrentNumber, refId);
        if (!optimaCurrentNumber) return conf.messages.incorrectField['idCode'][form.lang];

        log.debug(
            `В функцию isCurrentNumberCorrect переданы параметры ${form.currentNumber} ; ${optimaCurrentNumber}`,
            refId,
        );
        let isCurrentNumberCorrect = optimaCheker.isCurrentNumberCorrect(
            form.currentNumber,
            optimaCurrentNumber,
            refId,
        );
        log.debug(`Функция isCurrentNumberCorrect вернула значение ${isCurrentNumberCorrect}`, refId);
        if (!isCurrentNumberCorrect) return conf.messages.incorrectField['currentNumber'][form.lang];
    } catch (error) {
        next(
            Error(error, 'Проверка текущего номера из формы на соответствие с текущим номером из БД Оптима24', refId),
        ).log();
    }
};

exports.checkCardDataFromAbs = async function (form, refId) {
    try {
        let cardData = await absChecker.getCardDataFromAbs(form, refId);

        if (!cardData.length) {
            log.info(`Функция getCardDataFromAbs вернула значение ${JSON.stringify(cardData)}`, refId);
            return false;
        }

        const cards = cardData
            .filter(card => card?.trim)
            .map(potentialCard => potentialCard.replace(/\D/g, ''))
            .filter(word => word.length === 16);

        log.debug(`Результат парсинга полученных карт: ${JSON.stringify(cards)}`, refId);

        return cards.length > 0;
    } catch (error) {
        throw new Error(error, 'Получение данных по картам клиента из АБС и проверка на наличие активных карт ', refId);
    }
};
exports.checkFormPassportDataWithAbs = async function (form, refId) {
    const destination = 'Получение и проверка паспортных данных клиента из базы данных АБС';

    try {
        let absData = await absChecker.getClientDataFromAbs(form, refId);
        log.debug(`Функция getClientDataFromAbs вернула:\n\n${JSON.stringify(absData)}\n\n`, refId);
        if (!absData) return conf.messages.incorrectField.idCode[form.lang];

        let isDataReadyToComparing = absChecker.prepareDataToComparing(form, absData, refId);
        if (!isDataReadyToComparing) return conf.messages.dataNotPresent[form.lang];

        let notEqualField = absChecker.getNotEqualField(form, absData, refId);
        if (notEqualField) return conf.messages.incorrectField[notEqualField][form.lang];

        log.info(`SUCCESS - ${destination}; REQUISITE: ${JSON.stringify(absData)}`, refId);
    } catch (error) {
        throw new Error(error, destination, refId);
    }
};
