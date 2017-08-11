function File(content, name, options) {
  var blob = new Blob(content)
  this._blob = blob
  this.size = blob.size
  this.type = blob.type
  this.name = name
  this.lastModifiedDate = new Date()
  this.lastModified = this.lastModifiedDate.getTime()
  if (options) {
    for (var k in options) {
      this[k] = options[k]
    }
  }
}

File.prototype = {
  constructor: File,
  slice: function () {
    return this._blob.slice.apply(this._blob, arguments)
  }
}

window.File = File
