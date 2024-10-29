//******************************************************************************************************/
//******                                     CHANGELOG                                            ******/
//******************************************************************************************************/
/**
 */

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

/************************************************/
/*                 CONFIGURATION                */
/************************************************/
const configAll = {
    DEV: {
        url_base_oath: 'https://servicios-test.macro.com.ar:8080',
        env: 'test',
        envCb: 'DEV',
    },
    PREP: {
        url_base_oath: 'https://servicios-prep.macro.com.ar:8080',
        env: 'prep',
        envCb: 'PREP',
    },
    PRD: {
        url_base_oath: 'https://servicios.macro.com.ar:8080',
        env: 'prod',
        envCb: 'PRD',
    },
};
/************************************************/
/*            CACHED SECRET VARIABLES           */
/************************************************/

let credentialsAll = {
    DEV: {
        cert: undefined,
        key: undefined,
        oauthToken: undefined,
        client_id: undefined,
        client_secret: undefined
    },
    PREP: {
        cert: undefined,
        key: undefined,
        oauthToken: undefined,
        client_id: undefined,
        client_secret: undefined
    },
    PRD: {
        cert: undefined,
        key: undefined,
        oauthToken: undefined,
        client_id: undefined,
        client_secret: undefined
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

        if (_.isEmpty(input.payload.refresh_token) || _.isEmpty(input.payload.env)) throw new Error('400.Bad request');

        const { refresh_token, env } = input.payload;

        const config = configAll[env];

        const data = await identityOathToken(refresh_token, config);
        //const data =  buildOkResponses(getMock());
        console.info("Invocacion exitosa")
        return callback(null, data);
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

async function identityOathToken(refresh_token, config) {
    const { cert, key, client_id, client_secret } = await lazyLoadCredentials(config);
    const client = Toolbelt.MTLSClient({ cert: cert, key: key });

    const token = 'Basic ' + buildAuthBase64(client_id, client_secret);
    const url = config.url_base_oath + '/identity/oauth/token';
    const headers = {
        Accept: 'application/json',
        Authorization: token,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    const formBody = buildFormForAccessToken(refresh_token);

    const { statusCode, body } = await client.post(url, headers, formBody, {
        allowSelfSigned: true,
    });
    
    //const {statusCode, body } = {statusCode: 400, body : '{"error":"invalid_grant"}'} // MOCK 400
    
    if (statusCode == 200) {
        if (!JSON.parse(body).access_token) throw new Error('No llego el token');
        return buildOkResponses(JSON.parse(body))
    }

    if (statusCode == 400) {
        return buildErrorResponses(statusCode, 'Refresh token vencido', JSON.parse(body));
    }

    throw new Error(`Error ${statusCode} al invocar API Oauth`);

}

/********************************************** */
/*               BUILD FUNCTIONS                */
/********************************************** */

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

function buildAuthBase64(clientId, clientSecret) {
    return Buffer.from(clientId + ':' + clientSecret).toString('base64');
}

function buildFormForAccessToken(refreshToken) {
    const details = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'openid'
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

/********************************************** */
/*               UTILS FUNCTIONS                */
/********************************************** */

function getErrorResponses(statusCode) {
    const errorCodes = { 400: 'BAD_REQUEST'};
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

/************************************************/
/*         LAZY LOADS SECRETS FUNCTIONS         */
/************************************************/

async function lazyLoadCredentials(config) {
    const ENV = config.env;
    console.debug('lazyLoadCredentials for  ' + ENV);
    const crd = credentialsAll[config.envCb];
    const isInCache = _.every(crd, (value) => !_.isEmpty(value));
    if (isInCache) {
        console.debug('lazyLoadCredentials from cache ');
        return crd;
    }
    console.debug('lazyLoadCredentials from service ');

    crd.cert = await loadSecretValue(`macro_cert_${ENV}`);
    crd.key = await loadSecretValue(`macro_key_${ENV}`);
    crd.oauthToken = await loadSecretValue(`macro_oauthToken_${ENV}`);
    crd.client_id = await loadSecretValue(`macro_client_id_v2_${ENV}`);
    crd.client_secret = await loadSecretValue(`macro_client_secret_v2_${ENV}`);

    credentialsAll[config.envCb] = crd;

    return crd;
}

async function loadSecretValue(key) {
    const { value } = await secretClient.readSecret(key);
    return value;
}

/********************************************** */
/*               MOCK FUNCTIONS                 */
/********************************************** */

// eslint-disable-next-line no-unused-vars
function getMockInput() {
    return {
        refresh_token: "ZXlKbGJtTWlPaUpCTWpVMlEwSkRMVWhUTlRFeUlpd2lZV3huSWpvaVpHbHlJaXdpWTNSNUlqb2lTbGRVSW4wLi5qcHdHLVFDVFFJMjViS1BES1lnQlVRLklKdUIzM09QUnVMTlhoM3h1aFV1aGV4WExQTlJEaVByZGFGMXp1clZMUmpLU20tVXY1R1M3eWlXcWtBTHJrZnBIZ2FhSDlvVWZHUjlCZGFEZDh5eGxlbHBFVm9lUjZGRW9ycDBjTkI5SV9QMWRIU0FWcGU4MC1oLTNyeHoyUkRPcUloYUhRYm5pOTZ5OEhkOXdWT241aEM2aFlFc1BoLVpoeFBwYWtNbHZKVmVZQ1E1VzNMMVBYamJ4ZlZNemFEcHB0Vjl5OURlalpGWXVVb25lWUJ4NkxQUkpzSVBoc0hPLWU1VHhqemh4QXlMNlA0RjZsRmo5MkxQWmV1X1JCWTlXaGw4bWl0dmVfYlpjZUdlNlBPOE9jaUtkc1Nfc1J5Qkpsalo4NjhPQzNNM1lUeXl1MWRVNExfaWFrUVVGanRtTWRuckZmSTZJMG11SU85VkxSV2NtWTRrUXYzTzREalRuVWw5ZDVXcTdKVDRFZDFNX05VbGZSVG1rTldZZGFhWTAtQUxsODRWTjlrOTNPMFVJakFMZ1QwZEV0TDVCNm1OWGo2dG80XzQzbms0ZlBtREY5cERtQXdyTmx2RjEtekpCMkNuV0pnOTZ5U01ZbEl0REd4ZmZ1TEwtVEtXUFJNd01GYmwteXJXNV9rTm11dFhYMVJlYmFCVVNVZFpNN3RCd1c2WFpvbXl3WU1CeE9pMFZKNWxDZkNEZ2VJbVVDUzEtRnNXUkJJOER5R2hZZ1hIbzlpM3lUZm1HSm1DSncyOTBBUTJ2UEFiTUJfRWVxZTRManhGc2puZkNuNmdXY1dWNG92TDRmN3NkNGVaME82bWNZM0NRcU1VaTFDbEtueG91emlXbTJMbV9GZTAyeGpkVnRZUTNvWUNheVVuTzBwZi1jNktkRDlheTlSMUZTZF9rdXBMSUt0Wl9vbmdJM0x4dVZkZ0VfZk9ONzI1M1JYZjA5WlNlTFJ3SVZEV3dlMVRzaDJmSE05SWJzR1ZRbjFKS29xWXFTVGlweFNIOF9hV2xNWFljVGlXOTJwUFFmbVFBY3h5UWlSSkd3SDA1NmsyTWdWTWh5N21ObHBQRmx4WjlUNThsalloWjFoZ0p4SFc2M3F0M0RTemh5MngtaVppT2xMVEZSeS03SHlLRGxlSmdQTUFmYkNnaEFYaEotZ2l1d3NubW9RVHl1R0hiZUZNRkVyVWZfMkMtZGdpa2Z2WmFVVzd1RURTelVpVktjWUNBZy1GTDdRM2c0aDR6RnJpNDAwTXJWTlVKbDNVcUo3Smd4LVRpalp6MVo2ZjFIa1JpYVduZnVIYkthYlJlaWJDV25lVzM1N1FuTk0weFFnSXVseGF5UE1OMFM5aE1CRk9pVldVUkNyZjhfbWtxcmxqb0ZLMXc5ZmhOT1RnOGtjSWpXTE5zV2hqME5pOVpjRnJ6RG1BSFJPdkxzQmZWMk5jUFZHVV9lcTNCWFQ4QWhHWGNLN2JVanZpQ2V3X0h1WkpuUHYtSU1RQ3lWRHl2eS1jSjVZWk1DUkcyRFhuaF94RmRjd05kVnIwcm5MUWpSUWk3eFloUHUzWnpMU0xhYkxLTmc5aHpsejViWGpOaXYtbXF5U0pKeUZVLWMwY2VjdC1Rc2VxY29KOGtqQW00VWNSeHhhVVNTSE1jYlNmVXBHRkpUYlJMVTEtcTZkVHQ1d3ZoWmxDRzN6OExQYVlIVDVhNVVrV2lJSjRNNXFhelRlLWtFbk9fcTlzTWZCa3M2V3IzdE1icHlkY0Q0Y200SUdfMEJFTklJaXdLTlF3WE8xYk5HUGlxNmVwQl9OWV8za2dXcDI5MW5aeTlndG83dkc1SFhIVnhQVmVkaC02eGJoc2VvOWtRYmZjVXhFNlFfbFRZQy00N2N2OTdTanRGTnQ5bWVuM1hZZ25lb3BwOWVDbEc2LTZtT1ZjeGVtZDB0MHlSNENiUVpvVGxYNkNERk96X1BQamVOT3BFdXBzUzhwd2Y3ejJMNUJISUlYaFJoeTgtQW1CamtjWUJKdHNnWEtrM2VuSTh4eGVPb25kTEFycGFXeWZtYzM4d1RjNHVuclY1NGdlaGdDd0k0YVczVHRmUzVZR1ZRWU04M00tcFRXWThnajNNY0lZa3hDaURjd0ZkUXE0M0o2M3E0c3NlV0JkLUNhbnN3VVpLQk51bzdrT1BicUNacHlBSTF3eExPZENKRG9JNk1lRmR3ZFFZTE8xX05abEtrdFJpcXJLNThZNzFRVUotUl9JczBWUE8xQmoxZGk0SUk0WTYwcjk2T2l3SlpZVkhDNDV2RWIwbzZ5UjlUdnhSdTh2Sm1vQXdtQmdoNnF3LU8xaDZXWk1BU3dNcFdfU3ZKTE1idUhjSzdTZFcwMWpnRVlieVRoSGZ5cURqcjJSVnFweXlvUmtCS3FVYjlzbTd1VnYwT2JmZkFsMmhEcFdFVC1MWGtCNXVjN2hLMUJ1UzNqRmdYWE5EVElyTzJXb2ZsRlRDQ1BrMkZWb19ZNUs2cXBHZVRTWXBoWUc3OTM5ZUlULXdpdmk2QVdwSURPRGkwamhXZWx3ZjlxSTFyOW8xWnZtWDVmVk9hRUNYeEhnQTgxUXY0UU9BWmF6UnI4Zm1mUndIQWNndW51dUJMdHJIbkN2MXp0Tjd1a1Z1SjQ1c2pybnBlNzdnNmZyYnZUNkloVGhib2w5MmFURWxVUkNGaXhyaEhtZW9kZ1Frb0NXUG9wMHNtT0ZNRXZrSXhkZ29BV0QyakFaaHpQaHBaRzhRYmtMY0lKUEV4NTRxZ0hCNmNuUUYtQkRzQTAxc0Fzc2RsdEhjMkdTQ3dlS3JHU3dKVENJSnNib3dHQ3Bpam9CMTlZUURMeHdZWVZqelpUbEVIaW1ncXRWNVNOdkpsbUpXOEF5N1MwUnNXLTc1S1RkVjRBTk90aGpaWWNaRmp2MXRJNjh3cmZoNWVCS3Q0VWJMWTZTaFdwOTlhc2FlSzM4TWJCUy15R0VhQWRjb2lfT3BlVWdwQ2stTTMyT1ZQTURpcndnak9iclB5LVFZSlZEaWEzeTVWaGtoUmJsN3E0eHhUUmd5NG1mM1lhaTIzZl81dHRZSFk5dTZKV3pxUWVDTndsMDMtblhya1pZUGMwWHBRWWJzZld3WjlQNDRsV3djTnJuWmd4QWhLb01JY2dab0hnRzhsZi1CQ0swSk9VR1NTR0xWYWw1VVpzWWlaU1RfVE9HRlhvbEFSVmg2MnJTbVd0THpDMW1qVWZhWWFsd2M0RW12SXBkUUtzNHktRDhucnNJUUZNdGx5N1NxSVlaMVZMVzkyZTJ3TWpjM0NzNWJHRlBWaC13NG5scjNmejRoMnhPaE5pOXpBbGpvOG1zSVlwdER0V0JlNUJQcFpjNkFjMFFBNVNyblNrSmNGUTBpbVNHbXA3T3AtdkFfQzd5NHJXRGRVeWJMZHNNb0xKWWgzS1k4WEJJVnBFc29BSGJ3WW56NFJBelREY0tRbkgyMEtMNmJTUDZZemhGNVVwbzFBbHphNG95R0I2SnhYRkhoQ3JLZGR6UXhST0hQZXFvOXkyZ2c4dmlNb3VrbDg2T2QxQ3o0OEJBTlcyVDJmbnR0N3pIc0F3UHdVX2JmcjBQYjQwUUFpOHY0blNrYy1xY25vTEs0cm1uVlQ0MlZKRFlLdTFzOHNFOVNKMlRMeEswc013YmpkREVxZFh1TnM0bkNGdW5XZ1dDdWFHV0Z6UEttZ2J4c3VpRkNwRS1qNjBJOUNfMTZEZHFWVk5iUG9qNmxfVnI2aDFmUXlraVlPMnh2ME9pSW1OeUVVUVRmY2cxalplTWlacFRrbUJsbERnVHBhUTdfZlhFdGpqaFBZeVVYYVRMTjZPNkphQWpqZDNySkNFV0Rtdlp2OXBYOHFnRFU2WU9rMFdfelRVa2xjb0JSOVpBZklRN1hJWklHT3FUYlNuZDQ1QUVnQ0JaQXI1cTdlam54YUQ2N0JyR05RY0tGWDRMd3llVU9HTmZoVkxkS1FYekViQS15M3N1MUJQVEhuanBwa25GMXgyZmt4dXlvbHVPV01ucEdOMHhTRDh5eGxnTk91OEdUZGVwcGpFYjV4ODBSQm1KUmlOWGVUZGpDeHBfal9ENnlCSzNiSHBsTWcyYWoybUx6VVVTTGh5cVlGVTNGbTdkMUdVT0hSd3F4cnpFYmhaUGVxbjlTd1JUbFU2VWRocTQwOVgyTzFuSDJ3U1V2TFlYUDR5LTYzem9OLWRrcUdVeWxqMTRHSjZ2Y0M5T2p2SUYxUnZuRUtSTFMtcVhDT3F4WWtLOXNZamEyTV9tai1GeVJlMUc2QzlIekplTmJNd2oxVUlEdEgzWUxHdWx0VmZuZUNsTXdrZmlUWUdNUElNaGJTdE5DR2dvUXNEajBLdFVwYWJWR2RFZEpsVXdoc1dmYjE1THFnWlZfR3hoRTBaWVRCTVdTaldfQ2NhR2FjVHZVNUd3WXVyeDJSZnRHN3pXbUN0czJHbkdxLTN0ZE52R1dkcjRpVnBXc0F1LVliVUtPM28wSTFhSjVBclVLUS1pZ05BQ2FDU1BBYkdsV3haS1ZZWXo0bktJb0NXTmFtcFBqSGlQaExUSDB5ZnY4R05yWEJxZ0txSjh2SHlqNlZEQVRwdmpFeTBtRmdsRng0WTFReWxqb01yeDlOMHZITWtUWnZvbWhTUGlTaTlOUWtQaU81QU5GUTlPXzBiSXA4UEdTdFN4dzJjbWt3X0NQLTlpVGJYd1BVRzNsNmNHeGV2czVWQkl2M2FLTml5dGc3RzR0UUdwSXFvYWFVYm5IaEFadW9HTHlEa3B1RkJOQlhsNktYcVotYmdEMDNyTzUwVE9sc2lqSWt4ZGExTUhWdGZEcWdQQ3JwQzczcHZWaVcwNGt3c01uaG83MDFIeHZvY3pHUERuT0dVTTRJRUhlaWNDYkNCY0N3Y20taGtWcWV2cTY2enNObkxrcE5wcWVYeldwUUhJckxoUEVkcEtWa243THZkOFFVRkJ0eW1DaUlSV09vWE9UQzBQOVRJdVZQWU8tUm4xckhIMWJEY2E1SFBNenBOTmZBX3ZLc0V6WmcyUlNqSzAzemVab1h3NzJFRUtzR2ZyRmlvUEZDNndBZ0E1RVJTampIT1dhWGxqbUlwVkI3blgwR2JxVjByVlRIbm5ZVUhFaG5CTnhzVzQxZ2JmTXdGbjM5d0VmNE9oN185WGRBYzlRaFRtY21tTGV1TUR6UkZIUmhsclJvWjh3TkRSMUg5M3ZwdEp4QmZEQVZaSk9SZTVnZUJIYmxOeHJQeEE5bzExaGpUbnh4a0Z0QmVKMGRXOWlZcGZFYVdYZDJCNnl3TlJvbU5KbkFBeEpGcTNPSWV2cWJCdS1Rc3BFd3VPVF9vU0FMNmNQNlRrbEpQUnRsaWw1aDl5cFJ4RjZwUmZHSFJ1TFMxMHp5Rm9EX1dqNERadXR3S0JBQUVNZGtwLUFKU3FYRkNGTWhYRC03UmhON0laME9jOGRpVjBMSkpMeElPSnQ0eFVjRThpejlaWXMwV0VhNXc4b3NVTXo2V0ZPaHdtMlZIdjlhMUJIaWZqRVByRGFWLWRBYU9NaU9xdkpQWFBIdXB2SUp1RmJCdXBFUEtrNVhNTHVmSkoxdzh1OUZRa1p4NnN3V1JKby1nNVRRYVA4c2JhMjY0NE1YRGw3eklxN2ZhTEdUekl6S2E2ZGtHcXUzdFZUMWdROTBwTnE3TVNIaXQtdVBqNWtsWDRUbkVwV19jR1laN3cyWm9zdFFMWExYTVhIbHhIY25GQTBCSlQ0ZHdZSzFoZmVneWdycnpiWHc1SGxSeXZCcFU0NUYzVUtyUWdaekNYUUVvUEFwUVo5R0F0dFpEZW01MVFqMEYxbXRxVWRjLXQ3ajA0V2cxemFIMC1hWFFUdEdwdVZnQWMxT3IzcGJzQUJQY21QWEl6TVBTeXVPa3k0V2tGUGNBbDdqSTFmdjlPemd5QVlvVk9PS2ZDTVBxdjF1QTBkSTlaTmUxRFMzNEZQVGlPemRHbnpFbjA5bm54RTlWdy1PWDltWlVTcldFOWF2SmtXWnZtVGYxcVlqLWdaQ1RPVDhFUVNWRHk1Si04Rnl6S2VaRWlUX1VBdkVHSXBkUDFZTnJxTFRDUXU2RVRETTlFSFVUTktQdXIzNS1uYThTZnMxVW10OG5vNjFxeEk5RGNZV0hTOHJDYUpNT0tCamw0c24tSlBKWjIwWWJCU2RzSTFtZDN2V0ZMcDVDLU1EUnVXbi10cXlycUtUeGZaU3EzWjNUVTU3NkFYM3d1Yk5wZEFwZV9mZnJ2RW1zM2dMNkh0SXFUel90WmE3cHRVQ0Y5cVlQLUYta2IzU3pKM2xYMTQ2aGxoNDFPTDF0dDNWSXUxdTM2QTM2NVl0c0x6XzNkdzYzVTVxMm1IMG1SeWNxX2x0enNlc3NfM2lFNVBsWTZlWGNVa2w4dWluRlRNdGY4ZVlGbWVCb0xWNVVobVM1YW5CbWJhdkNObnh4X09NclFTdmNiVGczZjVWdGNqbWRUeER6SDg2ZVhyVWdmZ2liSkc1NmM0SkpieGpxbWNwWklNQzY4SkU1VXpOaDJwaENsRlJUakwyamctOUpvRUhqNlNWU3R1dVNRR0U2RmVvaS1PY2FobG5IWUhRckFleXRyblpuN2FydlJnY3JtcEdSMThLOTJYeFNYXzA5LXE3TGVXQlBXSzJmU0hramVwRHhhTWY0OUd5UWNaMkNhQVZXQVdweXpYRlJPYW9lYWtFSXplbm5QMzdaUUxxdkZXZEtuZjZlNzNydFJ6dU5wTDBPQjNDcHJkYlBaRmsxLW55eXEyT3FwekFJLUhIN2lWa01DRFdSSWNleVh0QU9iMkN0aUtDdzlsWGc0dFdIcUppLU9SLUtaMWV3YTJYZF9lMzZ2VDNWNUsybUpKZmdIZ0xULWtEMm95UEFWYl9hak9GM0R2Yklnc0h5aUlzeFhNSWFvQklOR3BhVDhmNWdqWDlhVWltUnVMRklGVEJ4NG5qMTJObDJlb3V4ZmhDbFhjTXVERzFMZkxYdTItSFhUZzd0LXZJLUpPbkdEZ1FlQWRXbUY1MEZ4Z1B4WFRCdVFIbGdORDZZQ1Y3bnlXT2dCRmpLX1ZTZXd6RklLZDZyWmNmUnYxWXE5d2Rhc1N2bFRoNGxfZ1dBUWozWU9pcGJsXy01cldlbWdfR0xzbXBTc2luTmJkaFhnTzJ5ZnM1QllINWotazVJOVYyVXRJMzkxUWJrbVpjemNMcGN4Vld0aDR2U2pja0RjRGJFYTNZWHlLc1prSGtZS2lNaElBMWY2NFdaYmpFUllvRWtxSGxtdHZTZ2ttN1RQNDJNWFIyeVpiT3ktdktpZ2J6dWpTMUI0RWpuc2lNY1F0YnFXMGY1STdpSm9DMU90bnYtWTBTSk9RVGtNYm9vSHhzcHB3TW5hRlVRSHIwb3RpUnkwWHkyNUN6TFl1X3pFb3pWOW8yWFlJalZOQTRZTUk4V01PbDZKc3REUkk2S3N4SkdkRjl0TkdGbU1UYVg0TV9vcXFBbWVyVzg3Z1Q1QmtIVE8xSjRGRGFkdHZqNzYyaF94NjBPZDVNamVfamVqbml3cmNIZWpic3lqTXpqVzBHaFE3bGRzbHgwVGVBeUhaWWJ6eXozY0ZnRFZFd1d4cVotdWFPS1RnN0dlTHZQeTNWcVRnREQteEYtNHJvbEJsNFBkcEZialduc1lZWkdmWENINzloWFo4NmFrSmJpVmVhaFJDUFlLQlAtNlp2eFlrVHpnUElTRHFkUmVrNDVyYkVLcExpNFpURHVUMWFwM2JxcVlpUTc1S21kc2ROb0xLb3FWZjVac3pGVHZTU2d6VHhKNHpCOXhRTS13VVc5OUw0YUk5YmJCM0lJUnJzcE9SYlFGYndpenRZbHFrVWM0QkpNSGhZUUdlcjNWSU13VlJjdDVtREpRTUV2MjlsM080Q1RyNHBiME4xX0NUZHRXLVNjTnNIVVBJMjdJNHFJVjBKeXJ3MU13aUJBTy1nTlJPaEZfbGU2X0RlY1dYTk1sQlFyejRHekZ6eE0tQTNuZkFZNkxsdzZDVFFvY3BTX2xmWFdfTXFOZmdzQ1RWWE13cDJORG9ObnlmdjRvZHlLSkZlZ0FsRFp1Y2ZhWXVsRERpQkU2Yzk5M1JwRjhfVUdDbjJfRV94V2ZubW9IVFl4NXdCN1NPanNJQXlsR1BnUlFickVwalJtV01IM3M5MlVDYmU0TnJoZDhraDcyaTlOaVk1UEtQSnkzendJeHlvamJMdFJVQVc1dXgweXk1N3BHMEhFQ3ZydG5KOUVROGJHUDNicERONkJraHl2LTAydlFwbjExY0lmSFpkMkR6SnBLdVNybF9iVWFsbjA5eU82NjRUSENMRTJDVTlrNlVfQk1LREUtSmlVVXhLUUtEU0FNaXN4MHBMV3B0SEczbkZlWWx1cnZKRldwTjRxX0JOdHUyWWhheDg2MWFOREZfbGowbng4cERzWUo2YWZnckpDTGdZSDF1TW8tRDVtSHVWT0o3Tk51QndVMDF5Z0ZNYzVYSGM0bUVFUkJyc1lWc2VBVDl4M1JXbDhUeWcycHpOZGtQeXphR2JPWE1pTjhRRFNzQkVzUDAydzRDbVFuaWpwR0hqOHR3SUpuMzhDSm9vNklTVXJHLVJwNEVha3hwTEFBdXNHTVVyNU1hdkhveHVkVC1Zbm1DdFROWnZsVkdjdC0xVS1zdFJtWklYN3ZlQm82OHZXWTVGZ3VvSDdrcmJWSGRuMTlwTXhIVnVLdlhNZzdXZWpoVWdvWVZWVWIxZW90NU9FUWg5czZ4NlFSaEM1eUNET2NIVWI5amlQdllwR3ZaeGZUUXUyT0t4SkZfRmJ0TU5BbER1bTA1NHJKYVFvNGNpdWlzMkZDZDRORm9jMnlpOXJnbXpoWllBZk1PWTVvTzIyTmEtLXZwZktHbWotTDluV3kzMXNRX21qY0prLUVZM0VXTm94MkotV21pYVZXMEY0TE9RbVIyQ0dJbmxRRFpWWS05ZUVJaEpVb2hzU0h1OGlnLURla28zQW9qTzg5cFYxQXRXbHB2UlJqR3QxS0hWZzFqQ1V5Z2FiT2pWc1lrUWh5QU1FTklqZkRYV0NWWjJLTVV4eDBlZVdYanRxZWg0T29BaTBlWEh2YlRTN1NmYVN2RWt4c014dEYyNnQ0TUJaWmpBdXVwbGhxeUozMFF0Wno3NnFWOUlKU3l3RDJEMXItYkJKa1hfYy1CX2VKVms1NVA5QnRSLW1hMzBhMTB3OVFLNHVzd0ZQclhuQlY1Z3VUMDdHQmVZYTVVbkFUanFLSGhvWHY2cFNEWVZKNTM2NVhxZUFwQ0NfVkhtajJhajVYOG94anJ0ZkV2MGROd3dnWUZEa1ZjaHZuVmMyS0NRZGx4dEo1ZmNSdWVSUmViNDJvajBGUGYzOC0zUmhRYXhqUm9DMHdDcEljSEw5VXkwaFNmcVB5MmhnRW93NTg5TC1wX1pYckFZeWdPRFAxTDBZRXh3cUg5TkU1bG9EanV6enlfT3hvSFQzZk1TNTRMOEQyS1RHbjIzLWJrRm8yQmJQYnIwMFlVaVJQZDVXQklvdHhKRjA0b0JtblZ6WDRmY2tRRTlUWUN1ZGFRcWZLR2c0blJZNnpMbWFXQnFhLW1aR0xXQ0Vtd19UM3lnZXR0bEw1dDQ3VTZEY3Q5cE1UUkpfclFzbjBaaVJzRUxSV1I4dFVOMUs2U2JHbkpPWkRwVGdKQ0M4NV8yWW9zX3VzanNJQkFnMXREamMxMDJYZ3ZjRXpsTkNFa3J0cDBib2JwbTNIZ25Xc09VWDlManVRcU9ueVNJZTNDcFFfYjBrcnB5aFJTX3kzVUJoWDkwMHgtQ05HMnhXWmh0NGlpMnI3cE13R3d1YWpaaFJPMDRfY0E0OHc1cUJtM1lQYVNWQ2lEUlVldUNYMzhSNTk5Tng3b3pocHBuTHp6MWV0V184RTdYYURiWGNPZkRKcF9YZGJ5OEFvRXlsbUJmMkJoSEVvZ2U4MEp4cFNLQ3ZSZFhjUzF6MGd4ZEVIMXNoVXhXZWpwVjFXVWQ4YzJYYXFCckh1QmU4TDk0b3ZPZk9pb1JhanpGam9ia0R6YVZwaHZuQmVFSjN4WHZhM3BtaTNBdWpWa3VmaHJGSjduZUVnUWZHakcxRm5JQ0NfUXNkU0VmWVJjR2xZa1hhS3NmekJMZUJOVndFOW1nRjNscXZ6YmF1YmdaVTliNUg2b0NEa3VTVWNwNUJVLWcyR1ZrRFppQk91a0U2NWlncDB2ZkdBNnpiNkxERnktZzdNaUpDeko1b2lfTzRQSVJDM3g5TnlhbmZoX3F5WW5JOS1KVkQyQl9pOHRoRWdodXI2ajEtZWtxVU1VaE1jeUVCQThJQUZnY1ZhTDI3X0VJVThkS2wya2ZyRU1QQzltOHZCXzZKY0dOeFdLbS1zRlJndTl6TDZCbjc1RVhYeHRQZXExaWt2a19BbG5EV1JGOHlieXJLLTJELUxNNmZPWlFQWG9PNFNBc1ZLVndWZzdvc3hJc2VjTmZscVR6SVhic1h1dEU2NDNlSnVkc1kxVExGN3E5NThVMjZPczJWS0V4ZlB2Xy1CS3hxYzNIdEotZ2hHWEpvUmxLa0Z2bjA2LWI0dEx5eHRyYkJFT2pjVS11NlFabF9PTzhpWjVpeTlwSW5GUVl5VDBhTHBKVlFfSlNKWmZxdjVvVHB0OTRKWDIyMFVXWGVHR3JMOUVMN0VFNUV1MVdwQ2F6b000X2FRZjVDZnlQSmZyMFhTeXVDSDBuNFp2blV2NDIzcXFTZzBER0tZQlExQUpIVHczQml5NG9ucDVaNVVvZTdCX0JHQThaTmxPSWhnVnlRc3FSOWd2ajJNNmpPZ3lfSUgzemtFM25tenpOelA5cERWb2dndWFVd0J6YjJEbXlaUlZhNlVuZ2tJbnZtbUx3RmZZNlRJQ1VSOHJUUnFBaTQ2Y0lUVkdpT3llMmNNYTc4UlFsTlY1QlBmNDdDdUJRVXAtQWpSZXk5cXMwZnVjOV9SYU5IaURfREFCOXB6Skxyd05VOHk0dTUySUlCZG1KRVhvdzRjTkFpaUtpdExNYUczS21yeWxfdlpGMzl2NUJLQk5ENUlWa3ZGUXRLWGNRVFBDb0UtRC1Wd05EMWFDRFctQmdBSUZKQklrQld2VnVGMF81dEFJbWE1bzdvclA0djlFYkEyWDU1THp2eXhxclR4dnQ0Tkwya003SGdXS2lxbTNFNWQ4U0tGbVF0bXM4MmpKdmJvRkJudGxUR1ptWHg1UTU2SC14X0V3SVlQNFhWdm42aGpVWnNpdVdoU2FsOXNRelhQRlFTek0zbW4xaFlaY1NaZkthWlA4dzFiaDhKd1BZNndxNEFSdlAzRVQ2dm9xMHQ4QW80R2tSd1pEOVV0blUzaF9kTEFldUN0cmQ2NlJmb0xtY2t5WUtTa09wSTFFWUM1VDBrek1mUnJtQ0RiRDF1dDFyeU5xWFg2bHdQY2ZXLVVqTGhncENqSk1hc29nSHhaUEZnd09BVUJiMlduSVZaZHN3ZjVhTTU0RVM5U0Zrb041TEFpdS16SDFaTHQtdjBhdUowdXdVR2dTTzgyclduVG14ZU5VRDF3aWZnb1BNbFU0UnRmcmEtWUZlc0F3TU9SSEJtM2FzV3dEb2hDNkFvUWFIRVlQZHhoeHdFbm5FbllWdlNwVjRscUhJTTJFM3dXaFFkSzNBWkUwSUhxV3F3RWN0X2IyektBWldMcEZHdHRkRG9oUldncS1Ic0EtM2FEQnExZ0hGREppLXpYMzJ4c19yTV82ZjU2RHVabVZkN2d1MjJxWlQ2U0k4dG16SGpsWFphd3BZdmlYUEYyNEVpVXNad2VKaWluWGhDLUNCMnoxWkxsQm43Uml4U3VWenRobmpKSmFGSjBrS2hXemJSbDJUWS1OdlVGWUNXTHkwcnFZSDJrY3RLbWlUamV6SnRDSGhoRF9fc1JDRHpnMmpxQ3dueDg5WmFtLUVlVk9SdEk1SVZuVG1YZHdoY2pKUDBzWFlRT0RTbzZxMGpud19LNWsydUkwREhyWnhHVmZpTDVJZF9ZWHRZdzU3S0RrQTJZeHNTZ3BabHZ0eVBYWUpTcG1CUGZhSG1qVHFUemlaMHBoZUxXRmxFU0Q3MklrRkJvSzZoOUEzeEhyUXpadi1KbmFfYzZzNmJDQldZME0yLTFBSWdpeTVSN2N1dDFLSTRiOTZQaFpLOUw0TEdSc29xLXRZNFhHQkJUVUFuXzNoYUsyUlRTY1gycnlQanRseXhiSUVMc05ZZXNtMWFTZzFKVGtqdG81WTJ6ai1KUnVrVEFnUHR2QnFuQS0waTdTSmR0U0FSTm5QT29nZXZnbVQ5VE84QlhsZ0xMNE5tZnI5NGVEOC0tR1RkdEJ4Zi1uQ3ZORnIxVjdqbmpwbEZmRlFjV25jZEdyUWR6b05fSmlDNXZxSV80ZXdlSi1YS0hkdkg1ekxZSmI3LWhERUxsd1VkSk0tRWxqeC00T0tZeFlQTW5ibkUycmNqRXpFV0JxaW9RSHlibXVialRhTnN4Y1hiVTFWMUJwU0VXWUJkTVA0SnNiSnh3UjhwSzVaVFI0dGRHRHVZbXNreUFNaDktU2dZbkdob01RR3c4Q1RRTlJ5X2hWT0NweGZZd2ZMNEVfMTlJdm9nMFNwRFIybTJOcVRlbGllT3ZxNWxWOWVOS1JTeDVHVFdXV2FhbVVKRkY0ajFqVF9uSnllV2dEZFpZUDZULXhlM3JzRlk2NEpZcnZUTk1pM09oSUJ6bWc0MVhsWjQwMzZGNUFZZWRFWWVBbl9PZGRTUzJYQ3hqUENGdjAwRUZidndOS0xEbU9nMGxSeEpLNHJFcW9MOFRYMmdScUdnN0p4YjlOdHVGMzVoTC05WVI4SFVpckhoQUFQakp1R1BGU3FxTEVudWo5RVlPSUlOWllubS1KV0V4aUxRWTBJUUFjMmptNjdyam1iVnVSVXl0ekFzcTlkTG8tSWxiQ19SY2N2SVJUYlZRRFJjY0JEYUdEVjdBd2d2aHdLcEx6Ukg5Qk5RdVRmRjJoc3pFTDE2Q0VlcnZZd0g5Q2RBQWQxSmx6S3VrdGRZZVVySEYycDVIRW1zcHNHamw2VTZWdER3MTFwbmdrZzBMTWx1dzdjOVZWZUdQRl84OEFaamE4V1hSazRINW94WUUyRW9VXzBvaXU3dURSTGR0M1o2WUwtZDNaRC1YUnFMbU11cmdjck1od2lCTE9ObnZ4d3pIUVM3Q1UxUFdOQ2JhYVh4M1BFZjg2aXR3eXFITndoamxDM0w2c2JWNWJ2NWJYZ2dxZ2VCb0NvNVZ3bWNzbld0UWMxbHVRc3luenFTUEt5Y3RLandDNC1BOGNTQ1lMU3lmNGRYQk9CNm5yVGpTZHFYQUc5SktIV1J0S2ZQMG9wQWZmenZmUDNxZmp1Um9wclFFalhhb2lXSEFKeXlicGpXdDM0SV9ncERSYXhIZEZGcEVzM2hraUVxN0lJWk9LX0VISGVJUFVpTWIybTVDdGpIR0IxWmhrRkZoM0Q0NDZPSFpfMUtzUmVZeXRtXzR3bmI3UjRVdV8yWHhOV3puVFN5d2pIM2hEQk4zNllWcjlQNzY0MkFpOHhuSHZTeUt0bFJIWEJxUTMxTDlSbllsLUFYMmJqSWdTWEVJWW9rLkdiS0RqVUVYZzloQWxHWURnWk4wWUtRRmREVWZPOXNFa0RLOEYyYjhqWGc=",
        env: "DEV"
    };
}
// eslint-disable-next-line no-unused-vars
function getMock() {
    return {
        "access_token": "dfsafasdfasdfadfdsgasdgasdgaa",
    }
}