function lambda(input, callback) {
    try {
        let conversation = input.payload;
        console.debug('payload', input.payload);
        console.info('conversation', conversation);
        let result = [
            {
                type: "systemMessage",
                text: "Disculpá, tu representante está con demoras por fuera de lo habitual.\nTe pido que vuelvas a intentarlo en otro momento.\n¡Gracias por entender!" // Mensaje enviado al usuario.
            },
            {
                type: "closeConversation"
            }
        ];
        console.info('Fin del procesamiento.')
        return callback(null, result);
    } catch (error) {
        console.error('Error', error);
        return callback(error, null);
    }
}
