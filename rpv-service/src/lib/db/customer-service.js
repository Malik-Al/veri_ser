// const Error = require('../std/errors');
// const log = require('../std/log');
const {createQueryOptions, joinSqlParams} = require('./db-connection')

const {Client} = require('pg')

const dbClient = new Client({
    host: '10.185.233.241',
    port: '5432',
    user: 'dan',
    password: 'dan',
    database: 'rpv_service',
    schema: "main",
})

async function crateCustomer(form, refId) { // создание пользователя
    try {
        console.log('========================= Создание нового пользователя ======================================');
        form.ref_id = refId
        const { columns, values } = createQueryOptions(form);
        await dbClient.connect();
        const customerGet = await getOneCustomer(form) // поиск пользователя в базе
        if(!customerGet){
            const customer = await dbClient.query(`INSERT INTO main.customers(${joinSqlParams(columns)}, request_at)  VALUES (${joinSqlParams(values, true)}, NOW()) RETURNING *`, values);
            await createJournaLogs(form, customer) // создание лог журнала
            await dbClient.end()
            console.log('========================= Создание нового пользователя прошло успешно ========================');
            return customer.rows[0].ref_id; // ref_id
        }else{
            console.log('========================= Есть пользователь c такими данными в базе ==========================');
            await updateCustomer(form, refId)
            await dbClient.end()
        }
    } catch (e) {
        throw new Error(e, `[crateCustomer] create Error: ${e.message}`, refId);
    }
}

async function createJournaLogs(form, customer_id){// создание лог журнала
    try{
        console.log('========================= Создание журнал пользователя ==========================================');
        let journal = {}
        journal.ref_id = form.ref_id
        journal.photo_coincidence = form.photo_coincidence
        journal.doc_coincidence = form.doc_coincidence
        journal.liveness_coincidence = form.liveness_coincidence
        journal.result_verification = form.result_verification
        journal.offer_version = form.offer_version 
        journal.offer_confirm = form.offer_confirm ?? true
        journal.device_id = form.device_id,
        journal.has_product = form.has_product,
        journal.confirmed_in_efr = form.confirmed_in_efr,
        journal.journal_info ='journal_info'
        journal.customer_extract_id = customer_id.rows[0].customer_id 

        const { columns, values } = createQueryOptions(journal);

        console.log('========================= Создание журнал пользователя прошло успешно =============================');

        return await dbClient.query(`INSERT INTO main.journal_logs(${joinSqlParams(columns)}, created_at) VALUES (${joinSqlParams(values, true)}, NOW()) RETURNING *`, values)
    } catch (e) {
        throw new Error(e, `[createJournaLogs] create Error: ${e.message}`, form.ref_id);
    }
}

async function getOneCustomer(form){  // поиск пользователя в базе
    try{
        console.log('====================== Поиск пользователя в базе ==============================='); 
        const customer = await dbClient.query(`SELECT * FROM main.customers WHERE pin ='${form.pin}'`)
        if(!customer.rows[0]){
            console.log('====================== Нет такого пользователя в базе  ==============================='); 
            return false
        }else{
            console.log('====================== Поиск пользователя в базе прошло успешно ==============================='); 
            // console.log('customer.rows[0]', customer.rows[0]);
            return customer.rows[0] // GetOne
        }
    }catch(e){
        throw new Error(e, `[getOneCustomer] get Error: ${e.message}`, form.pin);
    }
}


async function updateCustomer(form, refId){ // обновления пользователя
    try{
        console.log('====================================== Обновление данных пользователя ================================'); 
        form.ref_id = refId
        const { columns, values } = createQueryOptions(form);
        const customer = await dbClient.query(`UPDATE main.customers SET (${joinSqlParams(columns)}) = (${joinSqlParams(values, true)}), count_verification = count_verification + 1, request_at = NOW() WHERE pin = '${form.pin}' RETURNING *`, values);
        console.log('========================== Обновление данных пользователя прошло успешно ============================='); 
        return await createJournaLogs(form, customer)
    }catch(e){
        throw new Error(e, `[updateCustomer] get Error: ${e.message}`, refId);
    }
}



const form = {
    name: "Bob",
    surname: "Bobov",
    second_name: "Bobovich",
    gender: "M",
    pin: "MK1995", // INN
    birth_date: "1994г 6 мая",
    passport_series: "ID", /* ID или MK */
    passport_number: "KGZSN434" , /* родолжения серий паспорта 5 или 7 значное числа в зависимости от образца паспорта*/
    passport_void_status: "актуальный", /* актуальный/ неактуальный/ обновленый */
    passport_issued_date: "27-04-16", /* дата выдачи паспорта */
    passport_authority: "MKK", /* MKK */
    passport_authority_code: "55-74", /* MKK--2 203254 */
    passport_expired_date:"27-04-26", /* дата окончание */
    marital_status: "женат",
    nationality: "KG",
    resident: true,
    contact_phone: "+996553-45-45-45",
    second_phone: "+996553-46-46-46",
    address_living: "Бишкек",
    address_fact: "Моссовет000",
    department: "department",
    photo_coincidence: "совпадение",
    doc_coincidence: "doc_coincidence",
    liveness_coincidence: "liveness_coincidence",
    result_verification: true,
    client_id: "4656463HFHFGHERHRHRHR$56ghfg",
    actual_status_verification: "прошел", /* прошел, не прошел, не завершил  */
    offer_version: "v1.7",
    device_id: "234523452TRERTERTER",
    has_product: "THYWETHRETGWEHGWRTHWRTHRT",
    confirmed_in_efr: true,
    // offer_confirm: false,
}


crateCustomer(form, "0026646706")

// getOneCustomer(form)