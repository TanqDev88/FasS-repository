function lambda(input, callback) {
    let conversation = input.payload;

    let result = [
        {
            type: "systemMessage",
            text: "Disculpá, debido a un imprevisto tu representante no podrá continuar atendiéndote en este momento.\nPor favor volvé a contactarte nuevamente.\nGracias por entender!"
        },
                {
            type: "closeConversation"
        }
    ];
    callback(null, result);
}
