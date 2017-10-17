var Uploader = require('../../../src/uploader')

describe('fileAdd event', function () {
  var uploader

  beforeEach(function () {
    uploader = new Uploader({
      generateUniqueIdentifier: function (file) {
        return file.size
      }
    })
  })

  it('should call fileAdded event', function () {
    var valid = false
    uploader.on('fileAdded', function (file) {
      expect(file.file instanceof File).toBeTruthy()
      valid = true
    })
    uploader.addFile(new File(['file part'], 'testfile'))
    expect(valid).toBeTruthy()
  })

  it('should call filesAdded event', function () {
    var count = 0
    uploader.on('filesAdded', function (files) {
      count = files.length
    })
    uploader.addFiles([
      new File(['file part'], 'testfile'),
      new File(['file 2 part'], 'testfile2')
    ])
    expect(count).toBe(2)
    expect(uploader.files.length).toBe(2)
  })

  it('should validate fileAdded', function () {
    uploader.on('fileAdded', function () {
      return false
    })
    uploader.addFile(new File(['file part'], 'test'))
    expect(uploader.files.length).toBe(0)
    expect(uploader.fileList.length).toBe(0)
  })

  it('should validate filesAdded', function () {
    uploader.on('filesAdded', function () {
      return false
    })
    uploader.addFile(new File(['file part'], 'test'))
    expect(uploader.files.length).toBe(0)
    expect(uploader.fileList.length).toBe(0)
  })

  it('should validate fileAdded and filesAdded', function () {
    uploader.on('fileAdded', function () {
      return false
    })
    var valid = false
    uploader.on('filesAdded', function (files) {
      valid = files.length === 0
    })
    uploader.addFile(new File(['file part'], 'test'))
    expect(valid).toBeTruthy()
  })
})
