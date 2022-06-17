const pg = require('pg');

const log = require('../std/log');
const conf = require('../std/conf');
const Error = require('../std/errors').Error;

class PostgresDriverAdapter {
    constructor(
        options = conf.main.pgConfig
    ) {
        this.connection_string = `postgres://{}@${options.host}:${options.port}/${options.database}?schema=${options.schema}`;
        this.client = new pg.Client(options);
    }

    async connect() {
        try {
            await this.client.connect();
            return this.client;
        } catch (e) {
            console.log(e.message);
            throw new Error(e, `[${this.connection_string}] Ошибка подключения к PostgresDB: ${e.message}`);
        }
    }
}

exports.init = async function () {
    try {
        const pg = new PostgresDriverAdapter(conf.db);

        log.info(`[${pg.connection_string}] Подключение к postgres. `);
        exports.dbClient = await pg.connect();
        exports.dbClient.on('error', e => {
            log.error(`Перехвачена ошибка node-pg: ${e.message}`, e);
        });
        log.info(`[${pg.connection_string}] Соединение с postgres установлено .`);
    } catch (e) {
        console.log(e.message);
        throw new Error(e, `Инициализация подсистем БД`);
    }
};

exports.createQueryOptions = function (object) {
    return Object.entries(object).reduce(
        (acc, currentValue) => {
            const [column, value] = currentValue;

            acc.columns.push(column);
            acc.values.push(value);

            return acc;
        },
        { columns: [], values: [] },
    );
};

exports.joinSqlParams = function (params = [''], withValues = false) {
    if (withValues) {
        return params
            .map((_, i) => '$'.concat(i + 1))
            .join(', ')
            .substring(-2);
    }
    return params.join(', ').substring(-2);
};