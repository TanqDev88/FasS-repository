function lambda(input, callback) {
    // Set conversation data.
    let conversation = input.payload;
    // Some processing ...
    // Result can be either an object or array.
    // Hint: Make sure to only return each type once.
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
