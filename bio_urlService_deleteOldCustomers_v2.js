//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/**
 * Leo. Mejora de Logs . Se baja a una hora HOUR_TIME
 * Santi. cons TIME se declara dentro del try en lambda
 * 05/10/23 new namespace added to add compability with v2
 * 05/01/24 wakeUp call added
 * 22/01/24 refactor to new namespace customer save strategy - logs improved
 * 16/02/24 ahora el account number y el apiKey se cargan desde los secrets test redeploy
 * 27/06/24 feat: se agraga input para seleccionar el namespace a borrar.
 * 23/07/24 feat: se realiza refactor para solamente contar la cantidad de customer sin borrarlos.
 * 26/07/24 feat: se realiza un refactor para borrar los customer viejos debido a que el TTL no esta funcionando
 * 11/09/24 feat: se realiza refactor para que devuelve la cantidad de customers.(estrategia sessionId)
 */
//*********************************************************************************************************/
//******                              GLOBAL VARIABLES                                               ******/
//*********************************************************************************************************/

/************************************************/
/*                 LIBRARIES                    */
/************************************************/

const _ = require('lodash');
const { Toolbelt } = require('lp-faas-toolbelt');
const secretClient = Toolbelt.SecretClient();

/************************************************/
/*            CACHED SECRET VARIABLES           */
/************************************************/

let CONFIG_CS = { accountId: undefined, apiKey: undefined };
let contextCs = null;

/************************************************/
/*                   CONSTANTS                  */
/************************************************/

const TTL_MINUTES = 10;

//*********************************************************************************************************/
//******                                     FUNCTIONS                                               ******/
//*********************************************************************************************************/

/************************************************/
/*              MAIN LAMBDA FUNCTION            */
/************************************************/

// eslint-disable-next-line no-unused-vars
async function lambda(input, callback) {
    try {
        if (_.isEmpty(input.payload.namespace)) throw new Error('400. Falta parámetro namespace.');

        const qty_customers = await viewAllSessions(input.payload.namespace);

        return callback(null, `cantidad de customers: ${qty_customers}`);
    } catch (err) {
        console.error(err);
        return callback(err, null);
    }
}

/************************************************/
/*        CONTEXT-CS INTERACTION FUNCTIONS      */
/************************************************/

async function viewAllSessions(namespace) {
    const contextCS = await lazyLoadContextCS();
    const sessions = await contextCS.getListOfSessions(namespace);
    console.debug('sessions ', sessions);
    console.info('qty sessions ', sessions.length);
    return sessions.length;
}

/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

function calculateDifference(now, createdAt) {
    const diffSenconds = (now - createdAt) / 1000;
    const diffMinutes = diffSenconds / 60;
    return diffMinutes.toFixed(2);
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
