module.exports = {
    input: {
        path: './src',
        include: ['**/*.vue', '**/*.js', '**/*.ts'],
        exclude: [],
    },
    output: {
        path: './src/language',
        potPath: 'messages.pot',
        jsonPath: 'translations.json',
        locales: ['fr', 'en', 'de', 'it'],
        flat: false,
        linguas: false,
    },
};
