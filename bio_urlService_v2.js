//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/**
 * 22/01/24 - Refactor sobre Lazyload credentials. Formateo con  ESLINT y PRETTIER
 * 22/01/24 - Added Docu for ContextServiceClient
 * 16/02/24 ahora el account number y el apiKey se cargan desde los secrets
 * 21/02/24 - URL_CLIENT_NOTIFICATION_TOKEN changed to accept release betqen accounts
 * 18/03/24 identificacion de cliente added to refresh clientHash
 * 19/03/24 logs improved && mockInput updated
 * 03/04/24 config url base oath for prep fixed && log for status code in get auth req id added
 * 04/04/24 log for client hash empty added
 * 22/04/24 se agrega el borrado de auth_req_id antes de generar uno nuevo
 * 05/06/24 Unify FaaS responses
 * 22/07/24 feat: Se implementa la nueva version de guardado de customer en namespaces indivuduales && se mejora el lazyLoadContextCS();
 * 01/08/24 Se modifica el error en deleteAuthReqId para que loguee el error sin dispararlo
 * 19/09/24 Se elimina función sleep(3000)
 * 30/09/24 Se agrega config MOCK
 * 01/10/24 fix: config MOCK se ajustan las url
 * 25/10/24 cambio de estrategia de namespace con session (TTL)*/

//*********************************************************************************************************/
//******                              GLOBAL VARIABLES                                               ******/
//*********************************************************************************************************/

/************************************************/
/*                 LIBRARIES                    */
/************************************************/

const { Toolbelt } = require('lp-faas-toolbelt');
const _ = require('lodash');

/************************************************/
/*                 TOOLBELT CONSTANTS           */
/************************************************/

const secretClient = Toolbelt.SecretClient();
const httpClient = Toolbelt.HTTPClient();

/************************************************/
/*                 CONFIGURATION                */
/************************************************/
const configAll = {
    MOCK: {
        url_cliente: 'https://europe-central2-macro-350416.cloudfunctions.net/dolar-mep-mock',
        url_base_oath: 'https://servicios-test.macro.com.ar:8080',
        url_base: 'https://europe-central2-macro-350416.cloudfunctions.net/dolar-mep-mock',
        url_base_link: 'https://biometria-test.macro.com.ar',
        url_base_delete_auth_req_id: 'https://europe-central2-macro-350416.cloudfunctions.net/dolar-mep-mock',
        env: 'test',
        envCb: 'DEV',
        token_expires_seconds: '600',
    },
    DEV: {
        url_cliente: 'https://servicios-test.macro.com.ar:3611',
        url_base_oath: 'https://servicios-test.macro.com.ar:8080',
        url_base: 'https://servicios-test.macro.com.ar:8080',
        url_base_link: 'https://biometria-test.macro.com.ar',
        url_base_delete_auth_req_id: 'https://servicios-test.macro.com.ar:3571',
        env: 'test',
        envCb: 'DEV',
        token_expires_seconds: '600',
    },
    PREP: {
        url_cliente: 'https://servicios-prep.macro.com.ar:3611',
        url_base_oath: 'https://servicios-prep.macro.com.ar:8080',
        url_base: 'https://servicios-prep.macro.com.ar:8080',
        url_base_link: 'https://biometria-prep.macro.com.ar',
        url_base_delete_auth_req_id: 'https://servicios-prep.macro.com.ar:3571',
        env: 'prep',
        envCb: 'PREP',
        token_expires_seconds: '600',
    },
    PRD: {
        url_cliente: 'https://servicios.macro.com.ar:3611',
        url_base_oath: 'https://servicios.macro.com.ar:8080',
        url_base: 'https://servicios.macro.com.ar:8080',
        url_base_link: 'https://biometria.macro.com.ar',
        url_base_delete_auth_req_id: 'https://servicios.macro.com.ar:3571',
        env: 'prod',
        envCb: 'PRD',
        token_expires_seconds: '600',
    },
};
/************************************************/
/*            CACHED SECRET VARIABLES           */
/************************************************/

let credentialsAll = {
    DEV: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
        client_id: undefined,
        client_secret: undefined,
        identityOathToken: {
            token: undefined,
            expiredTime: undefined
        }, 
    },
    PREP: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
        client_id: undefined,
        client_secret: undefined,
        identityOathToken: {
            token: undefined,
            expiredTime: undefined
        }, 
    },
    PRD: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
        client_id: undefined,
        client_secret: undefined,
        identityOathToken: {
            token: undefined,
            expiredTime: undefined
        }, 
    },
};

let LP_FAAS_CLIENT_ID;
let LP_FAAS_SECRET;
let CONFIG_CS = { accountId: undefined, apiKey: undefined };
let contextCs = null;

/************************************************/
/*                   CONSTANTS                  */
/************************************************/

const NAMESPACE_BIOMETRIA = 'BIOMETRIA_CUSTOMERS';
const ACCOUNT_ID_TEMPLATE = 'ACCOUNT_ID_TEMPLATE';
const TTL_NAMESPACE = 600;
const CUSTOMER_NAMESPACE_PROPERTY = 'CUSTOMER_NAMESPACE_PROPERTY';
const URL_CLIENT_NOTIFICATION_TOKEN = `https://va.sentinel.liveperson.net/sentinel/api/account/${ACCOUNT_ID_TEMPLATE}/app/token?v=1.0`;
const ACTIONS_TYPES = {
    DELETE_LINK: 'DELETE_LINK',
    CREATE_LINK: 'CREATE_LINK',
};
const GENERO_ID = { M: 'M', F: 'F', NB: 'X' };

//*********************************************************************************************************/
//******                                     FUNCTIONS                                               ******/
//*********************************************************************************************************/

/************************************************/
/*              MAIN LAMBDA FUNCTION            */
/************************************************/

async function lambda(input, callback) {
    try {
        if (!_.isEmpty(input.payload.wakeUp)) {
            console.info('wake up call');
            return callback(null, `I'm up`);
        }

        if (!checkPayload(input.payload)) throw new Error('400.Bad request');

        const { state, action, env, dni, genero } = input.payload;
        console.info('payload preview', { state, action });

        const config = configAll[env];

        if (action === ACTIONS_TYPES.DELETE_LINK) {
            await deleteAuthReqId(state, config);
            const msj = `auth_req_id deleted for customer state ${state}`;
            return callback(null, buildOkResponses(msj));
        }

        if (action === ACTIONS_TYPES.CREATE_LINK) {
            try {
                await deleteAuthReqId(state, config);
                console.info('Se realizó exitosamente el borrado preventivo de auth_req_id');
            } catch (err) {
                console.warn('Error en el borrado preventivo de auth_req_id', err);
            }

            const clientData = await getDataClient(dni, genero, state, config);
            const customerSession = await saveCustomerGetAuthRqId(input.payload, config, clientData.referencias.client_hash);
            const BIO_URL = buildUrl(customerSession.state, config);
            const data = {
                url: BIO_URL,
                auth_req_id: customerSession.auth_req_id,
            };
            return callback(null, buildOkResponses(data));
        }

        console.warn('No concide ninguna accion posible', ACTIONS_TYPES);

        throw new Error('400.Bad request');
    } catch (err) {
        console.error('Stack', err.stack);
        return callback(err, null);
    }
}
/************************************************/
/*        SERVICE INTERACTION FUNCTIONS         */
/************************************************/

async function saveCustomerGetAuthRqId(payload, config, clientHash) {
    let customerSession = buildCostumer(payload, '', clientHash);
    // guarda el customer en el namespace para que pueda ser ejecutado correctamente el "verifyState"
    // cuando se pide el requ ID
    await saveForVerifyState(customerSession);

    const authReqId = await getAuthReqId(payload.state, config);
    customerSession.auth_req_id = authReqId;

    // guarda el customer con el auth_req_id en el namespace para que pueda ser ejecutado correctamente el "callback"
    await saveForCallback(customerSession);

    return customerSession;
}

async function getAuthReqId(state, config) {
    const { cert, key } = await lazyLoadCredentials(config);
    const client = Toolbelt.MTLSClient({ cert: cert, key: key });
    const { client_id, client_secret } = await lazyLoadCredentials(config);

    const token = buildAuthBase64(client_id, client_secret);

    const auth = 'Basic ' + token;
    const url = `${config.url_base}/identity/oauth/bc-authorize`;

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: auth,
    };

    const clientNotificationToken = await createToken();

    const formBody = buildFormForBcAuthorize(clientNotificationToken, state);
    const { statusCode, body } = await client.post(url, headers, formBody, {
        allowSelfSigned: true,
        timeout: 10000,
    });

    console.info('Status code get auth req id', statusCode);
    loggerDEV('Response ', { statusCode, body }, config);

    // eslint-disable-next-line eqeqeq
    if (statusCode == 200) {
        return JSON.parse(body).auth_req_id;
    }

    throw new Error(`Error ${statusCode} al intentar obtener el auth_req_id`);
}

async function deleteAuthReqId(state, config) {
    const { cert, key } = await lazyLoadCredentials(config);
    const client = Toolbelt.MTLSClient({ cert: cert, key: key });

    const token = await identityOathToken(config);

    const auth = 'Bearer ' + token;
    const url = `${config.url_base_delete_auth_req_id}/IDOperacion/${generarNumeroRandom()}/LoginHint/${state}`;

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: auth,
    };
    const options = { allowSelfSigned: true, timeout: 10000 };

    const { statusCode, body } = await client.delete(url, headers, '', options);

    loggerDEV('Response delete_auth_req_id', { statusCode, body }, config);

    // eslint-disable-next-line eqeqeq
    if (statusCode == 200) return JSON.parse(body).auth_req_id;

    if (statusCode == 404) {
        console.warn('ERROR 404 al intentar borrar el auth_req_id');
        return 'No existe link activo para el state ingresado.';
    }

    throw new Error(`Error ${statusCode} al intentar BORRAR el auth_req_id`);
}

async function getDataClient(dni, genero, state, config) {
    //const IDENTITY_TOKEN = await identityOathToken(config);
    let IDENTITY_TOKEN = await lazyLoadOauthToken(config);  
    IDENTITY_TOKEN = JSON.stringify(IDENTITY_TOKEN.token);

    console.debug('TOKEN ok', IDENTITY_TOKEN);

    const clienteRes = await callCliente(IDENTITY_TOKEN, dni, genero, state, config);

    if (!_.isEmpty(clienteRes.referencias)) console.info('is empty client_hash', _.isEmpty(clienteRes.referencias.client_hash));

    return clienteRes;
}

async function callCliente(IDENTITY_TOKEN, DNI, GENERO, STATE, config) {
    const { cert, key } = await lazyLoadCredentials(config);
    const client = Toolbelt.MTLSClient({ cert: cert, key: key });

    const bodyRequest = buildRequestBody(GENERO, DNI);

    const auth = 'Bearer ' + IDENTITY_TOKEN;
    const url = `${config.url_cliente}/${STATE}`;
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: auth,
    };

    console.debug('callCliente', url, config);
    console.debug('callCliente', bodyRequest, config);
    let { statusCode, body } = await client.post(url, headers, bodyRequest, {
        allowSelfSigned: true,
        timeout: 10000,
    });

    console.info('callCliente Status Code', statusCode);

    if (statusCode == 200) return JSON.parse(body);
    throw new Error(`Error ${statusCode} al invocar Cliente ${DNI} - ${GENERO}`);
}

async function identityOathToken(config) {
    const { cert, key } = await lazyLoadCredentials(config);
    const client = Toolbelt.MTLSClient({ cert: cert, key: key });

    const { username, password, oauthToken } = await lazyLoadCredentials(config);

    const url = config.url_base_oath + '/identity/oauth/token';
    const headers = {
        Accept: 'application/json',
        Authorization: oauthToken,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    const formBody = buildFormForIdentity(username, password);

    const { statusCode, body } = await client.post(url, headers, formBody, {
        allowSelfSigned: true,
        timeout: 10000,
    });

    if (statusCode !== 200) throw new Error(`Error ${statusCode} al invocar API Oauth`);
    if (!JSON.parse(body).access_token) throw new Error('No llego el token');

    const access_token = JSON.parse(body).access_token;
    const expires_in = JSON.parse(body).expires_in;

    return { access_token, expires_in };
}

/** Llama a la API para autenticar las llamadas a las faas */
async function createToken() {
    if (_.isEmpty(LP_FAAS_CLIENT_ID) || _.isEmpty(LP_FAAS_SECRET)) {
        LP_FAAS_CLIENT_ID = await loadSecretValue('clientId_bioV2');
        LP_FAAS_SECRET = await loadSecretValue('clientSecret_bioV2');
    }

    const formBody = {
        grant_type: 'client_credentials',
        client_id: LP_FAAS_CLIENT_ID,
        client_secret: LP_FAAS_SECRET,
        scope: 'faas.lambda.invoke',
    };

    const uriClientNotificationToken = await build_urlClientNotificationToken(URL_CLIENT_NOTIFICATION_TOKEN);

    const response = await httpClient({
        method: 'POST',
        uri: uriClientNotificationToken,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        form: formBody,
        json: true,
    });

    return response.access_token;
}
/************************************************/
/*        CONTEXT-CS INTERACTION FUNCTIONS      */
/************************************************/

async function saveForVerifyState(stateEntity) {
    await addNewCustomerInNamespaceV2(stateEntity.state, TTL_NAMESPACE, CUSTOMER_NAMESPACE_PROPERTY, stateEntity);
}

async function saveForCallback(stateEntity) {
    await addNewCustomerInNamespaceV2(stateEntity.auth_req_id, TTL_NAMESPACE, CUSTOMER_NAMESPACE_PROPERTY, stateEntity);
}

async function addNewCustomerInNamespaceV2(sessionId, ttl, prop, value) {
    const contextCS = await lazyLoadContextCS();
    await contextCS.createNamespace(NAMESPACE_BIOMETRIA, { ttl: ttl });
    await contextCS.setPropertiesInNamespace(NAMESPACE_BIOMETRIA, { [prop]: value }, sessionId);
    console.debug(`Customer id ${NAMESPACE_BIOMETRIA} añadido`);
}


/************************************************/
/*             VALIDATIONS FUNCTIONS            */
/************************************************/

function checkPayload(obj) {
    let isValidIpnut = false;
    const properties = ['action', 'botId', 'conversationId', 'userId', 'state', 'nroTelefono', 'env'];
    isValidIpnut = _.every(properties, (prop) => _.has(obj, prop) && obj[prop] !== '');
    return isValidIpnut;
}

function isValidGender(genero) {
    return _.isEmpty(genero) || genero == GENERO_ID.M || genero == GENERO_ID.F || genero == GENERO_ID.NB;
}

function isValidToken(expiredTime) {
    return Date.now() < (expiredTime - 30000);
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

async function build_urlClientNotificationToken(url_base) {
    const lp_account_number = (await lazyLoadContextCS()).accountId;
    return _.replace(url_base, ACCOUNT_ID_TEMPLATE, lp_account_number);
}

function buildUrl(state, config) {
    return `${config.url_base_link}/?id=${state}`;
}

function buildCostumer(payload, authReqId, clientHash) {
    let costumer = _.pick(payload, ['botId', 'conversationId', 'userId', 'env', 'state']);
    costumer.nroTelefono = payload.nroTelefono.slice(3);
    costumer.auth_req_id = authReqId;
    costumer.client_hash = clientHash;
    costumer.createdAt = new Date().getTime();
    return costumer;
}

function buildFormForBcAuthorize(clientNotificationToken, state) {
    const details = {
        scope: 'openid',
        client_notification_token: clientNotificationToken,
        login_hint: state,
    };

    let formBody = [];
    for (const property in details) {
        const encodedKey = encodeURIComponent(property);
        const encodedValue = encodeURIComponent(details[property]);
        formBody.push(`${encodedKey}=${encodedValue}`);
    }
    formBody = formBody.join('&');
    return formBody;
}

function buildFormForIdentity(username, password) {
    const details = {
        grant_type: 'password',
        username: username,
        password: password,
        scope: 'openid',
    };

    let formBody = [];
    for (const property in details) {
        const encodedKey = encodeURIComponent(property);
        const encodedValue = encodeURIComponent(details[property]);
        formBody.push(encodedKey + '=' + encodedValue);
    }
    formBody = formBody.join('&');
    return formBody;
}

function buildAuthBase64(clientId, clientSecret) {
    return Buffer.from(clientId + ':' + clientSecret).toString('base64');
}
function buildOkResponses(data) {
    return { success: true, data: data, error: null };
}
/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

/** Genera un numero random basado en timestamp */
function generarNumeroRandom() {
    // Obtiene el timestamp actual en milisegundos
    const timestamp = new Date().getTime();

    // Genera un número aleatorio en el rango de 1 a 100
    const numeroAleatorio = Math.floor(Math.random() * 100) + 1;

    // Suma el número aleatorio al timestamp
    const numeroRandom = timestamp + numeroAleatorio;

    return numeroRandom;
}

function buildLogClient(client) {
    const clientLog = {
        documento_tributario: client.documento_tributario,
        clasificacion: client.clasificacion,
    };
    return clientLog;
}

function loggerDEV(title, description, config) {
    if (typeof title !== 'string') {
        title = JSON.stringify(title);
    }
    if (config.envCb === 'DEV') {
        console.info(title, description);
    }
}

function logExecutionTime(startTime) {
    const elapsedTime = (Date.now() - startTime) / 1000;
    if (elapsedTime > 2) {
        console.warn(`Execution time exceeded 2 seconds: ${elapsedTime.toFixed(2)} seconds`);
}
}

/************************************************/
/*         LAZY LOADS SECRETS FUNCTIONS         */
/************************************************/

async function lazyLoadCredentials(config) {
    const startTime = Date.now();
    const ENV = config.env;
    const crd = credentialsAll[config.envCb];
    const isInCache = _.every(crd, (value) => !_.isEmpty(value));
    if (isInCache) {
        logExecutionTime(startTime);
        return crd;
    }
    crd.cert = await loadSecretValue(`macro_cert_${ENV}`);
    crd.key = await loadSecretValue(`macro_key_${ENV}`);
    crd.username = await loadSecretValue(`macro_username_${ENV}`);
    crd.password = await loadSecretValue(`macro_password_${ENV}`);
    crd.oauthToken = await loadSecretValue(`macro_oauthToken_${ENV}`);
    crd.client_id = await loadSecretValue(`macro_client_id_v2_${ENV}`);
    crd.client_secret = await loadSecretValue(`macro_client_secret_v2_${ENV}`);

    credentialsAll[config.envCb] = crd;

    logExecutionTime(startTime);
    return crd;
}

async function lazyLoadContextCS() {
    const startTime = Date.now();
    const configCS = CONFIG_CS;
    const isInCache = _.every(configCS, (value) => !_.isEmpty(value));

    if (isInCache && contextCs) {
        logExecutionTime(startTime);
        return contextCs;
    } else {
        configCS.accountId = await loadSecretValue(`lp_account_number`);
        configCS.apiKey = await loadSecretValue(`lp_cs_key`);
        contextCs = Toolbelt.ContextServiceClient(configCS);
        logExecutionTime(startTime);
        return contextCs;
    }
}

async function loadSecretValue(key) {
    const { value } = await secretClient.readSecret(key);
    return value;
}

async function lazyLoadOauthToken(config) {
    var dat = new Date();
    console.debug('init lazy load oauth token: ' + dat);

    let { token, expiredTime } = credentialsAll[config.envCb].identityOathToken;
    console.debug('Tiempo de expiración: ' + expiredTime);
    
    if (token === undefined || !isValidToken(expiredTime)) {    
        const { access_token, expires_in } = await identityOathToken(config);
        console.info('Token actualizado.');
        console.debug('Nuevo token obtenido: ' + access_token);
        console.debug('Nuevo tiempo de expiración: ' + expires_in);
        
        credentialsAll[config.envCb].identityOathToken = {
            token: access_token,
            expiredTime: Date.now() + expires_in * 1000
        };
    } else {
        console.debug('Token válido.');
        console.info('Token válido.');
    }

    return credentialsAll[config.envCb].identityOathToken;
}
/********************************************** */
/*               MOCK FUNCTIONS                 */
/********************************************** */

// eslint-disable-next-line no-unused-vars
function getMockInput() {
    return {
        action: 'CREATE_LINK',
        botId: '5b699548-66ba-4500-9922-7d11bd90135d',
        conversationId: '3fc44c2c-cc48-481f-bb85-fdf35bce8f95',
        userId: '880e0de02deeddb72fe51838e74c3ea4846f1eddf7b8e37a31c14358bb5bd004',
        state: '70fdc702-94c4-4f7c-8696-c35355cae7ff',
        dni: '23456677',
        nroTelefono: '5492915111111',
        genero: 'M',
        env: 'DEV',
    };
}
// eslint-disable-next-line no-unused-vars
function getAuthReqIdMOCK() {
    return '90a129-9673-d2bb375a936b';
}
