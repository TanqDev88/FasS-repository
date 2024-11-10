const { Toolbelt } = require("lp-faas-toolbelt");
const _ = require('lodash');

async function lambda(input, callback) {
    const userCuil = input.payload.cuil;
    const API_URL = "https://europe-central2-macro-350416.cloudfunctions.net/dolar-mep-mock/clientes/beneficios";

    try {
        if (!userCuil) {
            console.error('Error: cuil is required');
            return callback(null, { statusCode: 400, message: 'Bad Request: cuil is required' });
        }

        const urlWithParams = `${API_URL}?cuil=${encodeURIComponent(userCuil)}`;

        const token = 'mock';
        const httpClient = Toolbelt.HTTPClient();

        const response = await httpClient(urlWithParams, {
            method: 'GET',
            headers: {
                'Authorization': token
            },
            json: true,
            simple: false,
            resolveWithFullResponse: true,
        });

        console.info('Response:', response);

      
        if (response.statusCode === 404) {
            return callback(null, { statusCode: 404, message: 'No es beneficiario' });
        } else if (response.statusCode !== 200) {
            throw {
                statusCode: response.statusCode,
                message: response.body || 'Unexpected error'
            };
        }

        return callback(null, response.body);

    } catch (error) {
        console.error('Detailed Error:', error);

        const statusCode = error.statusCode || 500;
        const errorMessage = error.message || 'Internal Server Error';

        return callback(null, { statusCode: statusCode, message: `Error: ${errorMessage}` });
    }
}