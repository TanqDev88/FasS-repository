function lambda(input, callback) {
    try{
        console.debug('payload', input.payload);
        let conversation = input.payload;
        console.info('conversation', conversation);
        let result = [
            {
                type: "systemMessage", 
                text: "El equipo que resuelve las consultas de *Macro* está disponible de *lunes a viernes de 8 a 20 horas*.\n TEST PAPO"
            },
            {
                type: "closeConversation" 
            }
        ];
        console.info('Fin del procesamiento de autocloseMessagingOff_Hours.')
        callback(null, result);
    } catch (error) {
        console.error('Error', error);
        return callback(error, null);
    }
}