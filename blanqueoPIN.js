//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/**
 * 12/4/23 Se quita paseo a json de la resupesta de la API . @santi.
 * 03/05/23 404 - 'NO_MATCH' response removed
 * 09/10/23 refactror for 1 FaaS for all env system
 * 27/11/23 getErrorResponses added
 * 23/02/24 Logs - only for DEV - added
 * 03/06/24 Nuevo comportamiento de la biometria
 *           -Add handler error code 403
 *           -Unify FaaS responses
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
        url_base: 'https://servicios-test.macro.com.ar:3619',
        env: 'test',
        envCb: 'DEV',
    },
    PREP: {
        url_base: 'https://servicios-prep.macro.com.ar:3619',
        env: 'prep',
        envCb: 'PREP',
    },
    PRD: {
        url_base: 'https://servicios.macro.com.ar:3619',
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
    },
    PREP: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
    },
    PRD: {
        cert: undefined,
        key: undefined,
        username: undefined,
        password: undefined,
        oauthToken: undefined,
    },
};

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

        let config = configAll[input.payload.env];
        const { token, hash_tarjeta } = input.payload;

        if (_.isEmpty(config)) throw new Error('400.Bad request - Sin parametro env o no machea con DEV PREP PRD');
        console.info('Call from env', config.envCb);
        //const { token, hash_tarjeta } = getMockInput();
        //console.info('LLEGO EL TOKEN ==> ' + token.length);

        const response = await callBlanqueoPIN(token, hash_tarjeta, config);
        //const response = callBlanqueoPINMOCK(token, hash_tarjeta); // MOCK

        return callback(null, response);
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

async function callBlanqueoPIN(token, hash_tarjeta, config) {
    const [clientCert, clientKey] = await lazyLoadClientBundle(config);
    const client = Toolbelt.MTLSClient({ cert: clientCert, key: clientKey });

    const auth = 'Bearer ' + token;
    const url = `${config.url_base}/clientes/tarjetas/${hash_tarjeta}/blanqueo`;
    console.debug('url', url);

    const headers = { Accept: 'application/json', Authorization: auth };

    const { statusCode, body } = await client.patch(url, headers, '', {
        allowSelfSigned: true,
        timeout: 30000,
    });

    // const { statusCode, body } = { statusCode: 403, body: '' } // MOCK 403

    console.info('Status Code', statusCode);
    loggerDEV('Response Blanqueo de PIN ==>', body, config);

    if (statusCode == 200) {
        return buildOkResponses(body);
    }
    if (statusCode == 401) {
        return buildErrorResponses(statusCode, 'Access Token inválido');
    }
    if (statusCode == 403) {
        return buildErrorResponses(statusCode, 'Refresh Token expirado');
    }

    throw new Error(`Error ${statusCode} al intentar Blanqueo de PIN`);
}

/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

function getErrorResponses(statusCode) {
    const errorCodes = { 401: 'NOT_AUTHORIZED', 403: 'NOT_AUTHENTICATED' };
    return errorCodes[statusCode];
}

function loggerDEV(title, description, config) {
    if (typeof title !== 'string') {
        title = JSON.stringify(title);
    }
    if (config.envCb === 'DEV') {
        console.info(title, description);
    }
}

function buildOkResponses(data) {
    return { success: true, data: data, error: null };
}

function buildErrorResponses(code_http, message, details) {
    const code_info = getErrorResponses(code_http);
    console.warn(code_http, code_info);
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
/********************************************** */
/*               MOCK FUNCTIONS                 */
/********************************************** */

function getMockInput() {
    return {
        token: 'ZXlKbGJtTWlPaUpCTWpVMlEwSkRMVWhUTlRFeUlpd2lZV3huSWpvaVpHbHlJaXdpWTNSNUlqb2lTbGRVSW4wLi5pQTFCWmVTVmlxY212ZWprbW9xQkpBLlBQX0JHNUU0TTE3X0Z2dGVmMGk0WmQ1R2Zjc1c5OTdFUURpQjhXOVNpbzhxZFdFWjRMVFczZjJnQmk1aFMzb1h4YVVJVEdkZnllUTgybVRBbkJNb1lBQUVVR2tIX1dWRUg4d2otR2NCNzVlY1M4ZzFUUmFtNlNoeG5lV1ZxSVR6RHhrWkxZVW5GNDI2ZjlhajFZWnl5TU5BRjlTTEpsR1RmME5JNjVvWW8tUnE3TFNQS0pWS2VVSHRLb3JqNTBadXhFNVBLTmlTMnpDcllneU9DXzkzNXlUaXEwX3ZKb2hNQXRPZkFYU3hWZG8xTkgtbUZFSEt5ZUdNQkpWekhOTkhOWkJJaEtmWksxSkVaMi0wNE1YS0kwMkRiekczMlRYX2s3LThxLTRYOVZmMXFpUUpkV2RBT1BEOW9DaXduSkpMc2ZiU1NOUUdtWGJfblJwdTlKa1BSYmEySW1tWGFuWVFmLUYzejE3eEJ5ZlhzQVRKaWdjWHdCOHNKLXpjTVdqd0lqa1ZWY1JkYTYzZUtRUVhMZWk1bnZhcVIxTlVBQlFZMHZsdTZLVzhZNlY2cEt3Ykk3Z0RGd0dCaUU0dmZWTVd1RW9YUkdId1phSjdkR0lHRlNlemdCWmpiazRmaUQweV8yNmJHaFFzMGhTNnZoX1pmMjFMaGR2TDdfdFBDVkRkOFJxWmhrdjdyaU5zQl82Ykw4ZFJpM2xBUDgwQ1VpWVNVcG9Vd1hyWkliaS1LQTRPR2xUTGltYUNCcEJZWUJhMXYzZU1mNlhkdHdfMThIN3liaDhBVTdSSU9nUnpqakdpQ3hrOXBLUUtRNDBaQTBtQzBMWWI3QUdDTW9kSUFfVklsTUhUcWNuTjJ0ZmhKVWtJLXRqbzlWTjRXUmNUcmxjRjZIY1hQVFpEbUpfbGhzX1ZKQUhvN3gzN3VqODR2aHRhSnpvTXF6RzdTZTZ3MFVtU3FwYm9iTFU1NkZzN00tTGdvd1RaRV9FblVDalE1R0xfb21YeXdsb282dmNDaVhablFMdV9mWGR5dFZBWGhnM1ZJQ1JPVEJlak50QnhLVGhWM1VsazBVZHVqeXJfck9UdGxwWlhQY183elh2VzJqXzdCMm1rUy0xb09BUjVVR3hsVjJZTU9PVllJX1BWVjlxczE4Y05xTkZndl95WW41Q0lrNk1vZkwtdFV3QjVCMUVjZEdyaDhZMEtzTHNtZ05oNWtPTFZoMTktNklZUkVQN3NsLU0tcHN3OHhPYVdLVHNxWjNnVnh6S2lRcHA3bEVlQ2Z0SHJoSWhWZGJTVFFyRi15UnVPUkVsa3Bkam1mWW1WWTJISF9qeXY3Qks2MWd1V0VNNEFtNm5hb0x2ZUdBeUlHOTc5SlJudUlYNXpMNG1BczU2eDhJdG9scDIwb2h5Uzg2czBXMzdWUzBuRmwxcm10YkpLcXNvTmpGQ2xxQ1lLdEdUNG1YWHFLN0I2YXJ6Z2xPbmRQOHRQVlBNT1J1R2VrYmxUbGc0UlJqakRHUlpIMW9MNFY4dmkxR2tKVFhZSmRldVNoMWxrUlJmSTQtV29jbjZ4NVczcTlNYWYzV2RDUXFISjlEUXFVcV83My1SWlJ4SmZXOXhDY3VqUGtFYUF4ajc1SG42Y1UzWEtlLU94Y0lrLUo5U19BNnhBZmdHMGxpVU5aX09Vb19nSDJ1WFRoYUlLeDhNSGk0empXckdKZE9OSXB6NThTN3VmdlJ3Yk9DTDBjTkxMbHJBa1lRTHpNVm4td3p1blZMb3FwZnYxSjBKZ3RveTUyOWlUTjBxd2tPR1Nwbk5vQlpfVjExZjRVaTh1RjI4dVE0cTNSajlwX3R1QWttcldfYnNPRlFwZENrWVY2Z2haYmJyZFdlcmxRRU5fU0xFc0tQOU9JWlNKWWlPSkh5cU94VFQ2b2FmYjZyVGU2ZUxRNWl0SWpKeERTME9kaWNHWEpUNGpubXd4c3hyNzJDQnctM21UOWplQTV1M1dYUVBWb1YxWEVlRXBkV2NwLWZYeTM1YlMtSG1EWEVYQUFNR3Zuek4xU1hnSHFSY0RpTE1qNTJkampJVXhkalZRZXBIMlpiZzZPd0ZEZUJ0WXBjZGpRMWFfSXBWSVpZR2RXWFJZLURnTVpuaU9KclZhZ1dBUzI3RmdmS2psWDg5X0VUQXRWVllZYUgtZkxyN2NEZWljcEVHSTBWaXBxNGJtS0l6VFhiMDM1N21ZZzBCV0V4Q2ZSendaMnZzV2xHTm9qbXdHYUkyQ2JfMC1iMlVoU1lMMkRrT2hYVE1YUVNGSWVBcmZNLVI1LWo2cmdWSi0zYnlZN2ZVTnFhTmhtNkEtNFFpLXJOVGZZRmYyOXRpaEhma1FBTkZ4YXdoeDY2NXA0ZnczY3lwSV9GS094anVpTWl3QURCTmZ1RVVqQ3J4OHpZbDByTEhfWVkzZUtfX2ZfbEVQOHZ0Wi1icEQ1Y0h4QmpoUnhuM0VHS2tfUDFoTkVuQ3FudERiNVlGR3VpYnMxRnhuZi1wSnZVb09zZ3VLeUMwbVJBVnpJNk0zcnFidF9jNUZRYnVXMHBxRWt4OTFfckp3T0FHTjNGWnRnVS1oVzdRUS1nd3BKcnFuSVpLNDNLRWszbVBYdDNVRG4tV2NZbklaRVctZVJMTmhZbEJxT0N5aThKcjNqNm5YcFVSeGN4dnZnVnFoSGR1aU00a2dxR2M1RUNxVktoQmY2UG5DSlVpQXR3YWNLRW9haHhrZFlxcldSVGJrYmx5eTFVbGIycTNrbVBNbHRIY0ZIWDZPMFZFZjNEM2RGWmJhZldGZU93UmRadmFMRy14TUhZQmZBM3htNzkxZi03d2NQWkJzc0dlY2U1Slh5ZE9qOW9OMDRZZm9DZnE0Q2dZVExWVTZRcDkzaHVMZ2ZOVVYyZWJnaDFIUC1oQm1fcUE0UUhDYUdYNnBaNVF4MnRxQ2xRNmRuTjdIbFJLZElPSlRiNWU4TFRCclJOaUh0Y2Q5cFZRSzM4b1Y4d0lMSlJIREZyRm94alcwbVJvVGZMTE5oUVlvRXdpQkhaZllzMkYtMVRpWVRERVJWcTVza3A0NXctWDQ5M05zVC12NkxZak5rS0loRUQyekg3bFRWeGlJUGNBbmx4dlRCRmVKNmc0WXpQRHhJbDFyTXg2UVBRdVd5aHpUM0plMVh0bVFIamY5N1lhUFlad3M2TGNadVV3emo2REFEOTBLV29obWhOQ0huekxpb1ROMVZBYmdIT0QxWXVhazR2bWFZYjN4bldqQV9YNXkxQTVoSmpIYzdKVUNtME1Fc2tYRE9DSHRLVVJDRTNONzB3LTBWd3lxbzdsbFZSSnBQby1pNDAxVnNfTE9pbndhaWM4UUhFTmFWT0RUaEgwcVVtOG9YX2ZIc2kzQzh0N252cmZNVWY5am51WTFYN3dVUmpLOWlMTnlsckszeEswR2xJVDFFVm4tYkV4ZWFZcjNJNlZ4MXhHZ0t3b0JUUWlUd1FaUUxRWkUwSXRTM1V2by05TU5McnhtTkZUNmtOOXgxZERMYWFqT1AwWE1IQmstMzI4OFE5OUIxQzRfbEI4cmVzQ1hKMXlNcHlFekJ0bmVuS3MzbGVBMEpja1E0QVJWTU9qNnpVOERwUURSNUx4VUJrSWZSM3A3aHNfWUFxU3V3VFpzTUdxRmU1SlRWTXN3ZWx0MmVMTjFXSVhQODA1YXlXWUNfa2pRb3VzdWplcnNqemVubW1hMERELUVjOFg1LXVHQ1o1N0ZTMVRCYjBfRU9QR3pCOEtkb1JmQUczQUhqOTNpSlR1Yldxd2ZtbzdGQVBFRW9TXzZheFM5cW9fbFBMMDFKQ2dfMEtGQ3RkSTFDcXBxTnNmU0Vla1FKenNOQkpNa0RFNDFOYzNvdGFYVjJOZ0ZRVWpBVmpwYXRsZ0xXUl92eFN6d2VwTlJHSkplVklTYnU5bnY1Ql9RX2RJeFE1U1h1bmRuWW9CTDhhRDdUYnFlSlJPVDVFNFFXNkxFWWt3NTRRVE5TTVZ4bWZ2eGZNZjlQaTdsU1lObHBFUW5uYkd4WDdxeWF2YlhiRjhWU1VJMnRWcnc0RWt0bU96aEcwaXR5WF90UnRMdkptck1lckpHTUI4SWNoMS13ZjFob1BqOEhIQmVVTHZhaGtRczU2ZjZkRUxCdzYtNFRXbVVDa09XY1V2dmhfZk9rbUJWUVVtdzhqYVAtaEZDaVVnZUxtTXUwd2p3djdsZEdYTFZ5SzlCTTI2NFNVRXBjc2oyZDJwODBFcjRZLXAzSDJ1MDEtVnZIOEhLLUxSMFlpLWNWMWQ5YmJlX3JMN1RaQ3IyT2IxOUxSTW1sVGllcTkyVWtNRG1JNGY3MU5MQkxBRERNXzNCQUUyNEJDQXZyR2RITW11ZFpGZnRyYnIzTXM5SjdKOGlJVjlHeS1Sd25pa1dlZVd0V2FoN19yUXBKSlY2eGF3bng0dnhBbXNSTWdzajZsMDJfcWtjaWJLcUFpd1BoSmlqaXlJMGFMbVJlMkhNbVkxcmFjcTk2cmRkZDhZZUs2MlJBdXo0ZE9KZjI3Y3pRYVlERGVHb3hsZm5OODEwMGVTRS1NOVNOY0RNdjE0ZXVqa0ZNSEVsa3Q4Qk9HOEhDOFNwSHRMT3oyNlhOYUpFT3haOGY3YXBwalpZMEVrWnEwNVllNUQ0N1d1VldEWDY2TFNxYU1Pa01KWDhPT3c5bVo1M3BJV2owSUV4XzVmN1NDVWt5RVk1R0NhaXR5YVB2Z1J4TEw4aHNia0h6VTlSZHVBOFdjaVNleDFualFueDFNS1h1c1JYNHRnd0NDVTZ4ME9fWWhFX1ZZUmhUR1pZV2JBYUNjajRaVkZYVVd3emlmcE9FWWVNMklEOHZzcVNtYVJzcXdacVBFUmhPdnVvaXpzT0RNR1VSYzBBZmx1d19UN3pqaHJMbXZTcUFJclVLbEJ4eW5XUjkxazdMeTYwYUFqV05JTm13Sl95MUR0Tjdza1kzcnJDR3BZcXB5aHFlQ29tU21sc2RVR3NfMVZ2bm9Oak01ZVBsWms0SWZpbEZIZFdEc0pNV29JRmxPbXk2eTVYdk52RjZ3WnlOZk4zcHh3RFAzTFVVSmN2aUFFZW1kTFJCMmwtWFc4Y1ZrRS1DYmZGSzZQcnZTa0hxcmZES3U4bVdES19vRkRlOGg1cXhXTzJCLWt1UHRFVTdLd2lqa1d1c2dnQm9UeF9LNUFzZFNQWjN2aFdWUUo5bHpGejkxSUJDS3RfR2lJNkV5Y3ItVXY1LXNCaEg1QmMzaENQclMzWkp2UlBnYndISk1SeW9zV2VUMmhIdXY1WVIwSTVkYk5iTnhZX1dVU0o5MlRDTzhNRUpxSDBIWEpiYl9tcFliS2JEdl9hbzRFcDdNRDQwdHpmbDBlVThnZnNlbVdZM0hDQlRCeEswWG5oSG5OR3k2MVVOV3FYbVVvVUI0LWdjamgySDBJblRIT0hvOHR6YW90R3VtamVfc1U2YkVaSzh2THdhWkxwREdVNVlVSm9wS1h0bXhRQ1dvQWNSYUtJOERYN1JrZVh6REt1d25XbzdfNmJlRXZBQ2RYZUIzamlQLVJpWm55anFLTmRfeHBvd1M0S3BjOHBoeWdZblY4UV84Xy0zSmJZS203aUxRcGNhNW42VlkwSXVERmJvWW1SaDJDcnpLZ0lKOUhhZ3RjWnVscVNXWnRrYUpOd0lxTlMyT0xPQldWaU5QU0EuZUR4TTY5NkZlUUpOS19tVzZqN3Y0c2J3MTNpX1NQNUpBZG9Pd1YwWDVRTQ',
        hash_tarjeta:
            'Mjg1MDAwMDU2RFo3ZElEUFBXaXRLOVF5QXFmK1BoSUYzaU0rNXdCaVoyRWtKb2Zoa2x6bU8rbHZXMXQ0QUhBPT1RUjA1MlltNVNiR1ZJVVN0UVNGSndZbGRXVkdSSFJuUmpSRFI0VG1wak0wMXFWWGhOVkVrMFVFTTVNR0ZYTVd4Vk0xSm9ZbGhCSzFCSVRteGpNMDV3WWpJMEsxbHFTbXBPYlVwb1RXcFpkRTVFVlRCWmFUQXdUV3BSTWt4WFJtcFphbFYwVDFSRmVrNHlSbWhOZWxFMFRrUk5NRkJET1hwYVdFNTZZVmM1ZFZCcWQzWlpNamwxWkVkV05HUkVORGhrUjBaNVlXMVdNRmxVTkRoaWJsWjBXbGhLZGxCcVVYaE5SRVY1VFdwQmVFNUVTVEZQUkd0M1RVUlZPRXd5TlRGaVYxWjVZbm8wT0dSdFZuVlpNbXgwWVZkV2RXUkhPQ3ROUkVGM1RVTXdkMDFETUhkTlJIZDJaRzFXZFZreWJIUmhWMVoxWkVjNEsxQkRPVEJaV0VweFdsaFNhRkJxZDNaaFIwWjZZVVEwUFEua1RIeW9MUEJ3NDBJVzU0b2lyY3RvLVUzY2FDQ0lpbFdKRE1Dd19sXzJwcjJNM0VnTmhQOFlmVmZERG8tUllSeXVITzdoWmppMndKcktKa1BoWDl3Znc=',
        env: 'DEV',
    };
}

function callBlanqueoPINMOCK(token) {
    return { status: 'ok' };
}
