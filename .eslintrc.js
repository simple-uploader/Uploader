module.exports = {
  env: {
    node: true,
    browser: true
  },
  extends: 'standard',
  rules: {
    // allow paren-less arrow functions
    'arrow-parens': 0,
    // allow async-await
    'generator-star-spacing': 0,
    'no-tabs': 0,
    'space-before-function-paren': 0
  }
}
