var Uploader = require('../../../src/uploader')

describe('fileRemoved event', function () {
  var uploader

  beforeEach(function () {
    uploader = new Uploader({
      generateUniqueIdentifier: function (file) {
        return file.size
      }
    })
  })

  it('should call fileRemoved event on uploader.removeFile', function () {
    var valid = false
    var removedFile = null
    uploader.on('fileRemoved', function (file) {
      expect(file.file instanceof File).toBeTruthy()
      removedFile = file
      valid = true
    })
    uploader.addFile(new File(['file part'], 'test'))
    var addedFile = uploader.files[0]
    uploader.removeFile(addedFile)
    expect(removedFile).toBe(addedFile)
    expect(valid).toBeTruthy()
  })
  
  it('should call fileRemoved event uploaderFile.cancel', function () {
    var valid = false
    var removedFile = null
    uploader.on('fileRemoved', function (file) {
      expect(file.file instanceof File).toBeTruthy()
      removedFile = file
      valid = true
    })
    uploader.addFile(new File(['file part'], 'test'))
    var addedFile = uploader.files[0]
    addedFile.cancel()
    expect(removedFile).toBe(addedFile)
    expect(valid).toBeTruthy()
  })
})
