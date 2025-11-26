//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/**
 * 03/05/23 "statusCode" removed from error in clienteV1 / clienteV2 functions
 * 10/10/23 refactror for 1 FaaS for all env system
 * 19/10/23 prep added to urls
 * 22/01/24 refactor for genero opcional
 * 23/02/24 Logs - only for DEV - added
 * 04/06/24 Nuevo comportamiento de la biometria
 *           -Add handler error code 403
 *           -Unify responses
 * 19/09/24 Se elimina función sleep(3000)
 * 14/10/24 Se incorpora el cacheo del token
 * 17/10/24 Se modifica el error 404
 * 25/10/24 Se agrega el logExecutionTime para loguear el "timeout"
 * 12/11/24 Se agrega handler del subcodigo de error 409 (DNI_MENOR)
 * 06/12/24 Se agrega ambiente MOCK
 * 04/02/25 Se agrega validacion para que no se ofusquen los uuid generados
 * 12/05/25 Se incorpora el servicio "Validar" a la FaaS de IdentificacionUniversal
 * 29/05/25 Se eliminaron los logs creados para medir tiempos de ejecucion, logs que estban duplicados y logs con informacion sensible. Se realizó mejora y limpieza de codigo para llamar a los servicios de cliente y validar y al token.
 * 01/07/25 Fix en cacheo de secrets
 * 02/07/25 Se agrega el modulo como parametro para validar
 * 23/07/25 Se agrega el campo marcaDeMigrado a la respuesta de la FaaS y limpieza de mocks dentro de la FaaS.
 */
//*********************************************************************************************************/
//******                              GLOBAL VARIABLES                                               ******/
//*********************************************************************************************************/

/************************************************/
/*                 LIBRARIES                    */
/************************************************/

const { Toolbelt } = require('lp-faas-toolbelt');
const _ = require('lodash');
const secretClient = Toolbelt.SecretClient();
const { v4: uuidv4 } = require('uuid');

/************************************************/
/*                 CONFIGURATION                */
/************************************************/

const configAll = {
    MOCK: {
        url_cliente: 'https://europe-central2-macro-350416.cloudfunctions.net/macro-mocks',
        url_base_oath: 'https://servicios-test.macro.com.ar:8080',
        url_validar: 'https://europe-central2-macro-350416.cloudfunctions.net/macro-mocks',
        env: 'test',
        envCb: 'DEV',
    },
    DEV: {
        url_cliente: 'https://servicios-test.macro.com.ar:3611',
        url_base_oath: 'https://servicios-test.macro.com.ar:8080',
        url_validar: 'https://servicios-test.macro.com.ar:4217',
        env: 'test',
        envCb: 'DEV',
    },
    PREP: {
        url_cliente: 'https://servicios-prep.macro.com.ar:3611',
        url_base_oath: 'https://servicios-prep.macro.com.ar:8080',
        url_validar: 'https://servicios-prep.macro.com.ar:4217',
        env: 'prep',
        envCb: 'PREP',
    },
    PRD: {
        url_cliente: 'https://servicios.macro.com.ar:3611',
        url_base_oath: 'https://servicios.macro.com.ar:8080',
        url_validar: 'https://servicios.macro.com.ar:4217',
        env: 'prod',
        envCb: 'PRD',
    },
};
/************************************************/
/*            CACHED SECRET VARIABLES           */
/************************************************/
/* Las credenciales se guardan en el secret storage.
Son variables para que puedan ser cacheadas*/
let credentials = {
    DEV: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
        identityOathToken: {
            token: undefined,
            expiredTime: undefined,
        },
    },
    PREP: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
        identityOathToken: {
            token: undefined,
            expiredTime: undefined,
        },
    },
    PRD: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
        identityOathToken: {
            token: undefined,
            expiredTime: undefined,
        },
    },
};

/************************************************/
/*                   CONSTANTS                  */
/************************************************/

const GENERO_ID = { M: 'M', F: 'F', NB: 'X' };
const CONFIG_COD_409 = {
    dni_duplicado: 'Numero de documento duplicado.',
    dni_menor: 'Edad minima requerida 13.',
};
const LP_CC_PATTERN =
    /(?:4[\s\.\-]*(?:\d[\s\.\-]*){12,18})|(?:[25][\s\.\-]*[1-7][\s\.\-]*(?:\d[\s\.\-]*){14,17})|(?:6[\s\.\-]*(?:0[\s\.\-]*1[\s\.\-]*1|4[\s\.\-]*[0-9][\s\.\-]*[0-9]|5[\s\.\-]*[0-9][\s\.\-]*[0-9])[\s\.\-]*(?:\d[\s\.\-]*){12,15})|(?:3[\s\.\-]*[47](?:\d[\s\.\-]*){13,17})|(?:3[\s\.\-]*(?:0[\s\.\-]*[0-5]|0[\s\.\-]*9|[689][\s\.\-]*[0-9])[\s\.\-]*(?:\d[\s\.\-]*){11,16})|(?:5[\s\.\-]*4[\s\.\-]*(?:\d[\s\.\-]*){14,17})|(?:(?:2[\s\.\-]*1[\s\.\-]*3[\s\.\-]*1|1[\s\.\-]*8[\s\.\-]*0[\s\.\-]*0|3[\s\.\-]*5[\s\.\-]*\d{2})[\s\.\-]*(?:\d[\s\.\-]*){11,15})|(?:(?:5[\s\.\-]*0|5[\s\.\-]*[6-9]|6[\s\.\-]*[0-4]|6[\s\.\-]*[6-9])[\s\.\-]*(?:\d[\s\.\-]*){14,17})|(?:(?:2[\s\.\-]*0[\s\.\-]*1[\s\.\-]*4|2[\s\.\-]*1[\s\.\-]*4[\s\.\-]*9)(?:\d[\s\.\-]*){11,15})|(?:6[\s\.\-]*3[\s\.\-]*[7-9][\s\.\-]*(?:\d[\s\.\-]*){13,16})/;

//*********************************************************************************************************/
//******                                     FUNCTIONS                                               ******/
//*********************************************************************************************************/

/************************************************/
/*              MAIN LAMBDA FUNCTION            */
/************************************************/

async function lambda(input, callback) {
    console.info('Init');

    try {
        if (!_.isEmpty(input.payload.wakeUp)) {
            console.info('wake up call');
            return callback(null, `I'm up`);
        }
        if (!checkInputPayload(input.payload)) throw new Error('400.Bad request');

// MODIFICACIONES BLACKLIST
// let blacklist = [];
// const lastUpdateBlacklist = fecha/hora;

// Si {blacklist} tiene algo Y la última actualización fue hace X minutos -> ME QUEDO CON LA BLACKLIST QUE TENGO
// Si no se cumple la condición de arriba -> voy a actualizar la blacklist
// blacklist = await obtenerBlacklist(); Esto de fondo le pega a una CF que de alguna forma trae el listado de números

// En este punto {blacklist} tiene un listado con números

// Si el nroTelefono que viene en el payload (input.payload.nroTelefono) está incluído en la {blacklist}
// DEVOLVEMOS
// return callback(null, buildErrorResponses(410));

        let config = configAll[input.payload.env];
        const { dni, genero, modulo = 'biometria' } = input.payload;
        const validar = input.payload.validar;
        if (_.isEmpty(config)) throw new Error('400.Bad request - Sin parametro env o no machea con DEV PREP PRD');
        console.info('Call from env', config.envCb);

        const STATE = generateUUIDv3();
        const IDENTITY_TOKEN = await lazyLoadOauthToken(config);
        console.debug('IDENTITY_TOKEN', IDENTITY_TOKEN);
        let dataClient = await callCliente(IDENTITY_TOKEN, dni, genero, STATE, config); //Comment to MOCK

        if (dataClient.success === true && validar === 'true') {
            const validacionDeCliente = await validarCliente(config, dataClient.data.referencias.client_hash, IDENTITY_TOKEN, modulo);
            Object.assign(dataClient.data, {
                marcaDeMigrado: validacionDeCliente.marcaDeMigrado || "Not validated",
                enroladobiometria: validacionDeCliente.enroladobiometria,
            });
        }

        return callback(null, dataClient);
    } catch (err) {
        console.error('Warn', err.message);
        console.error('Stack', err.stack);
        console.error('Name', err.name);

        return callback(err, null);
    }
}
/************************************************/
/*        SERVICE INTERACTION FUNCTIONS         */
/************************************************/

async function callCliente(IDENTITY_TOKEN, DNI, GENERO, state, config) {
    const [clientCert, clientKey] = await lazyLoadClientBundle(config);
    const client = Toolbelt.MTLSClient({ cert: clientCert, key: clientKey });

    const bodyRequest = buildRequestBody(GENERO, DNI);
    const auth = 'Bearer ' + IDENTITY_TOKEN;
    const url = `${config.url_cliente}/${state}`;
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: auth,
    };
    let { statusCode, body } = await client.post(url, headers, bodyRequest, {
        allowSelfSigned: true,
        timeout: 10000,
    });

    console.info('callCliente Status Code', statusCode);

    if (statusCode == 200) {
        const clienteRes = JSON.parse(body);
        clienteRes.state = state;
        clienteRes.date = addHours(-3);
        loggerDEV('Data cliente', buildLogClient(clienteRes), config);

        return buildOkResponses(clienteRes);
    }
    if (statusCode == 404) {
        return buildErrorResponses(statusCode, 'La invocación realizada no tiene resultados');
    }
    if (statusCode == 409) {
        return buildErrorResponses(statusCode, JSON.parse(body).mensaje);
    }

    throw new Error(`Error ${statusCode} al invocar Cliente`);
}

async function validarCliente(config, hashCliente, IDENTITY_TOKEN, modulo) {
    console.info('init validarCliente.');
    const [clientCert, clientKey] = await lazyLoadClientBundle(config);
    const client = Toolbelt.MTLSClient({ cert: clientCert, key: clientKey });
    const auth = 'Bearer ' + IDENTITY_TOKEN;

    const biometriaResponse = await callEnrolamientoService('biometria', hashCliente, auth, client, config);

    if (modulo === 'topaz') {
        const topazResponse = await callEnrolamientoService(modulo, hashCliente, auth, client, config);
        return {
            enroladobiometria: biometriaResponse.enroladobiometria,
            marcaDeMigrado: topazResponse,
        };
    }

    return biometriaResponse;
}

const callEnrolamientoService = async (module, hashCliente, auth, client, config) => {
    const url = `${config.url_validar}/clientes/${hashCliente}/enrolamiento?modulo=${module}`;
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: auth,
    };

    let { statusCode, body } = await client.get(url, headers, '', {
        allowSelfSigned: true,
        timeout: 10000,
    });

    console.info(`validarCliente Status Code (${module})`, statusCode);
    console.info(`Response from validarCliente (${module})`, body);

    if (statusCode == 200) return JSON.parse(body);
    
    return module === 'biometria' ? { enroladobiometria: "0" } : null ;
};

async function identityOathToken(config) {
    const [clientCert, clientKey] = await lazyLoadClientBundle(config);
    const client = Toolbelt.MTLSClient({ cert: clientCert, key: clientKey });

    const [username, password, oauthToken] = await lazyLoadOauthSecrets(config);

    const url = config.url_base_oath + '/identity/oauth/token';
    const headers = {
        Accept: 'application/json',
        Authorization: oauthToken,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    var formBody = buildForm(username, password);

    const { statusCode, body } = await client.post(url, headers, formBody, {
        allowSelfSigned: true,
        timeout: 10000,
    });

    console.info('identityOathToken Status Code', statusCode);

    if (statusCode !== 200) throw new Error(`Error ${statusCode} al invocar API Oauth`);
    if (!JSON.parse(body).access_token) throw new Error(`No llego el token`);

    const access_token = JSON.parse(body).access_token;
    const expires_in = JSON.parse(body).expires_in;

    return { access_token, expires_in };
}

/************************************************/
/*             VALIDATIONS FUNCTIONS            */
/************************************************/

function checkInputPayload(payload) {
    return !_.isEmpty(payload.dni) && isValidGender(payload.genero);
}
function isValidGender(genero) {
    return _.isEmpty(genero) || genero == GENERO_ID.M || genero == GENERO_ID.F || genero == GENERO_ID.NB;
}
/********************************************** */
/*               BUILD FUNCTIONS                */
/********************************************** */

function buildRequestBody(genero, dni) {
    let body = {
        documento: dni,
    };
    if (isValidGender(genero) && !_.isEmpty(genero)) {
        body.genero = genero;
    }
    return JSON.stringify(body);
}

function buildForm(username, password) {
    var details = {
        grant_type: 'password',
        username: username,
        password: password,
        scope: 'openid',
    };
    var formBody = [];
    for (var property in details) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(details[property]);
        formBody.push(encodedKey + '=' + encodedValue);
    }
    formBody = formBody.join('&');
    return formBody;
}
function buildOkResponses(data) {
    return { success: true, data: data, error: null };
}

function buildErrorResponses(code_http, message, details) {
    let code_info = '';
    if (code_http == 409) {
        const typeCode = getKeyByValue(message);
        code_info = getErrorResponses(typeCode);
    } else {
        code_info = getErrorResponses(code_http);
    }

    console.warn(JSON.stringify(code_http), code_info);
    return {
        success: false,
        data: null,
        error: {
            code_http,
            code_info,
            message,
            details,
        },
    };
}

/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

function addHours(numOfHours, date = new Date()) {
    date.setTime(date.getTime() + numOfHours * 60 * 60 * 1000);
    return date;
}

function loggerDEV(title, description, config) {
    if (typeof title !== 'string') {
        title = JSON.stringify(title);
    }
    if (config.envCb === 'DEV') {
        console.info(title, description);
    }
}

function buildLogClient(client) {
    const clientLog = {
        documento_tributario: client.documento_tributario,
        clasificacion: client.clasificacion,
    };
    return clientLog;
}

function getErrorResponses(statusCode) {
    const errorCodes = {
        404: 'NO_MATCH',
        dni_duplicado: 'DNI_REPETIDO',
        dni_menor: 'DNI_MENOR',
    };
    return errorCodes[statusCode];
}

function isValidToken(expiredTime) {
    return Date.now() < expiredTime - 30000;
}

function getKeyByValue(value) {
    for (const key in CONFIG_COD_409) {
        if (areStringsEqual(CONFIG_COD_409[key], value)) {
            return key;
        }
    }
    return 'dni_duplicado';
}
function areStringsEqual(str1, str2) {
    return _.toLower(_.deburr(str1)) === _.toLower(_.deburr(str2));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Luhn Algorithm to validate credit card
function _isCCValid(value) {
    // Elimina todo lo que no sea número
    value = value.replace(/\D/g, '');

    // El Luhn Algorithm
    var nCheck = 0;
    var bEven = false;

    for (var n = value.length - 1; n >= 0; n--) {
        var cDigit = value.charAt(n);
        var nDigit = parseInt(cDigit, 10);

        if (bEven && (nDigit *= 2) > 9) {
            nDigit -= 9;
        }

        nCheck += nDigit;
        bEven = !bEven;
    }

    return nCheck % 10 === 0;
}

// Function to generate a UUID
function generateUUIDv3() {
    let uuid;
    do {
        uuid = uuidv4();
    } while (matchWithLpOffuscation(uuid));
    return uuid;
}

function matchWithLpOffuscation(uuid) {
    if (matchesPatternLP(uuid) && _isCCValid(uuid)) {
        console.warn('matchWithLpOffuscation ' + uuid);
        return true;
    }
    return false;
}

function matchesPatternLP(input) {
    return LP_CC_PATTERN.test(input);
}

/************************************************/
/*         LAZY LOADS SECRETS FUNCTIONS         */
/************************************************/

async function lazyLoadClientBundle(config) {
    console.debug('lazyLoadClientBundle for  ', config);
    const ENV_CB = config.envCb;
    const ENV = config.env;
    let crd = credentials[ENV_CB];

    if (crd.cert && crd.key) {
        console.info('lazyLoadClientBundle cache ');
        return [crd.cert, crd.key];
    }

    if (crd.cert === undefined) {
        const { value } = await secretClient.readSecret('macro_cert_' + ENV);
        crd.cert = value;
    }

    if (crd.key === undefined) {
        const { value } = await secretClient.readSecret('macro_key_' + ENV);
        crd.key = value;
    }

    credentials[ENV_CB] = crd;

    return [crd.cert, crd.key];
}

async function lazyLoadOauthSecrets(config) {
    console.debug('lazyLoadOauthSecrets');
    const ENV_CB = config.envCb;
    const ENV = config.env;
    let crd = credentials[ENV_CB];

    if (crd.username && crd.password && crd.oauthToken) {
        return [crd.username, crd.password, crd.oauthToken];
    }

    if (crd.username === undefined) {
        const { value } = await secretClient.readSecret('macro_username_' + ENV);
        crd.username = value;
    }

    if (crd.password === undefined) {
        const { value } = await secretClient.readSecret('macro_password_' + ENV);
        crd.password = value;
    }

    if (crd.oauthToken === undefined) {
        const { value } = await secretClient.readSecret('macro_oauthToken_' + ENV);
        crd.oauthToken = value;
    }

    credentials[ENV_CB] = crd;

    return [crd.username, crd.password, crd.oauthToken];
}

async function lazyLoadOauthToken(config) {
    let { token, expiredTime } = credentials[config.envCb].identityOathToken;

    if (token === undefined || !isValidToken(expiredTime)) {
        const { access_token, expires_in } = await identityOathToken(config);
        console.debug('Nuevo tiempo de expiración: ' + expires_in);

        credentials[config.envCb].identityOathToken = {
            token: access_token,
            expiredTime: Date.now() + expires_in * 1000,
        };
    }

    return JSON.stringify(credentials[config.envCb].identityOathToken.token);
}