//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/**
 * 24/10/24 Se crea la FasS que llama a los servicios de alta de individuos y apertura de cuentas.
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
/*                 CONFIGURATION                */
/************************************************/

const configAll = {
    DEV: {
        url_base: 'https://servicios-test.macro.com.ar:3630',
        env: 'test',
        envCb: 'DEV',
    },
    PREP: {
        url_base: 'https://servicios-prep.macro.com.ar:3630',
        env: 'prep',
        envCb: 'PREP',
    },
    PRD: {
        url_base: 'https://servicios.macro.com.ar:3630',
        env: 'prod',
        envCb: 'PRD',
    },
};


/************************************************/
/*              MAIN LAMBDA FUNCTION            */
/************************************************/

async function lambda(input, callback) {
    try {
        if (!_.isEmpty(input.payload.wakeUp)) {
            console.info('wake up call');
            return callback(null, `I'm up`);
        }

        let config = configAll[input.payload.env];
        const { token } = input.payload;

        if (_.isEmpty(config)) throw new Error('400.Bad request - Sin parametro env o no machea con DEV PREP PRD');
        console.info('Call from env', config.envCb);

        const responseAltaIndividuo = await altaIndividuo(token, config);
        if (!responseAltaIndividuo.success) {
            return callback(null, responseAltaIndividuo); 
        }

        console.info('Alta de Individuo exitosa:', responseAltaIndividuo.data);

        const responseAperturaCuenta = await aperturaCuenta(token, config);
        if (!responseAperturaCuenta.success) {
            return callback(null, responseAperturaCuenta); 
        }

        console.info('Apertura de Cuenta exitosa:', responseAperturaCuenta.data);

        const finalResponse = {
            success: true,
            data: {
                altaIndividuo: responseAltaIndividuo.data,
                aperturaCuenta: responseAperturaCuenta.data,
            },
            error: null,
        };

        return callback(null, finalResponse);
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

async function altaIndividuo(token, config) {
    const [clientCert, clientKey] = await lazyLoadClientBundle(config);
    const client = Toolbelt.MTLSClient({ cert: clientCert, key: clientKey });

    const url = `${config.url_base}/individuos/alta`;
    const auth = 'Bearer ' + token;
    const headers = { Accept: 'application/json', Authorization: auth };

    const bodyRequest = {
        "nombre": "Juan",
        "apellido": "Perez",
        "fecha_nacimiento": "1990-01-01",
        "dni": "12345678",
    };

    const { statusCode, body } = await client.post(url, headers, JSON.stringify(bodyRequest), {
        allowSelfSigned: true,
        timeout: 30000,
    });

    const res = JSON.parse(body);
    console.info('Status Code', statusCode);

    if (statusCode == 200) {
        return buildOkResponses(res);
    }
    return handleError(statusCode);
}

async function aperturaCuenta(token, config) {
    const [clientCert, clientKey] = await lazyLoadClientBundle(config);
    const client = Toolbelt.MTLSClient({ cert: clientCert, key: clientKey });

    const url = `${config.url_base}/cuentas/apertura`;
    const auth = 'Bearer ' + token;
    const headers = { Accept: 'application/json', Authorization: auth };

    const { statusCode, body } = await client.post(url, headers, '', {
        allowSelfSigned: true,
        timeout: 30000,
    });

    const res = JSON.parse(body);
    console.info('Status Code', statusCode);

    if (statusCode == 200) {
        return buildOkResponses(res);
    }
    return handleError(statusCode);
}

/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

function buildOkResponses(data) {
    return { success: true, data: data, error: null };
}

function handleError(statusCode) {
    if (statusCode == 401) {
        return buildErrorResponses(statusCode, 'Access Token inválido');
    }
    if (statusCode == 403) {
        return buildErrorResponses(statusCode, 'Refresh Token expirado');
    }
    if (statusCode == 404) {
        return buildErrorResponses(statusCode, 'No se encontró el recurso solicitado');
    }

    throw new Error(`Error ${statusCode} al realizar la operación`);
}

function buildErrorResponses(code_http, message) {
    const code_info = getErrorResponses(code_http);
    console.warn(code_http, code_info);
    return {
        success: false,
        error: {
            code_http,
            code_info,
            message,
        },
    };
}

/************************************************/
/*         LAZY LOADS SECRETS FUNCTIONS         */
/************************************************/

async function lazyLoadClientBundle(config) {
    console.debug('lazyLoadClientBundle');

    let { cert, key } = credentials[config.envCb];

    if (cert && key) {
        return [cert, key];
    }

    if (cert === undefined) {
        const { value } = await secretClient.readSecret('macro_cert_' + config.env);
        cert = value;
    }

    if (key === undefined) {
        const { value } = await secretClient.readSecret('macro_key_' + config.env);
        key = value;
    }
    return [cert, key];
}