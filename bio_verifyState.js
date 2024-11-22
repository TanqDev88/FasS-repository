//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/** 05/10/23 STATE_NAME_SPACE & nroTelefono added to add compability with v2
 * 16/02/24 ahora el account number y el apiKey se cargan desde los secrets
 * 22/07/24 feat: Se implementa la nueva version de guardado de customer en namespaces indivuduales && se mejora el lazyLoadContextCS();
 * 25/10/24 cambio de estrategia de namespace con session (TTL)
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

/************************************************/
/*            CACHED SECRET VARIABLES           */
/************************************************/

let CONFIG_CS = { accountId: undefined, apiKey: undefined };
let contextCs = null;

/************************************************/
/*                   CONSTANTS                  */
/************************************************/

const NAMESPACE_BIOMETRIA = 'BIOMETRIA_CUSTOMERS';
const MAX_MINUTES_SESSION = 10;
const CUSTOMER_NAMESPACE_PROPERTY = 'CUSTOMER_NAMESPACE_PROPERTY';

//*********************************************************************************************************/
//******                                     FUNCTIONS                                               ******/
//*********************************************************************************************************/

/************************************************/
/*              MAIN LAMBDA FUNCTION            */
/************************************************/

async function lambda(input, callback) {
    try {
        //input.payload = mockPayload();// ES MOCK
        console.info('input payload', input.payload);
        const { state } = input.payload;

        if (!state) throw new Error('400.Bad Request');

        const { isValid, customerSession } = await verify(state);
        if (!isValid) throw new Error('404.Not Found');
        const nroTelefono = _.isEmpty(customerSession.nroTelefono) ? '' : customerSession.nroTelefono;
        callback(null, { client_hash: customerSession.client_hash, nroTelefono: nroTelefono });
    } catch (err) {
        console.warn('Sesion Invalida');
        callback(err, null);
    }
}

/************************************************/
/*        CONTEXT-CS INTERACTION FUNCTIONS      */
/************************************************/

async function verify(state) {
    let customerSession = '';
    customerSession = await getCustomerFromNamespace(state);
    if (_.isEmpty(customerSession)) return { isValid: false };
    const now = new Date().getTime();
    const diffMinutes = calculateDifference(now, customerSession);
    const isValid = !_.isEmpty(customerSession) && diffMinutes < MAX_MINUTES_SESSION;
    return { isValid, customerSession };
}

async function getCustomerFromNamespace(id) {
    let customerFromNamespace = {};
    try {
        customerFromNamespace = await viewPropertie(id, CUSTOMER_NAMESPACE_PROPERTY);
        if (_.isEmpty(customerFromNamespace)) throw new Error('Customer found empty');
    } catch (err) {
        console.info('Error from ContextCS', err);
        customerFromNamespace = {};
    }

    return customerFromNamespace;
}

async function viewPropertie(sessionId, prop) {
    const contextCS = await lazyLoadContextCS();
    console.debug(`viewProperty ${sessionId} ${prop}`);
    const data = await contextCS.getPropertyInSession(NAMESPACE_BIOMETRIA, prop, sessionId);
    console.debug('viewProperty data ', data);
    return data;
}

/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

function calculateDifference(now, customerSession) {
    const diffSenconds = (now - customerSession.createdAt) / 1000;
    const diffMinutes = diffSenconds / 60;
    console.info(`diferencia de tiempo de sesion ${diffMinutes} minutos`);
    if (diffMinutes > MAX_MINUTES_SESSION) console.warn(`diferencia de tiempo de sesion ${diffMinutes} minutos`);
    return diffMinutes;
}

/************************************************/
/*         LAZY LOADS SECRETS FUNCTIONS         */
/************************************************/

async function lazyLoadContextCS() {
    const configCS = CONFIG_CS;
    const isInCache = _.every(configCS, (value) => !_.isEmpty(value));
    if (isInCache && contextCs) {
        console.debug('lazyLoadContextCS from cache ');
        return contextCs;
    } else {
        console.debug('lazyLoadContextCS from service');
        configCS.accountId = await loadSecretValue(`lp_account_number`);
        configCS.apiKey = await loadSecretValue(`lp_cs_key`);
        contextCs = Toolbelt.ContextServiceClient(configCS);
        return contextCs;
    }
}

async function loadSecretValue(key) {
    const { value } = await secretClient.readSecret(key);
    return value;
}

/********************************************** */
/*               MOCK FUNCTIONS                 */
/********************************************** */

function mockPayload() {
    const state = '3c8a4325-5605-451d-bee0-baf3da24f88d';
    return {
        state: state,
    };
}