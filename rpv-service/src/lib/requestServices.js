const https = require('https');
const axios = require('axios').default;
const converter = require('xml-js');
const moment = require('moment');

const log = require('./std/log');
const conf = require('./std/conf');
const { Error } = require('./std/errors');

const uuidbase62 = require('uuid-base62');

async function getXmlDataFromGrs(form, refId) {
    try {
        let stan = uuidbase62.v4();
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <request>
            <method name="GetClientInfo" stan="121212">
                <parameters>
                    <pin>${form.pin}</pin>
                    <number>${form.passport}</number>
                    <series>${form.series}</series>
                </parameters>
            </method>
        </request>`;
        log.debug(
            `Функция getGrsData отправила запрос на URL: ${conf.services.grs.url}; ID запроса: ${stan}; inn клиента ${form.pin}`,
            refId,
        );
return (await axios.post(conf.services.grs.url, xml, {
   ...conf.services.grs.config, 
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    }),
})).data;
    } catch (error) {
        throw new Error(JSON.stringify(error), 'Получение клиентских данных (в формате XML) из БД ГРС', refId);
    }
}

function getCleanAbsData(absResponseJson, refId) {
    try {
        return {
            fullName: absResponseJson.fullName['_text'],
            passportSeries: absResponseJson.paperSeries['_text'],
            passportNumber: absResponseJson.paperNumber['_text'],
            passportInn: absResponseJson.inn['_text'],
            birthDate: absResponseJson.birthdate['_text'],
            isResident: absResponseJson.resident['_text'],
        };
    } catch (error) {
        throw new Error(
            error,
            `Очистка паспортных данных(JSON) клиента из БД АБС; [REQUISITE] ${JSON.stringify(absResponseJson)}`,
            refId,
        );
    }
}

async function getClientDataFromAbs(form, refId) {
    try {
        let absResponseXml, absResponseJson;

        absResponseXml = await getXmlDataFromGrs(form, refId);
        log.debug(`Функция getXmlDataFromGrs вернула данные в XML:\n\n${absResponseXml}\n\n`, refId);

        let absResponseParsed = JSON.parse(converter.xml2json(absResponseXml, { compact: true }));
        log.debug(`Паспортные данные после парсинга (XML -> JSON):\n\n${JSON.stringify(absResponseParsed)}\n\n`, refId);

        absResponseJson = absResponseParsed.methodResponse.data;
        log.debug(`Паспортные данные подлежащие проверке:\n\n${JSON.stringify(absResponseJson)}\n\n`, refId);

        if (Object.keys(absResponseJson).length === 0) {
            log.info(`[FAIL] Клиент с введенным ID отсутствует в БД АБС; [REQUISITE]: ${form.idCode}`, refId);
            return;
        }
        return getCleanAbsData(absResponseJson, refId);
    } catch (error) {
        throw new Error(error, 'Получение паспортных данных клиента и парсинг (XML -> JSON)', refId);
    }
}

function convertCyrillicToLatin(word, refId) {
    try {
        let correctWord = word.split('');
        let wordLength = correctWord.length;

        for (let i = 0; i < wordLength; i++) {
            switch (correctWord[i]) {
                case 'А':
                    correctWord[i] = 'A';
                    break;
                case 'И':
                    correctWord[i] = 'N';
                    break;
                case '№':
                    correctWord[i] = 'N';
            }
        }

        return correctWord.join('');
    } catch (error) {
        throw new Error(error, `Подготовка паспортных данных перед проверкой; [REQUISITE] ${word}`, refId);
    }
}

function prepareDataToComparing(form, absData, refId) {
    try {
        if (absData.isResident == 1) {
            if (
                !absData.passportSeries ||
                !absData.passportNumber ||
                !absData.passportInn ||
                !absData.fullName ||
                !absData.birthDate
            ) {
                log.info(
                    `[FAIL] Проверка на наличие необходимых полей клиентских данных из АБС; [REQUISITE] ${JSON.stringify(
                        absData,
                    )}`,
                    refId,
                );
                return false;
            }
        } else if (absData.isResident == 0) {
            if (!absData.passportSeries || !absData.passportNumber || !absData.fullName || !absData.birthDate) {
                log.info(
                    `[FAIL] Проверка на наличие необходимых полей клиентских данных из АБС; [REQUISITE] ${JSON.stringify(
                        absData,
                    )}`,
                    refId,
                );
                return false;
            }
        }

        form.fullName = form.lastName + ' ' + form.firstName;
        if (form.secondName) form.fullName = form.fullName + ' ' + form.secondName;

        let absPassportSeriesNumber = absData.passportSeries + '' + absData.passportNumber;

        absData.passportSeriesNumber = convertCyrillicToLatin(absPassportSeriesNumber, refId);
        form.passportSeriesNumber = convertCyrillicToLatin(form.passportSeriesNumber, refId);

        return true;
    } catch (error) {
        throw new Error(error, 'Приведение клиентских данных из формы и БД АБС к единому формату для проверки', refId);
    }
}

function getNotEqualField(form, absData, refId) {
    const destination = 'Проверка паспортных данных клиента';
    let propsForChecking;
    try {
        let absBirthDate = moment(absData.birthDate, 'YYYY-MM-DD');
        let formBirthDate = moment(form.birthDate, 'DD.MM.YYYY');

        if (!absBirthDate.isSame(formBirthDate)) {
            let requisite = `Дата рождения из формы: ${JSON.stringify(formBirthDate)} ; из БД АБС: ${JSON.stringify(
                absBirthDate,
            )}`;
            log.info(`[FAIL] ${destination}; [REQUISITE] ${requisite}`, refId);
            return 'birthDate';
        }

        if (absData.isResident == 1 || isNotResidetButEnteredInn(absData, form)) {
            propsForChecking = ['fullName', 'passportInn', 'passportSeriesNumber'];
        } else propsForChecking = ['fullName', 'passportSeriesNumber'];

        const cleaningPattern = /[^A-ZА-Я\d]/g;

        for (let prop of propsForChecking) {
            const formPropValue = form[prop].toUpperCase().replace(cleaningPattern, '');
            let absPropValue = absData[prop];
            if (absPropValue){
             absPropValue = absData[prop].toUpperCase().replace(cleaningPattern, '');
            }

            if (formPropValue !== absPropValue) {
                log.info(
                    `[FAIL] ${destination}; [REQUISITE] ${prop} из формы: ${formPropValue} ; из БД АБС: ${absPropValue}`,
                    refId,
                );
                return prop;
            }
        }
    } catch (error) {
        throw new Error(error, destination, refId);
    }

    function isNotResidetButEnteredInn(absData, form) {
        return absData.isResident == 0 && form['passportInn'].trim().length > 0;
    }
}

async function getCardDataFromAbs(form, refId) {
    try {
        log.debug(`Функция getXmlCardData посылает запрос на URL: ${conf.main.absCardUrl}/${form.idCode}`, refId);

        const { data } = await axios({
            method: 'POST',
            url: conf.main.absCardUrl + form.idCode,
            timeout: 5000,
            proxy: false,
            headers: {
                'Content-Type': 'application/json',
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });

        log.debug(
            `Запрос на URL: ${conf.main.absCardUrl} вернул данные по картам:\n ${JSON.stringify(data, null, 4)}`,
            refId,
        );

        if (Array.isArray(data)) {
            return data;
        }

        return [];
    } catch (error) {
        throw new Error(error, 'Получение данных по картам клиента из БД АБС', refId);
    }
}

module.exports = {
    getClientDataFromAbs,
    getCardDataFromAbs,
    prepareDataToComparing,
    getNotEqualField,
};
